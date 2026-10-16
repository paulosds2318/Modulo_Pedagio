import { db } from "@/lib/db";
import { chargeStoredPaymentMethod, createPaymentLink, expirePaymentLink } from "@/lib/adyen";
import { getStoredPaymentMethod } from "@/lib/services/coral";
import { buildPaymentMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";

const DAY = 24 * 60 * 60 * 1000;
type Attempt = "PAID" | "DECLINED" | "UNAVAILABLE";
const addLog = (loteId: number, etapa: string, acao: string, canal: string, resultado: string, detalhesResposta?: string, providerMessageId?: string) => db.logRegua.create({ data: { loteId, etapa, acao, canal, resultado, detalhesResposta, providerMessageId } });

async function tryCardCharge(lot: { id: number; numeroContrato: string; cpfCliente: string; valorFinalCentavos: number; adyenLinkId: string | null }, stage: "D5" | "D10"): Promise<Attempt> {
  if (!process.env.ADYEN_API_KEY || !process.env.ADYEN_MERCHANT_ACCOUNT) {
    await addLog(lot.id, stage, "COBRAR_CARTAO", "Adyen", "NAO_CONFIGURADO", "Credenciais ausentes; link ativo preservado.");
    return "UNAVAILABLE";
  }
  let token: string | null;
  try { token = await getStoredPaymentMethod(lot.numeroContrato, lot.cpfCliente); }
  catch (error) { await addLog(lot.id, stage, "CONSULTAR_TOKEN", "Coral", "FALHA", error instanceof Error ? error.message : "Falha no Coral"); return "UNAVAILABLE"; }
  if (!token) { await addLog(lot.id, stage, "CONSULTAR_TOKEN", "Coral", "NAO_CONFIGURADO", "Token ausente; link ativo preservado."); return "UNAVAILABLE"; }
  if (lot.adyenLinkId) {
    try { await expirePaymentLink(lot.adyenLinkId, lot.id); await addLog(lot.id, stage, "EXPIRAR_LINK", "Adyen", "SUCESSO"); }
    catch (error) { await addLog(lot.id, stage, "EXPIRAR_LINK", "Adyen", "FALHA", error instanceof Error ? error.message : "Falha ao expirar link"); return "UNAVAILABLE"; }
  }
  try {
    const result = await chargeStoredPaymentMethod(lot.id, stage, lot.valorFinalCentavos, lot.numeroContrato, token);
    if (result?.resultCode === "Authorised") {
      await db.$transaction([db.loteCobranca.update({ where: { id: lot.id }, data: { status: "PAGO", dataPagamento: new Date(), adyenPspReference: result.pspReference } }), db.logRegua.create({ data: { loteId: lot.id, etapa: stage, acao: "COBRAR_CARTAO", canal: "Adyen", resultado: "APROVADO", detalhesResposta: result.pspReference } })]);
      return "PAID";
    }
    if (result?.resultCode !== "Refused") { await addLog(lot.id, stage, "COBRAR_CARTAO", "Adyen", "PENDENTE", result?.resultCode ?? "Sem resposta final"); return "UNAVAILABLE"; }
    await addLog(lot.id, stage, "COBRAR_CARTAO", "Adyen", "RECUSADO", result.resultCode);
    try {
      const link = await createPaymentLink(lot.id, lot.valorFinalCentavos, lot.numeroContrato);
      if (link) await db.loteCobranca.update({ where: { id: lot.id }, data: { adyenLinkId: link.id, adyenPaymentUrl: link.url } });
    } catch (error) { await addLog(lot.id, stage, "CRIAR_NOVO_LINK", "Adyen", "FALHA", error instanceof Error ? error.message : "Falha ao criar link"); }
    return "DECLINED";
  } catch (error) { await addLog(lot.id, stage, "COBRAR_CARTAO", "Adyen", "FALHA", error instanceof Error ? error.message : "Falha na cobrança"); return "UNAVAILABLE"; }
}

export async function processBillingRule(now = new Date()) {
  const open = await db.loteCobranca.findMany({ where: { status: "EM_REGUA" } });
  let processed = 0;
  for (const item of open) {
    const claimed = await db.loteCobranca.updateMany({ where: { id: item.id, status: "EM_REGUA", OR: [{ processandoAte: null }, { processandoAte: { lt: now } }] }, data: { processandoAte: new Date(now.getTime() + 5 * 60_000) } });
    if (!claimed.count) continue;
    try {
      let lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot) continue;
      const age = now.getTime() - lot.dataCriacao.getTime();
      if (age >= 5 * DAY && !lot.d5TentativaAt) {
        await db.loteCobranca.update({ where: { id: lot.id }, data: { etapaRegua: "D5" } });
        const outcome = await tryCardCharge(lot, "D5");
        if (outcome !== "UNAVAILABLE") await db.loteCobranca.update({ where: { id: lot.id }, data: { d5TentativaAt: now } });
        if (outcome === "PAID") { processed++; continue; }
      }
      lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot || lot.status !== "EM_REGUA") continue;
      if (age >= 7 * DAY && !lot.d7LembreteAt) {
        let message: { messageId?: string } | null = null, sendStatus = "NAO_CONFIGURADO", sendDetails: string | undefined = "Gateway ou telefone do cliente não configurado.";
        try {
          if (lot.telefoneCliente) message = await sendWhatsAppMessage(lot.telefoneCliente, buildPaymentMessage(lot.numeroContrato, lot.valorFinalCentavos, lot.adyenPaymentUrl), `LOTE_${lot.id}_D7`);
          if (message) { sendStatus = "ENVIADO"; sendDetails = undefined; }
        } catch (error) { sendStatus = "FALHA"; sendDetails = error instanceof Error ? error.message : "Falha no gateway WhatsApp."; }
        await db.loteCobranca.update({ where: { id: lot.id }, data: { d7LembreteAt: now, etapaRegua: "D7" } });
        await addLog(lot.id, "D7", "LEMBRETE_COBRANCA", "WhatsApp", sendStatus, sendDetails, message?.messageId);
      }
      lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot || lot.status !== "EM_REGUA") continue;
      if (age >= 10 * DAY && !lot.d10TentativaAt) {
        await db.loteCobranca.update({ where: { id: lot.id }, data: { etapaRegua: "D10" } });
        const outcome = await tryCardCharge(lot, "D10");
        if (outcome !== "UNAVAILABLE") await db.loteCobranca.update({ where: { id: lot.id }, data: { d10TentativaAt: now } });
        if (outcome === "DECLINED") { await db.loteCobranca.update({ where: { id: lot.id }, data: { status: "INADIMPLENTE", etapaRegua: "D10" } }); await addLog(lot.id, "D10", "ENCERRAR_REGUA", "Sistema", "INADIMPLENTE"); }
        if (outcome === "PAID") { processed++; continue; }
      }
      processed++;
    } finally { await db.loteCobranca.updateMany({ where: { id: item.id }, data: { processandoAte: null } }); }
  }
  return { encontrados: open.length, processados: processed };
}
