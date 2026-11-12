import { db } from "@/lib/db";
import { CODIGOS_LOJA, lojaDoContrato, siglaDaLoja } from "@/lib/lojas";
import { median, timelineKey, timelinePoints, timelineUnit, type PainelFilters } from "@/lib/painel";

export const LOJA_NAO_IDENTIFICADA = "Não identificada";

/** Lotes emitidos no período e no recorte dos filtros (loja = sigla inicial do contrato). */
function lotesWhere(filters: PainelFilters) {
  const sigla = siglaDaLoja(filters.loja);
  return {
    dataCriacao: { gte: filters.from, ...(filters.to ? { lt: filters.to } : {}) },
    ...(filters.situacao ? { status: filters.situacao } : {}),
    ...(filters.etapa ? { etapaRegua: filters.etapa } : {}),
    ...(sigla ? { numeroContrato: { startsWith: sigla, mode: "insensitive" as const } } : {}),
  };
}

export type LotePainel = {
  id: number;
  numeroContrato: string;
  nomeCliente: string | null;
  status: string;
  etapaRegua: string;
  valorFinalCentavos: number;
  quantidadePassagens: number;
  dataCriacao: Date;
  dataPagamento: Date | null;
  formaPagamento: string | null;
  valorRecebidoCentavos: number | null;
  baixaManual: boolean;
  loja: string;
};

export async function loadLotes(filters: PainelFilters): Promise<LotePainel[]> {
  const rows = await db.loteCobranca.findMany({
    where: lotesWhere(filters),
    orderBy: { dataCriacao: "desc" },
    select: {
      id: true,
      numeroContrato: true,
      nomeCliente: true,
      status: true,
      etapaRegua: true,
      valorFinalCentavos: true,
      quantidadePassagens: true,
      dataCriacao: true,
      dataPagamento: true,
      formaPagamento: true,
      valorRecebidoCentavos: true,
      baixaManual: true,
    },
  });
  return rows.map((lote) => ({ ...lote, loja: lojaDoContrato(lote.numeroContrato) ?? LOJA_NAO_IDENTIFICADA }));
}

export type Totais = {
  lotes: number;
  passagens: number;
  cobradoCentavos: number;
  recebidoCentavos: number;
  abertoCentavos: number;
  pagos: number;
  /** Lotes pagos por baixa manual (PIX, depósito, acordo…). */
  baixasManuais: number;
  /** Diferença entre o devido e o recebido nos lotes pagos com desconto (acordo). */
  descontoCentavos: number;
  inadimplentes: number;
  emRegua: number;
  /** Lotes cancelados (não entram no cobrado nem no em aberto). */
  cancelados: number;
  canceladoCentavos: number;
  /** Mediana do tempo entre a emissão e o pagamento, em segundos. */
  tempoPagamentoSeg: number | null;
};

export function totalizar(lotes: LotePainel[]): Totais {
  const pagos = lotes.filter((l) => l.status === "PAGO");
  const tempos = pagos
    .filter((l) => l.dataPagamento)
    .map((l) => Math.max(0, (l.dataPagamento!.getTime() - l.dataCriacao.getTime()) / 1000));
  const validos = lotes.filter((l) => l.status !== "CANCELADO");
  const cancelados = lotes.filter((l) => l.status === "CANCELADO");
  const cobrado = validos.reduce((s, l) => s + l.valorFinalCentavos, 0);
  const recebidoDe = (l: LotePainel) => l.valorRecebidoCentavos ?? l.valorFinalCentavos;
  const recebido = pagos.reduce((s, l) => s + recebidoDe(l), 0);
  const desconto = pagos.reduce((s, l) => s + Math.max(0, l.valorFinalCentavos - recebidoDe(l)), 0);
  return {
    lotes: lotes.length,
    passagens: lotes.reduce((s, l) => s + l.quantidadePassagens, 0),
    cobradoCentavos: cobrado,
    recebidoCentavos: recebido,
    abertoCentavos: lotes.filter((l) => l.status === "EM_REGUA" || l.status === "INADIMPLENTE").reduce((s, l) => s + l.valorFinalCentavos, 0),
    pagos: pagos.length,
    baixasManuais: pagos.filter((l) => l.baixaManual).length,
    descontoCentavos: desconto,
    inadimplentes: lotes.filter((l) => l.status === "INADIMPLENTE").length,
    emRegua: lotes.filter((l) => l.status === "EM_REGUA").length,
    cancelados: cancelados.length,
    canceladoCentavos: cancelados.reduce((s, l) => s + l.valorFinalCentavos, 0),
    tempoPagamentoSeg: median(tempos),
  };
}

/** Totais por loja, da que mais cobrou para a que menos cobrou. */
export function porLoja(lotes: LotePainel[]) {
  const grupos = new Map<string, LotePainel[]>();
  for (const lote of lotes) grupos.set(lote.loja, [...(grupos.get(lote.loja) ?? []), lote]);
  return [...grupos]
    .map(([loja, itens]) => ({ loja, ...totalizar(itens) }))
    .sort((a, b) => b.cobradoCentavos - a.cobradoCentavos || a.loja.localeCompare(b.loja));
}

/** Lotes emitidos por hora, dia, semana ou mês, conforme o tamanho do período. */
export function linhaDoTempo(lotes: LotePainel[], filters: PainelFilters, now = new Date()) {
  const to = filters.to ?? now;
  const from = filters.period === "personalizado" && !filters.de && lotes.length ? lotes[lotes.length - 1].dataCriacao : filters.from;
  const unit = timelineUnit(from, to);
  const totals = new Map<string, number>();
  for (const lote of lotes) {
    const key = timelineKey(lote.dataCriacao, unit);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return { unit, points: timelinePoints(from, to, unit, totals) };
}

/** Lojas da Foco para o filtro (lista oficial). */
export function listarLojas() {
  return CODIGOS_LOJA;
}

/** Inadimplentes de qualquer data (régua encerrada sem pagamento), dos mais antigos para os mais recentes. */
export async function listarInadimplentes(limite = 20) {
  const [itens, total] = await Promise.all([
    db.loteCobranca.findMany({
      where: { status: "INADIMPLENTE" },
      orderBy: { dataCriacao: "asc" },
      take: limite,
      select: { id: true, numeroContrato: true, nomeCliente: true, valorFinalCentavos: true, dataCriacao: true },
    }),
    db.loteCobranca.count({ where: { status: "INADIMPLENTE" } }),
  ]);
  return { itens, total };
}
