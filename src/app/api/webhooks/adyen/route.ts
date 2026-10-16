import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidAdyenHmac } from "@/lib/adyen";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const payload = await request.json();
  if (!Array.isArray(payload?.notificationItems)) return NextResponse.json({ error: "Notificação inválida." }, { status: 400 });
  for (const wrapper of payload.notificationItems) {
    const item = wrapper?.NotificationRequestItem;
    if (!item || !isValidAdyenHmac(item)) return NextResponse.json({ error: "Assinatura HMAC inválida ou não configurada." }, { status: 401 });
    if (item.eventCode !== "AUTHORISATION" || String(item.success).toLowerCase() !== "true") continue;
    const match = /^LOTE_(\d+)(?:_|$)/.exec(String(item.merchantReference ?? ""));
    if (!match) continue;
    const id = Number(match[1]);
    await db.$transaction(async (tx) => {
      const lot = await tx.loteCobranca.findUnique({ where: { id } });
      if (!lot || lot.status === "PAGO") return;
      await tx.loteCobranca.update({ where: { id }, data: { status: "PAGO", dataPagamento: new Date(), adyenPspReference: String(item.pspReference ?? "") } });
      await tx.logRegua.create({ data: { loteId: id, etapa: lot.etapaRegua, acao: "BAIXA_AUTOMATICA_WEBHOOK", canal: "Adyen", resultado: "SUCESSO", detalhesResposta: String(item.pspReference ?? "") } });
    });
  }
  return NextResponse.json({ notificationResponse: "[accepted]" });
}
