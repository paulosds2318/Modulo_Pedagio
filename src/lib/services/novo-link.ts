import { db } from "@/lib/db";
import { gerarLinkPagamento } from "@/lib/services/links-pagamento";

/** Ações do histórico que registram a criação de um link de pagamento para o lote. */
export const ACOES_LINK = ["CRIAR_PAY_BY_LINK", "CRIAR_NOVO_LINK", "GERAR_NOVO_LINK", "GERAR_LINK_PAGAMENTO"];

/**
 * Novo link da régua (D+2 recusado e D+5) para as passagens ainda em aberto do lote, com o valor que falta pagar.
 * Registra no histórico do lote com a ação GERAR_NOVO_LINK.
 */
export async function gerarNovoLink(loteId: number, etapa: string, detalhe: string) {
  const anterior = await db.loteCobranca.findUnique({ where: { id: loteId }, select: { adyenPaymentUrl: true } });
  const { link } = await gerarLinkPagamento({ loteId, origem: "REGUA", etapa, logAcao: "GERAR_NOVO_LINK", detalhe });
  return { url: link.url, linkAnterior: anterior?.adyenPaymentUrl ?? null };
}
