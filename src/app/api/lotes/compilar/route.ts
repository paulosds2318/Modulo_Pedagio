import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/adyen";
import { buildPaymentMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";
export const runtime = "nodejs";
const schema = z.object({ passagemIds: z.array(z.number().int().positive()).min(1).max(500), taxaCentavos: z.number().int().nonnegative().default(0) }).refine((data) => new Set(data.passagemIds).size === data.passagemIds.length, "IDs de passagem duplicados.");
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos para compilação." }, { status: 400 });
  try {
    const lot = await db.$transaction(async (tx) => {
      const passages = await tx.passagemPedagio.findMany({ where: { id: { in: parsed.data.passagemIds } } });
      if (passages.length !== parsed.data.passagemIds.length) throw new Error("NOT_FOUND");
      if (passages.some((p) => p.loteId !== null)) throw new Error("ALREADY_BILLED");
      if (new Set(passages.map((p) => p.numeroContrato)).size !== 1 || new Set(passages.map((p) => p.cpfCliente)).size !== 1) throw new Error("MIXED_CONTRACTS");
      const total = passages.reduce((sum, p) => sum + p.valorCentavos, 0);
      return tx.loteCobranca.create({ data: { numeroContrato: passages[0].numeroContrato, cpfCliente: passages[0].cpfCliente, telefoneCliente: passages[0].telefoneCliente, quantidadePassagens: passages.length, valorTotalCentavos: total, taxaCentavos: parsed.data.taxaCentavos, valorFinalCentavos: total + parsed.data.taxaCentavos, status: "EM_REGUA", etapaRegua: "D0", passagens: { connect: passages.map((p) => ({ id: p.id })) } } });
    });
    let link: { id?: string; url?: string } | null = null;
    let adyenResult = "PENDENTE_CONFIGURACAO", adyenDetails = "Credenciais Adyen não configuradas.";
    try {
      link = await createPaymentLink(lot.id, lot.valorFinalCentavos, lot.numeroContrato);
      if (link) { adyenResult = "SUCESSO"; adyenDetails = "Pay-by-link criado."; }
    } catch (error) { adyenResult = "FALHA"; adyenDetails = error instanceof Error ? error.message : "Falha Adyen."; }
    let whatsappResult = "NAO_CONFIGURADO", whatsappDetails = "Telefone ou gateway WhatsApp não configurado.", messageId: string | undefined;
    if (lot.telefoneCliente && process.env.WHATSAPP_API_URL) {
      try {
        const sent = await sendWhatsAppMessage(lot.telefoneCliente, buildPaymentMessage(lot.numeroContrato, lot.valorFinalCentavos, link?.url), `LOTE_${lot.id}_D0`);
        whatsappResult = sent ? "ENVIADO" : "NAO_CONFIGURADO"; whatsappDetails = sent ? "Mensagem D+0 enviada." : "Gateway WhatsApp não configurado."; messageId = sent?.messageId;
      } catch (error) { whatsappResult = "FALHA"; whatsappDetails = error instanceof Error ? error.message : "Falha no gateway WhatsApp."; }
    }
    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.loteCobranca.update({ where: { id: lot.id }, data: { adyenLinkId: link?.id, adyenPaymentUrl: link?.url } });
      await tx.logRegua.createMany({ data: [
        { loteId: lot.id, etapa: "D0", acao: "CRIAR_PAY_BY_LINK", canal: "Adyen", resultado: adyenResult, detalhesResposta: adyenDetails },
        { loteId: lot.id, etapa: "D0", acao: "NOTIFICAR_CLIENTE", canal: "WhatsApp", resultado: whatsappResult, detalhesResposta: whatsappDetails, providerMessageId: messageId },
      ] });
      return saved;
    });
    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const mapping: Record<string, { status: number; message: string }> = { NOT_FOUND: { status: 404, message: "Uma ou mais passagens não foram encontradas." }, ALREADY_BILLED: { status: 409, message: "Uma ou mais passagens já pertencem a um lote." }, MIXED_CONTRACTS: { status: 422, message: "Selecione passagens do mesmo contrato e cliente." } };
    const response = mapping[code] ?? { status: 500, message: "Não foi possível criar o lote." };
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
