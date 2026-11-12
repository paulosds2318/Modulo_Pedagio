import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { tollDataUrl } from "@/lib/services/coral-toll-data";
import { obterPrazosRegua } from "@/lib/services/config-regua";
import { agendadorLigado, intervaloAgendadorMin } from "@/lib/agendador";

export const runtime = "nodejs";

const ETAPAS_REGUA = ["D0", "D5", "D7", "D10"] as const;
const LINK_ATRASADO_MS = 60 * 60_000; // lote sem link há mais de 1 hora
const JANELA_ALERTAS_MS = 30 * 24 * 60 * 60_000; // alertas dos últimos 30 dias
const ACOES_ALERTA = ["ALERTA_DIVERGENCIA_VALOR", "ALERTA_DUPLICIDADE_DEBITO", "ERRO_PROCESSAMENTO", "COBRAR_CARTAO_BLOQUEADO_LINK_ATIVO"];

/** Números do painel de acompanhamento, já somados no servidor. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  const now = Date.now();
  try {
    const sincronizacaoSelect = { id: true, origem: true, status: true, iniciadoEm: true, finalizadoEm: true, recebidas: true, importadas: true, lotesCompilados: true, erro: true } as const;
    const [porEtapa, passagensPendentes, outbox, lotesSemLink, alertas, ultimaSincronizacao, ultimaComSucesso, prazos, ultimaRotina, ultimaRotinaOk] = await Promise.all([
      db.loteCobranca.groupBy({ by: ["status", "etapaRegua"], _count: { _all: true }, _sum: { valorFinalCentavos: true } }),
      db.passagemPedagio.count({ where: { loteId: null } }),
      db.integrationOutbox.groupBy({ by: ["tipo", "status"], _count: { _all: true } }),
      db.loteCobranca.findMany({
        where: { status: "EM_REGUA", adyenPaymentUrl: null, dataCriacao: { lt: new Date(now - LINK_ATRASADO_MS) } },
        select: { id: true, numeroContrato: true, dataCriacao: true },
        orderBy: { dataCriacao: "asc" },
        take: 20,
      }),
      db.logRegua.findMany({
        where: {
          dataHora: { gte: new Date(now - JANELA_ALERTAS_MS) },
          OR: [{ acao: { in: ACOES_ALERTA } }, { resultado: { in: ["FALHA_FINAL", "ESTORNO_NECESSARIO"] } }],
        },
        select: { id: true, loteId: true, etapa: true, acao: true, resultado: true, dataHora: true },
        orderBy: { dataHora: "desc" },
        take: 20,
      }),
      db.sincronizacaoCoral.findFirst({ orderBy: { iniciadoEm: "desc" }, select: sincronizacaoSelect }),
      db.sincronizacaoCoral.findFirst({ where: { status: "OK" }, orderBy: { iniciadoEm: "desc" }, select: sincronizacaoSelect }),
      obterPrazosRegua(),
      db.execucaoRotina.findFirst({ orderBy: { iniciadoEm: "desc" }, select: { origem: true, status: true, iniciadoEm: true, finalizadoEm: true, erro: true } }),
      db.execucaoRotina.findFirst({ where: { status: { in: ["OK", "PARCIAL"] } }, orderBy: { iniciadoEm: "desc" }, select: { iniciadoEm: true } }),
    ]);
    const intervaloMin = intervaloAgendadorMin();

    // Funil: lotes em régua por etapa, depois inadimplentes e pagos.
    const soma = (filtro: (g: (typeof porEtapa)[number]) => boolean) =>
      porEtapa.filter(filtro).reduce(
        (acc, g) => ({ quantidade: acc.quantidade + g._count._all, valorCentavos: acc.valorCentavos + (g._sum.valorFinalCentavos ?? 0) }),
        { quantidade: 0, valorCentavos: 0 }
      );
    const funil = [
      ...ETAPAS_REGUA.map((etapa) => ({ chave: etapa, ...soma((g) => g.status === "EM_REGUA" && g.etapaRegua === etapa) })),
      { chave: "INADIMPLENTE", ...soma((g) => g.status === "INADIMPLENTE") },
      { chave: "PAGO", ...soma((g) => g.status === "PAGO") },
    ];

    // Saúde das integrações: tarefas da outbox por tipo e situação.
    const integracoes = ["ADYEN_LINK_D0", "WHATSAPP_D0"].map((tipo) => {
      const contar = (...status: string[]) =>
        outbox.filter((o) => o.tipo === tipo && status.includes(o.status)).reduce((s, o) => s + o._count._all, 0);
      return {
        tipo,
        concluidas: contar("CONCLUIDO"),
        emAndamento: contar("PENDENTE", "PROCESSANDO"),
        aguardandoConfiguracao: contar("AGUARDANDO_CONFIGURACAO"),
        falhas: contar("FALHOU"),
        ignoradas: contar("IGNORADO", "CANCELADO"),
      };
    });

    return NextResponse.json({
      geradoEm: new Date(now).toISOString(),
      passagensPendentes,
      funil,
      integracoes,
      sincronizacaoCoral: {
        configurada: Boolean(tollDataUrl()),
        ultima: ultimaSincronizacao,
        ultimaComSucesso,
        // Sem sucesso há mais de 26 h (rotina diária + folga) ou última execução com falha.
        atrasada: Boolean(tollDataUrl()) && (!ultimaComSucesso || now - ultimaComSucesso.iniciadoEm.getTime() > 26 * 60 * 60_000),
      },
      rotina: {
        agendadorInterno: agendadorLigado(),
        intervaloMin,
        ultima: ultimaRotina,
        // Atrasada: sem execução concluída há mais de 2 intervalos (agendador interno) ou 26 h (cron externo diário).
        atrasada: !ultimaRotinaOk || now - ultimaRotinaOk.iniciadoEm.getTime() > (agendadorLigado() ? 2 * intervaloMin * 60_000 : 26 * 60 * 60_000),
      },
      prazos: { diasPrimeiraTentativa: prazos.diasPrimeiraTentativa, diasLembrete: prazos.diasLembrete, diasSegundaTentativa: prazos.diasSegundaTentativa },
      lotesSemLink,
      alertas,
    });
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}
