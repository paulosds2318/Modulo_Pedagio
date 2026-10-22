import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/adyen";
import { buildPaymentMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { retryAt } from "@/lib/retry";

const MAX_ATTEMPTS = 10;
const LEASE_MS = 10 * 60_000;

/** Processa tarefas persistidas; pode ser chamado após a compilação e pelo cron. */
export async function processIntegrationOutbox(now = new Date(), loteId?: number) {
  const jobs = await db.integrationOutbox.findMany({
    where: {
      ...(loteId ? { loteId } : {}),
      OR: [
        { status: { in: ["PENDENTE", "AGUARDANDO_CONFIGURACAO"] }, proximaTentativaAt: { lte: now } },
        { status: "PROCESSANDO", processandoAte: { lt: now } },
      ],
    },
    orderBy: [{ loteId: "asc" }, { id: "asc" }],
    take: 100,
  });
  let completed = 0;

  for (const job of jobs) {
    const claimed = await db.integrationOutbox.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: { in: ["PENDENTE", "AGUARDANDO_CONFIGURACAO"] }, proximaTentativaAt: { lte: now } },
          { status: "PROCESSANDO", processandoAte: { lt: now } },
        ],
      },
      data: { status: "PROCESSANDO", processandoAte: new Date(now.getTime() + LEASE_MS), tentativas: { increment: 1 } },
    });
    if (!claimed.count) continue;

    try {
      const lot = await db.loteCobranca.findUnique({ where: { id: job.loteId } });
      if (!lot || lot.status !== "EM_REGUA") {
        await db.integrationOutbox.update({ where: { id: job.id }, data: { status: "CANCELADO", processandoAte: null } });
        continue;
      }

      if (job.tipo === "ADYEN_LINK_D0") {
        if (!lot.adyenPaymentUrl) {
          if (!process.env.CORAL_PAY_BY_LINK_LOGIN || !process.env.CORAL_PAY_BY_LINK_PASSWORD) throw new Error("CONFIG: Credenciais do Coral Pay By Link ainda não estão configuradas.");
          const rental = await db.contratoLocacao.findUnique({ where: { numeroContrato: lot.numeroContrato }, select: { dataRetirada: true } });
          const link = await createPaymentLink(lot.id, lot.valorFinalCentavos, lot.numeroContrato, lot.cpfCliente, rental?.dataRetirada);
          if (!link?.url) throw new Error("Coral Pay By Link não retornou a URL do pagamento.");
          await db.loteCobranca.update({ where: { id: lot.id }, data: { adyenLinkId: link.id ?? null, adyenPaymentUrl: link.url } });
          await db.logRegua.create({ data: { loteId: lot.id, etapa: "D0", acao: "CRIAR_PAY_BY_LINK", canal: "Coral/Foco", resultado: "SUCESSO", detalhesResposta: "Link de pagamento solicitado à API Coral/Foco." } });
        }
      } else if (job.tipo === "WHATSAPP_D0") {
        if (!lot.telefoneCliente) {
          await db.integrationOutbox.update({ where: { id: job.id }, data: { status: "IGNORADO", processandoAte: null, ultimoErro: "Telefone do cliente não cadastrado." } });
          await db.logRegua.create({ data: { loteId: lot.id, etapa: "D0", acao: job.tipo, canal: "WhatsApp", resultado: "IGNORADO", detalhesResposta: "Telefone do cliente não cadastrado." } });
          continue;
        }
        if (!process.env.WHATSAPP_API_URL) throw new Error("CONFIG: Gateway WhatsApp ainda não está configurado.");
        const message = await sendWhatsAppMessage(lot.telefoneCliente, buildPaymentMessage(lot.numeroContrato, lot.valorFinalCentavos, lot.adyenPaymentUrl), `LOTE_${lot.id}_D0`);
        if (!message) throw new Error("Gateway WhatsApp ainda não está configurado.");
        await db.logRegua.create({ data: { loteId: lot.id, etapa: "D0", acao: "NOTIFICAR_CLIENTE", canal: "WhatsApp", resultado: "ENVIADO", detalhesResposta: "Mensagem D+0 enviada ao gateway.", providerMessageId: message.messageId } });
      } else {
        throw new Error("Tipo de tarefa de integração desconhecido.");
      }

      await db.integrationOutbox.update({ where: { id: job.id }, data: { status: "CONCLUIDO", processandoAte: null, ultimoErro: null } });
      completed++;
    } catch (error) {
      const attempts = job.tentativas + 1;
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Falha desconhecida na integração.";
      const waitingForConfig = message.startsWith("CONFIG:");
      await db.integrationOutbox.update({
        where: { id: job.id },
        data: {
          status: waitingForConfig ? "AGUARDANDO_CONFIGURACAO" : attempts >= MAX_ATTEMPTS ? "FALHOU" : "PENDENTE",
          processandoAte: null,
          tentativas: waitingForConfig ? job.tentativas : attempts,
          proximaTentativaAt: waitingForConfig ? new Date(now.getTime() + 24 * 60 * 60_000) : retryAt(attempts, now),
          ultimoErro: message.replace(/^CONFIG:\s*/, ""),
        },
      });
      await db.logRegua.create({ data: { loteId: job.loteId, etapa: "D0", acao: job.tipo, canal: job.tipo.startsWith("ADYEN") ? "Adyen" : "WhatsApp", resultado: waitingForConfig ? "AGUARDANDO_CONFIGURACAO" : attempts >= MAX_ATTEMPTS ? "FALHA_FINAL" : "FALHA_COM_RETENTATIVA", detalhesResposta: message.replace(/^CONFIG:\s*/, "") } });
    }
  }

  return { encontrados: jobs.length, concluidos: completed };
}
