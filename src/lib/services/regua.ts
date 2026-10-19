import { db } from "@/lib/db";
import { chargeStoredPaymentMethod, createPaymentLink, expirePaymentLink } from "@/lib/adyen";
import { getStoredPaymentMethod } from "@/lib/services/coral";
import { buildPaymentMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";

const DAY = 24 * 60 * 60 * 1000;
type Attempt = "PAID" | "DECLINED" | "UNAVAILABLE";

const addLog = (
  loteId: number,
  etapa: string,
  acao: string,
  canal: string,
  resultado: string,
  detalhesResposta?: string,
  providerMessageId?: string
) =>
  db.logRegua.create({
    data: {
      loteId,
      etapa,
      acao,
      canal,
      resultado,
      detalhesResposta,
      providerMessageId,
    },
  });

async function tryCardCharge(
  lot: {
    id: number;
    numeroContrato: string;
    cpfCliente: string;
    valorFinalCentavos: number;
    adyenLinkId: string | null;
  },
  stage: "D5" | "D10"
): Promise<Attempt> {
  // 1. Verificação Imediata de Estado (Prevenção de Cobrança Duplicada)
  const fresh = await db.loteCobranca.findUnique({ where: { id: lot.id } });
  if (!fresh || fresh.status !== "EM_REGUA") {
    return "UNAVAILABLE";
  }

  // 2. Validação de Credenciais
  if (!process.env.ADYEN_API_KEY || !process.env.ADYEN_MERCHANT_ACCOUNT) {
    await addLog(
      lot.id,
      stage,
      "COBRAR_CARTAO",
      "Adyen",
      "NAO_CONFIGURADO",
      "Credenciais Adyen ausentes; cobrança no cartão não iniciada para manter integridade."
    );
    return "UNAVAILABLE";
  }

  // 3. Consulta de Token do Cartão no Coral
  let token: string | null;
  try {
    token = await getStoredPaymentMethod(lot.numeroContrato, lot.cpfCliente);
  } catch (error) {
    await addLog(
      lot.id,
      stage,
      "CONSULTAR_TOKEN",
      "Coral",
      "FALHA",
      error instanceof Error ? error.message : "Falha na comunicação com o Coral."
    );
    return "UNAVAILABLE";
  }

  if (!token) {
    await addLog(
      lot.id,
      stage,
      "CONSULTAR_TOKEN",
      "Coral",
      "SEM_CARTAO",
      "Cliente sem cartão de crédito tokenizado cadastrado no Coral; mantido link de pagamento ativo."
    );
    return "UNAVAILABLE";
  }

  // 4. Trava Anti-Duplicidade: Expirar link de pagamento ativo antes de tentar o débito
  if (fresh.adyenLinkId) {
    try {
      await expirePaymentLink(fresh.adyenLinkId, fresh.id);
      await addLog(
        lot.id,
        stage,
        "EXPIRAR_LINK_PREVENTIVO",
        "Adyen",
        "SUCESSO",
        `Link ${fresh.adyenLinkId} expirado antes do débito recorrente.`
      );
    } catch (error) {
      await addLog(
        lot.id,
        stage,
        "EXPIRAR_LINK_PREVENTIVO",
        "Adyen",
        "FALHA",
        `Não foi possível expirar o link ${fresh.adyenLinkId} preventivamente: ${error instanceof Error ? error.message : "Erro desconhecido"}. Débito suspenso para evitar duplicidade.`
      );
      return "UNAVAILABLE";
    }
  }

  // 5. Execução do Débito via Adyen Recurring
  try {
    const result = await chargeStoredPaymentMethod(
      fresh.id,
      stage,
      fresh.valorFinalCentavos,
      fresh.numeroContrato,
      token
    );

    if (result?.resultCode === "Authorised") {
      // Baixa Atômica: Só confirma se ainda estiver EM_REGUA
      const updateResult = await db.loteCobranca.updateMany({
        where: { id: fresh.id, status: "EM_REGUA" },
        data: {
          status: "PAGO",
          dataPagamento: new Date(),
          adyenPspReference: result.pspReference,
        },
      });

      if (updateResult.count > 0) {
        await addLog(
          fresh.id,
          stage,
          "COBRAR_CARTAO",
          "Adyen",
          "APROVADO",
          `Débito autorizado no cartão tokenizado (PSP: ${result.pspReference}).`,
          result.pspReference
        );
        return "PAID";
      } else {
        // Alerta Crítico de Duplicidade: Webhook pagou no mesmo instante do débito
        await addLog(
          fresh.id,
          stage,
          "ALERTA_DUPLICIDADE_DEBITO",
          "Adyen",
          "ESTORNO_NECESSARIO",
          `Cartão autorizado (PSP: ${result.pspReference}), porém o lote já foi baixado por outro canal. Necessário estorno preventivo.`
        );
        return "PAID";
      }
    }

    if (result?.resultCode === "Refused") {
      const reason = result.refusalReason || "Transação não autorizada pelo emissor do cartão.";
      await addLog(
        fresh.id,
        stage,
        "COBRAR_CARTAO",
        "Adyen",
        "RECUSADO",
        `Débito recusado: ${reason} (PSP: ${result.pspReference || "N/A"}).`,
        result.pspReference
      );

      // Gera novo Pay-by-link para o cliente pagar manualmente após recusa do cartão
      try {
        const link = await createPaymentLink(fresh.id, fresh.valorFinalCentavos, fresh.numeroContrato);
        if (link?.url) {
          await db.loteCobranca.update({
            where: { id: fresh.id },
            data: { adyenLinkId: link.id, adyenPaymentUrl: link.url },
          });
          await addLog(
            fresh.id,
            stage,
            "CRIAR_NOVO_LINK",
            "Adyen",
            "SUCESSO",
            `Novo link de pagamento gerado após recusa do cartão: ${link.url}`
          );
        }
      } catch (error) {
        await addLog(
          fresh.id,
          stage,
          "CRIAR_NOVO_LINK",
          "Adyen",
          "FALHA",
          error instanceof Error ? error.message : "Falha ao gerar novo link."
        );
      }
      return "DECLINED";
    }

    // Status pendente (ex: 3DS ou análise de risco da adyen)
    await addLog(
      fresh.id,
      stage,
      "COBRAR_CARTAO",
      "Adyen",
      "PENDENTE",
      `Resultado não conclusivo (${result?.resultCode ?? "Sem resposta"}). Aguardando processamento.`
    );
    return "UNAVAILABLE";
  } catch (error) {
    await addLog(
      fresh.id,
      stage,
      "COBRAR_CARTAO",
      "Adyen",
      "FALHA",
      error instanceof Error ? error.message : "Falha na chamada de cobrança à Adyen."
    );
    return "UNAVAILABLE";
  }
}

export async function processBillingRule(now = new Date()) {
  const open = await db.loteCobranca.findMany({
    where: { status: "EM_REGUA" },
    orderBy: { dataCriacao: "asc" },
  });

  let processed = 0;

  for (const item of open) {
    // Trava de Concorrência Distribuída (processandoAte 5 minutos)
    const claimed = await db.loteCobranca.updateMany({
      where: {
        id: item.id,
        status: "EM_REGUA",
        OR: [{ processandoAte: null }, { processandoAte: { lt: now } }],
      },
      data: { processandoAte: new Date(now.getTime() + 5 * 60_000) },
    });

    if (!claimed.count) continue;

    try {
      let lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot || lot.status !== "EM_REGUA") continue;

      const age = now.getTime() - lot.dataCriacao.getTime();

      // ==========================================
      // ETAPA D+5: 1ª TENTATIVA NO CARTÃO
      // ==========================================
      if (age >= 5 * DAY && !lot.d5TentativaAt) {
        await db.loteCobranca.update({
          where: { id: lot.id },
          data: { etapaRegua: "D5" },
        });
        const outcome = await tryCardCharge(lot, "D5");
        if (outcome !== "UNAVAILABLE") {
          await db.loteCobranca.update({
            where: { id: lot.id },
            data: { d5TentativaAt: now },
          });
        }
        if (outcome === "PAID") {
          processed++;
          continue;
        }
      }

      // Revalida status antes de avançar para D+7
      lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot || lot.status !== "EM_REGUA") continue;

      // ==========================================
      // ETAPA D+7: LEMBRETE ATIVO VIA WHATSAPP
      // ==========================================
      if (age >= 7 * DAY && !lot.d7LembreteAt) {
        let message: { messageId?: string } | null = null;
        let sendStatus = "NAO_CONFIGURADO";
        let sendDetails: string | undefined = "Telefone ou gateway WhatsApp não configurado.";

        try {
          if (lot.telefoneCliente && process.env.WHATSAPP_API_URL) {
            message = await sendWhatsAppMessage(
              lot.telefoneCliente,
              buildPaymentMessage(lot.numeroContrato, lot.valorFinalCentavos, lot.adyenPaymentUrl),
              `LOTE_${lot.id}_D7`
            );
            if (message) {
              sendStatus = "ENVIADO";
              sendDetails = `Lembrete D+7 enviado com sucesso para ${lot.telefoneCliente}.`;
            }
          }
        } catch (error) {
          sendStatus = "FALHA";
          sendDetails = error instanceof Error ? error.message : "Falha no gateway WhatsApp.";
        }

        await db.loteCobranca.update({
          where: { id: lot.id },
          data: { ...(sendStatus === "ENVIADO" ? { d7LembreteAt: now } : {}), etapaRegua: "D7" },
        });
        await addLog(
          lot.id,
          "D7",
          "LEMBRETE_COBRANCA",
          "WhatsApp",
          sendStatus,
          sendDetails,
          message?.messageId
        );
      }

      // Revalida status antes de avançar para D+10
      lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot || lot.status !== "EM_REGUA") continue;

      // ==========================================
      // ETAPA D+10: 2ª TENTATIVA NO CARTÃO / INADIMPLÊNCIA
      // ==========================================
      if (age >= 10 * DAY && !lot.d10TentativaAt) {
        await db.loteCobranca.update({
          where: { id: lot.id },
          data: { etapaRegua: "D10" },
        });
        const outcome = await tryCardCharge(lot, "D10");
        if (outcome !== "UNAVAILABLE") {
          await db.loteCobranca.update({
            where: { id: lot.id },
            data: { d10TentativaAt: now },
          });
        }
        if (outcome === "DECLINED") {
          // Encaminha para Inadimplência
          await db.loteCobranca.update({
            where: { id: lot.id },
            data: { status: "INADIMPLENTE", etapaRegua: "D10" },
          });
          await addLog(
            lot.id,
            "D10",
            "ENCERRAR_REGUA",
            "Sistema",
            "INADIMPLENTE",
            "Cobrança sem sucesso após D+10; lote movido para Inadimplência / Negativação."
          );
        }
        if (outcome === "PAID") {
          processed++;
          continue;
        }
      }

      processed++;
    } catch (err) {
      // Captura erros inesperados para não travar os outros lotes da fila
      await addLog(
        item.id,
        "REGUA",
        "ERRO_PROCESSAMENTO",
        "Sistema",
        "FALHA",
        err instanceof Error ? err.message : "Erro inesperado ao processar lote."
      );
    } finally {
      // Libera a trava de concorrência
      await db.loteCobranca.updateMany({
        where: { id: item.id },
        data: { processandoAte: null },
      });
    }
  }

  return { encontrados: open.length, processados: processed };
}
