import { db } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { TEMPLATES, textoProvisorio, type TemplateCobranca } from "@/lib/templates-cobranca";

type LoteNotificavel = {
  id: number;
  numeroContrato: string;
  nomeCliente: string | null;
  telefoneCliente: string | null;
  valorFinalCentavos: number;
  adyenPaymentUrl: string | null;
  linkExpiraEm: Date | null;
};

/**
 * Comunica o cliente numa etapa da régua, por WhatsApp e e-mail, e registra cada canal no histórico do lote.
 * Enquanto o canal ou o modelo oficial não estiverem configurados, registra "AGUARDANDO_CONFIGURACAO"
 * (a régua segue normalmente; quando os canais forem ligados, os próximos envios saem).
 */
export async function notificarCliente(lote: LoteNotificavel, template: TemplateCobranca, etapa: string) {
  const meta = TEMPLATES[template];
  const acao = `TEMPLATE_${template}`;
  const texto = textoProvisorio(template, {
    nomeCliente: lote.nomeCliente,
    numeroContrato: lote.numeroContrato,
    valorCentavos: lote.valorFinalCentavos,
    link: lote.adyenPaymentUrl,
    prazo: lote.linkExpiraEm,
  });
  const resultados: Array<{ canal: string; resultado: string }> = [];

  // WhatsApp: gateway configurado (WHATSAPP_API_URL) e telefone no lote.
  let whatsapp: { resultado: string; detalhe: string; messageId?: string };
  if (!process.env.WHATSAPP_API_URL) {
    whatsapp = { resultado: "AGUARDANDO_CONFIGURACAO", detalhe: `Template ${meta.numero} (${meta.nome}) não enviado: canal WhatsApp ainda não configurado.` };
  } else if (!lote.telefoneCliente) {
    whatsapp = { resultado: "IGNORADO", detalhe: `Template ${meta.numero} (${meta.nome}) não enviado: cliente sem telefone no lote.` };
  } else {
    try {
      const enviado = await sendWhatsAppMessage(lote.telefoneCliente, texto, `LOTE_${lote.id}_${etapa}_${template}`);
      whatsapp = enviado
        ? { resultado: "ENVIADO", detalhe: `Template ${meta.numero} (${meta.nome}) enviado por WhatsApp.`, messageId: enviado.messageId }
        : { resultado: "AGUARDANDO_CONFIGURACAO", detalhe: "Gateway WhatsApp não configurado." };
    } catch (error) {
      whatsapp = { resultado: "FALHA", detalhe: error instanceof Error ? error.message : "Falha no envio por WhatsApp." };
    }
  }
  await db.logRegua.create({
    data: { loteId: lote.id, etapa, acao, canal: "WhatsApp", resultado: whatsapp.resultado, detalhesResposta: whatsapp.detalhe, providerMessageId: whatsapp.messageId },
  });
  resultados.push({ canal: "WhatsApp", resultado: whatsapp.resultado });

  // E-mail: ainda sem provedor definido no módulo.
  await db.logRegua.create({
    data: {
      loteId: lote.id,
      etapa,
      acao,
      canal: "E-mail",
      resultado: "AGUARDANDO_CONFIGURACAO",
      detalhesResposta: `Template ${meta.numero} (${meta.nome}) não enviado: canal de e-mail ainda não configurado.`,
    },
  });
  resultados.push({ canal: "E-mail", resultado: "AGUARDANDO_CONFIGURACAO" });

  return resultados;
}
