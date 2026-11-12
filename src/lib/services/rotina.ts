import { db } from "@/lib/db";
import { processBillingRule } from "@/lib/services/regua";
import { processIntegrationOutbox } from "@/lib/services/outbox";
import { sincronizarPassagensCoral, tollDataUrl } from "@/lib/services/coral-toll-data";

/** AGENDADOR: agendador interno do próprio módulo. CRON_EXTERNO: chamada a /api/cron/regua (cron-job.org, EventBridge…). */
export type OrigemRotina = "AGENDADOR" | "CRON_EXTERNO";

/** Tempo máximo que uma execução segura a trava; se o processo cair no meio, a trava expira sozinha. */
const TRAVA_MS = 30 * 60_000;

/** Reserva a rotina para este processo. Atômico no banco: com dois containers, só um consegue. */
async function ocuparTrava(now: Date) {
  await db.rotinaTrava.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const result = await db.rotinaTrava.updateMany({
    where: { id: 1, OR: [{ ocupadaAte: null }, { ocupadaAte: { lt: now } }] },
    data: { ocupadaAte: new Date(now.getTime() + TRAVA_MS) },
  });
  return result.count === 1;
}

async function liberarTrava() {
  await db.rotinaTrava.updateMany({ where: { id: 1 }, data: { ocupadaAte: null } }).catch(() => undefined);
}

/** Falha na consulta ao Coral não deve impedir a régua nem as retentativas. */
async function sincronizar() {
  if (!tollDataUrl()) return { status: "NAO_CONFIGURADO" as const };
  try {
    return { status: "OK" as const, ...(await sincronizarPassagensCoral(new Date(), undefined, "CRON")) };
  } catch (error) {
    return { status: "FALHA" as const, erro: error instanceof Error ? error.message.replace(/^CONFIG:\s*/, "") : "Falha desconhecida." };
  }
}

/**
 * Rotina automática: busca passagens no Coral, avança a régua (tentativas no cartão, lembrete, inadimplência)
 * e repete as integrações que falharam. Pode rodar várias vezes ao dia: cada etapa acontece uma vez por lote.
 */
export async function executarRotina(origem: OrigemRotina, now = new Date()) {
  if (!(await ocuparTrava(now))) {
    return { status: "IGNORADA" as const, motivo: "Outra execução da rotina ainda está em andamento." };
  }
  const execucao = await db.execucaoRotina.create({ data: { origem, status: "EM_ANDAMENTO" } });
  try {
    const passagens = await sincronizar();
    const [regua, integracoes] = await Promise.all([processBillingRule(), processIntegrationOutbox()]);
    const resumo = {
      passagens: { status: passagens.status, recebidas: "recebidas" in passagens ? passagens.recebidas : 0, importadas: "importadas" in passagens ? passagens.importadas : 0 },
      regua,
      integracoes,
    };
    await db.execucaoRotina.update({
      where: { id: execucao.id },
      data: { status: passagens.status === "FALHA" ? "PARCIAL" : "OK", finalizadoEm: new Date(), resumo: JSON.stringify(resumo), erro: passagens.status === "FALHA" ? `Sincronização com o Coral: ${passagens.erro}` : null },
    });
    return { status: "OK" as const, passagens, regua, integracoes };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Falha desconhecida.";
    await db.execucaoRotina
      .update({ where: { id: execucao.id }, data: { status: "FALHA", finalizadoEm: new Date(), erro: mensagem.slice(0, 1000) } })
      .catch(() => undefined);
    throw error;
  } finally {
    await liberarTrava();
  }
}
