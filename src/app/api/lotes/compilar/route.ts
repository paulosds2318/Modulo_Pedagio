import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/adyen";
import { buildPaymentMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";

export const runtime = "nodejs";

const schema = z
  .object({
    passagemIds: z.array(z.number().int().positive()).min(1).max(500),
    taxaCentavos: z
      .number()
      .int()
      .nonnegative()
      .max(500_000, "A taxa administrativa não pode ultrapassar R$ 5.000,00.")
      .default(0),
  })
  .refine(
    (data) => new Set(data.passagemIds).size === data.passagemIds.length,
    "A lista de passagens contém identificadores duplicados."
  );

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição JSON inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos para compilação do lote." },
      { status: 400 }
    );
  }

  try {
    // 1. Criação Atômica do Lote com Trava Anti-Concorrência em Passagens
    const lot = await db.$transaction(async (tx) => {
      const passages = await tx.passagemPedagio.findMany({
        where: { id: { in: parsed.data.passagemIds } },
      });

      if (passages.length !== parsed.data.passagemIds.length) {
        throw new Error("NOT_FOUND");
      }
      if (passages.some((p) => p.loteId !== null)) {
        throw new Error("ALREADY_BILLED");
      }
      if (
        new Set(passages.map((p) => p.numeroContrato)).size !== 1 ||
        new Set(passages.map((p) => p.cpfCliente)).size !== 1
      ) {
        throw new Error("MIXED_CONTRACTS");
      }

      const totalTolls = passages.reduce((sum, p) => sum + p.valorCentavos, 0);
      const finalAmount = totalTolls + parsed.data.taxaCentavos;

      if (finalAmount <= 0) {
        throw new Error("INVALID_AMOUNT");
      }
      if (finalAmount > 50_000_000) {
        // Teto de R$ 500.000,00 por lote para segurança contra estouro de inteiros/fraude
        throw new Error("AMOUNT_EXCEEDED");
      }

      const newLot = await tx.loteCobranca.create({
        data: {
          numeroContrato: passages[0].numeroContrato,
          cpfCliente: passages[0].cpfCliente,
          telefoneCliente: passages[0].telefoneCliente,
          quantidadePassagens: passages.length,
          valorTotalCentavos: totalTolls,
          taxaCentavos: parsed.data.taxaCentavos,
          valorFinalCentavos: finalAmount,
          status: "EM_REGUA",
          etapaRegua: "D0",
        },
      });

      // Vinculação Atômica com Validação de Concorrência
      const linked = await tx.passagemPedagio.updateMany({
        where: {
          id: { in: parsed.data.passagemIds },
          loteId: null,
        },
        data: { loteId: newLot.id },
      });

      if (linked.count !== passages.length) {
        throw new Error("RACE_CONDITION");
      }

      return newLot;
    });

    // 2. Emissão do Link de Pagamento na Adyen (Pay-by-Link)
    let link: { id?: string; url?: string } | null = null;
    let adyenResult = "PENDENTE_CONFIGURACAO";
    let adyenDetails = "Credenciais Adyen não configuradas no ambiente.";

    try {
      link = await createPaymentLink(lot.id, lot.valorFinalCentavos, lot.numeroContrato);
      if (link?.url) {
        adyenResult = "SUCESSO";
        adyenDetails = `Pay-by-link emitido na Adyen (ID: ${link.id}).`;
      }
    } catch (error) {
      adyenResult = "FALHA";
      adyenDetails = error instanceof Error ? error.message : "Falha na API Adyen.";
    }

    // 3. Disparo da Notificação D+0 via WhatsApp
    let whatsappResult = "NAO_CONFIGURADO";
    let whatsappDetails = "Telefone do cliente ou gateway WhatsApp não configurado.";
    let messageId: string | undefined;

    if (lot.telefoneCliente && process.env.WHATSAPP_API_URL) {
      try {
        const sent = await sendWhatsAppMessage(
          lot.telefoneCliente,
          buildPaymentMessage(lot.numeroContrato, lot.valorFinalCentavos, link?.url),
          `LOTE_${lot.id}_D0`
        );
        if (sent) {
          whatsappResult = "ENVIADO";
          whatsappDetails = `Mensagem de cobrança D+0 enviada para ${lot.telefoneCliente}.`;
          messageId = sent.messageId;
        }
      } catch (error) {
        whatsappResult = "FALHA";
        whatsappDetails = error instanceof Error ? error.message : "Falha no gateway WhatsApp.";
      }
    }

    // 4. Registro dos Logs Auditáveis de Emissão e Atualização dos Links
    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.loteCobranca.update({
        where: { id: lot.id },
        data: {
          adyenLinkId: link?.id,
          adyenPaymentUrl: link?.url,
        },
      });

      await tx.logRegua.createMany({
        data: [
          {
            loteId: lot.id,
            etapa: "D0",
            acao: "CRIAR_PAY_BY_LINK",
            canal: "Adyen",
            resultado: adyenResult,
            detalhesResposta: adyenDetails,
          },
          {
            loteId: lot.id,
            etapa: "D0",
            acao: "NOTIFICAR_CLIENTE",
            canal: "WhatsApp",
            resultado: whatsappResult,
            detalhesResposta: whatsappDetails,
            providerMessageId: messageId,
          },
        ],
      });

      return saved;
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const mapping: Record<string, { status: number; message: string }> = {
      NOT_FOUND: { status: 404, message: "Uma ou mais passagens não foram localizadas no sistema." },
      ALREADY_BILLED: { status: 409, message: "Uma ou mais passagens selecionadas já pertencem a outro lote." },
      RACE_CONDITION: { status: 409, message: "Conflito de concorrência: uma das passagens foi compilada por outro operador simultaneamente." },
      MIXED_CONTRACTS: { status: 422, message: "Todas as passagens do lote devem pertencer estritamente ao mesmo contrato e cliente." },
      INVALID_AMOUNT: { status: 422, message: "O valor total do lote de pedágios deve ser superior a zero." },
      AMOUNT_EXCEEDED: { status: 422, message: "O valor total do lote excede o limite máximo permitido de segurança (R$ 500.000,00)." },
    };

    const response = mapping[code] ?? {
      status: 500,
      message: "Erro interno ao compilar o lote de cobrança.",
    };
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
