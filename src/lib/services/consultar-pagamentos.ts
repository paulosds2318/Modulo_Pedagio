import type { LinkPagamento } from "@prisma/client";
import { db } from "@/lib/db";
import { loginToCoral, limparTokenCoral } from "@/lib/services/coral-pay-by-link";
import { aplicarPagamentoLink, aplicarPagamentoLoteLegado } from "@/lib/services/links-pagamento";
import { STATUS_LOTE_COBRAVEL, referenciaDoLink } from "@/lib/links-pagamento";
import { lerRespostaStatus, reguaExecutadaPeloCoral, type ItemStatusCoral, type ReguaCoral } from "@/lib/status-coral";

const POR_CHAMADA = 50;
const POR_BLOCO = 200;
/** Teto por execução: a rotina roda de hora em hora, o restante entra na rodada seguinte. */
const MAX_ATIVOS = 5000;
const MAX_EXPIRADOS = 500;
const MAX_LEGADOS = 200;
const REGUA_DESATUALIZADA_MS = 30 * 60_000;

/** URL da consulta de pagamento e de régua do Coral (CORAL_PAYMENT_STATUS_URL). Sem ela, a consulta fica desligada. */
export function urlStatusCoral(): string | null {
  return process.env.CORAL_PAYMENT_STATUS_URL?.trim() || null;
}

async function consultarChamada(url: URL, referencias: string[]): Promise<ItemStatusCoral[]> {
  const alvo = new URL(url);
  alvo.searchParams.set("references", referencias.join(","));
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await loginToCoral(tentativa > 0);
    const resposta = await fetch(alvo, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (resposta.status === 401 && tentativa === 0) {
      limparTokenCoral();
      continue;
    }
    if (!resposta.ok) throw new Error(`Coral respondeu HTTP ${resposta.status} na consulta de pagamento.`);
    return lerRespostaStatus(await resposta.json().catch(() => null));
  }
  throw new Error("Coral recusou a autenticação após renovar o token.");
}

/** Consulta o Coral pelas referências (LINK_<id>, LOTE_<id>), em blocos. Fora de produção só aceita o Coral de homologação. */
export async function consultarStatusCoral(referencias: string[]): Promise<ItemStatusCoral[]> {
  const configurada = urlStatusCoral();
  if (!configurada) throw new Error("CONFIG: CORAL_PAYMENT_STATUS_URL não configurada.");
  const url = new URL(configurada);
  if (process.env.ADYEN_ENVIRONMENT !== "live" && !url.hostname.toLowerCase().includes("homolog")) {
    throw new Error(`Ambiente de teste não pode consultar o Coral de produção (${url.hostname}). Use a URL de homologação ou ADYEN_ENVIRONMENT=live.`);
  }
  const itens: ItemStatusCoral[] = [];
  for (let i = 0; i < referencias.length; i += POR_CHAMADA) {
    itens.push(...(await consultarChamada(url, referencias.slice(i, i + POR_CHAMADA))));
  }
  return itens;
}

const CAMPO_ETAPA = { D5: "d5TentativaAt", D7: "d7LembreteAt", D10: "d10TentativaAt" } as const;

/**
 * Guarda a situação da régua informada pelo Coral (para exibir ao usuário). Quando o Coral é quem executa a régua
 * (REGUA_EXECUTOR=coral), a etapa e o encerramento por cobrança extrajudicial também passam a valer no lote.
 */
async function aplicarReguaCoral(loteId: number, regua: ReguaCoral): Promise<boolean> {
  const lote = await db.loteCobranca.findUnique({ where: { id: loteId } });
  if (!lote) return false;
  const dados = JSON.stringify(regua);
  const data: Record<string, unknown> = { coralStatusEm: new Date() };
  const mudou = lote.coralReguaDados !== dados;
  if (mudou) data.coralReguaDados = dados;
  const agora = new Date();
  let log: { acao: string; resultado: string; detalhe: string } | null = null;

  if (reguaExecutadaPeloCoral() && lote.status === "EM_REGUA") {
    if (regua.etapa && regua.etapa !== lote.etapaRegua) {
      data.etapaRegua = regua.etapa;
      if (regua.etapa !== "D0" && !lote[CAMPO_ETAPA[regua.etapa]]) data[CAMPO_ETAPA[regua.etapa]] = agora;
      log = { acao: "REGUA_CORAL", resultado: "ATUALIZADO", detalhe: `Régua no Coral: etapa ${regua.etapaTexto ?? regua.etapa}.` };
    }
    if (regua.encerradaMotivo === "EXTRAJUDICIAL") {
      data.status = "INADIMPLENTE";
      if (!lote.d10TentativaAt) data.d10TentativaAt = agora;
      log = { acao: "ENCERRAR_REGUA", resultado: "INADIMPLENTE", detalhe: "Régua encerrada no Coral sem pagamento (cobrança extrajudicial). Lote encaminhado para tratamento manual." };
    }
  }
  await db.loteCobranca.update({ where: { id: loteId }, data });
  if (log) await db.logRegua.create({ data: { loteId, etapa: (data.etapaRegua as string | undefined) ?? lote.etapaRegua, acao: log.acao, canal: "Coral", resultado: log.resultado, detalhesResposta: log.detalhe } });
  return mudou || Boolean(log);
}

