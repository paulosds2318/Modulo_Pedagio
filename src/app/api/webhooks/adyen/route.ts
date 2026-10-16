import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidAdyenHmac } from "@/lib/adyen";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON malformado." }, { status: 400 });
  }

  if (!Array.isArray(payload?.notificationItems)) {
    return NextResponse.json({ error: "Notificação Adyen inválida: notificationItems ausente." }, { status: 400 });
  }

  for (const wrapper of payload.notificationItems) {
    const item = wrapper?.NotificationRequestItem as Record<string, unknown> | undefined;
    if (!item) continue;

    // 1. Validação Criptográfica de HMAC
    if (!isValidAdyenHmac(item)) {
      return NextResponse.json(
        { error: "Assinatura HMAC inválida ou não configurada." },
        { status: 401 }
      );
    }

    const reference = String(item.merchantReference ?? "");
    const match = /^LOTE_(\d+)(?:_|$)/.exec(reference);
    if (!match) continue;

    const id = Number(match[1]);
    const eventCode = String(item.eventCode ?? "");
    const isSuccess = String(item.success).toLowerCase() === "true";
    const pspReference = String(item.pspReference ?? "");
    const amountObj = (item.amount && typeof item.amount === "object" ? item.amount : {}) as Record<string, unknown>;
    const receivedCents = Number(amountObj.value ?? 0);
    const currency = String(amountObj.currency ?? "").toUpperCase();

    // 2. Processamento do Evento AUTHORISATION
    if (eventCode === "AUTHORISATION") {
      if (!isSuccess) {
        // Tentativa de pagamento recusada / falhou
        await db.logRegua.create({
          data: {
            loteId: id,
            etapa: "WEBHOOK",
            acao: "PAGAMENTO_RECUSADO",
            canal: "Adyen",
            resultado: "RECUSADO",
            detalhesResposta: `Autorização recusada na Adyen (PSP: ${pspReference}). Reason: ${String(item.reason ?? "N/A")}`,
            providerMessageId: pspReference,
          },
        });
        continue;
      }

      // Verificação de Integridade Financeira: Moeda e Valor
      const lot = await db.loteCobranca.findUnique({ where: { id } });
      if (!lot) continue;

      if (currency !== "BRL" || receivedCents !== lot.valorFinalCentavos) {
        // Alerta de Divergência Financeira: NÃO baixa automaticamente!
        await db.logRegua.create({
          data: {
            loteId: id,
            etapa: lot.etapaRegua,
            acao: "ALERTA_DIVERGENCIA_VALOR",
            canal: "Adyen",
            resultado: "BLOQUEADO",
            detalhesResposta: `Valor/moeda divergente! Esperado: BRL ${lot.valorFinalCentavos} centavos, Recebido: ${currency} ${receivedCents} centavos (PSP: ${pspReference}). Baixa automática bloqueada por segurança.`,
            providerMessageId: pspReference,
          },
        });
        continue;
      }

      // Baixa Atômica com Prevenção de Condição de Corrida
      await db.$transaction(async (tx) => {
        const updateResult = await tx.loteCobranca.updateMany({
          where: {
            id,
            status: { not: "PAGO" },
          },
          data: {
            status: "PAGO",
            dataPagamento: new Date(),
            adyenPspReference: pspReference,
          },
        });

        if (updateResult.count > 0) {
          await tx.logRegua.create({
            data: {
              loteId: id,
              etapa: lot.etapaRegua,
              acao: "BAIXA_AUTOMATICA_WEBHOOK",
              canal: "Adyen",
              resultado: "SUCESSO",
              detalhesResposta: `Pagamento de R$ ${(receivedCents / 100).toFixed(2)} confirmado via Webhook Adyen (PSP: ${pspReference}).`,
              providerMessageId: pspReference,
            },
          });
        }
      });
    }

    // 3. Rastreabilidade de Estornos, Chargebacks ou Cancelamentos
    else if (["REFUND", "CHARGEBACK", "CANCEL_OR_REFUND", "CANCELLATION"].includes(eventCode)) {
      await db.logRegua.create({
        data: {
          loteId: id,
          etapa: "POS_PAGAMENTO",
          acao: `EVENTO_${eventCode}`,
          canal: "Adyen",
          resultado: isSuccess ? "PROCESSADO" : "FALHA",
          detalhesResposta: `Evento Adyen ${eventCode} recebido (PSP: ${pspReference}, Valor: ${currency} ${receivedCents}).`,
          providerMessageId: pspReference,
        },
      });
    }
  }

  // Resposta padrão exigida pela Adyen
  return NextResponse.json({ notificationResponse: "[accepted]" });
}