export type ResumoConsulta = {
  configurado: boolean;
  consultados: number;
  pagos: number;
  parciais: number;
  expirados: number;
  alertas: number;
  reguaAtualizada: number;
};

/**
 * Consulta o Coral sobre os links em aberto (de todos os lotes, ou de um só) e aplica o que mudou: pagamento (baixa total
 * ou parcial), link expirado e situação da régua. Roda na rotina automática, antes de a régua agir, e sob demanda no lote.
 */
export async function sincronizarPagamentosCoral(opcoes: { loteId?: number } = {}): Promise<ResumoConsulta> {
  const resumo: ResumoConsulta = { configurado: Boolean(urlStatusCoral()), consultados: 0, pagos: 0, parciais: 0, expirados: 0, alertas: 0, reguaAtualizada: 0 };
  if (!resumo.configurado) return resumo;

  // Todos os links ativos (é neles que o pagamento pode chegar), em blocos por ID.
  const links: LinkPagamento[] = [];
  let cursor = 0;
  while (links.length < MAX_ATIVOS) {
    const bloco = await db.linkPagamento.findMany({
      where: { status: "ATIVO", id: { gt: cursor }, lote: { status: { in: STATUS_LOTE_COBRAVEL } }, ...(opcoes.loteId ? { loteId: opcoes.loteId } : {}) },
      orderBy: { id: "asc" },
      take: POR_BLOCO,
    });
    if (!bloco.length) break;
    links.push(...bloco);
    cursor = bloco[bloco.length - 1].id;
  }
  // Lotes sem link ativo: só o link mais recente e só quando a situação da régua está desatualizada (nunca consultada ou há 30+ min).
  const semAtivo = await db.loteCobranca.findMany({
    where: {
      status: { in: STATUS_LOTE_COBRAVEL },
      links: { none: { status: "ATIVO" }, some: { status: "EXPIRADO" } },
      OR: [{ coralStatusEm: null }, { coralStatusEm: { lt: new Date(Date.now() - REGUA_DESATUALIZADA_MS) } }],
      ...(opcoes.loteId ? { id: opcoes.loteId } : {}),
    },
    select: { links: { where: { status: "EXPIRADO" }, orderBy: { criadoEm: "desc" }, take: 1 } },
    orderBy: { id: "asc" },
    take: MAX_EXPIRADOS,
  });
  links.push(...semAtivo.flatMap((l) => l.links));
  // Lotes com link criado antes dos links por passagem: a referência enviada ao Coral foi LOTE_<id>.
  const legados = await db.loteCobranca.findMany({
    where: { status: { in: STATUS_LOTE_COBRAVEL }, adyenPaymentUrl: { not: null }, links: { none: {} }, ...(opcoes.loteId ? { id: opcoes.loteId } : {}) },
    select: { id: true },
    take: MAX_LEGADOS,
  });
  const referencias = [...links.map((l) => referenciaDoLink(l.id)), ...legados.map((l) => `LOTE_${l.id}`)];
  if (!referencias.length) return resumo;

  const porLink = new Map(links.map((l) => [l.id, l]));
  const itens = await consultarStatusCoral(referencias);
  resumo.consultados = itens.length;

  for (const item of itens) {
    const evento = { valorCentavos: item.valorCentavos, pagoEm: item.pagoEm ?? new Date(), forma: item.forma, transacaoId: item.transacaoId };
    let loteId: number | null = null;
    if (item.referencia.tipo === "LINK") {
      const link = porLink.get(item.referencia.id);
      if (!link) continue;
      loteId = link.loteId;
      if (item.status === "PAGO") {
        const r = await aplicarPagamentoLink(link.id, evento);
        if (r === "BAIXADO") resumo.pagos++;
        else if (r === "PARCIAL") resumo.parciais++;
        else if (r === "DIVERGENTE" || r === "DUPLICADO") resumo.alertas++;
      } else if (item.status === "EXPIRADO" && link.status === "ATIVO") {
        await db.linkPagamento.updateMany({ where: { id: link.id, status: "ATIVO" }, data: { status: "EXPIRADO" } });
        resumo.expirados++;
      }
    } else {
      loteId = item.referencia.id;
      if (item.status === "PAGO") {
        const r = await aplicarPagamentoLoteLegado(item.referencia.id, evento);
        if (r === "BAIXADO") resumo.pagos++;
        else if (r === "DIVERGENTE" || r === "DUPLICADO") resumo.alertas++;
      }
    }
    if (loteId && item.regua && (await aplicarReguaCoral(loteId, item.regua))) resumo.reguaAtualizada++;
  }
  return resumo;
}
