import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/adyen";
import { obterPrazosRegua } from "@/lib/services/config-regua";
import { vencimentoLink } from "@/lib/regua-config";

/** Ações do histórico que registram a criação de um link de pagamento para o lote. */
export const ACOES_LINK = ["CRIAR_PAY_BY_LINK", "CRIAR_NOVO_LINK", "GERAR_NOVO_LINK"];

/**
 * Gera um novo link de pagamento para o lote (link anterior expirado, recusa do cartão, renegociação).
 * Cada geração usa uma versão nova da chave de idempotência, para a API criar um link novo em vez de
 * devolver o anterior. Registra no histórico do lote com a ação GERAR_NOVO_LINK.
 */
export async function gerarNovoLink(loteId: number, etapa: string, detalhe: string) {
  const lote = await db.loteCobranca.findUnique({ where: { id: loteId } });
  if (!lote) throw new Error("Lote não encontrado.");
  const anteriores = await db.logRegua.count({ where: { loteId, acao: { in: ACOES_LINK }, resultado: "SUCESSO" } });
  const versao = Math.max(1, anteriores) + 1;
  const rental = await db.contratoLocacao.findUnique({ where: { numeroContrato: lote.numeroContrato }, select: { dataRetirada: true } });

  try {
    const link = await createPaymentLink(lote.id, lote.valorFinalCentavos, lote.numeroContrato, lote.cpfCliente, rental?.dataRetirada, versao);
    if (!link?.url) throw new Error("A API não retornou a URL do novo link.");
    await db.loteCobranca.update({
      where: { id: lote.id },
      data: {
        adyenLinkId: link.id ?? null,
        adyenPaymentUrl: link.url,
        linkExpiraEm: vencimentoLink(new Date(), (await obterPrazosRegua()).validadeLinkHoras),
        ...(link.nomeCliente ? { nomeCliente: link.nomeCliente } : {}),
        ...(link.telefoneContato ? { telefoneContato: link.telefoneContato } : {}),
      },
    });
    await db.logRegua.create({
      data: {
        loteId: lote.id,
        etapa,
        acao: "GERAR_NOVO_LINK",
        canal: "Coral/Foco",
        resultado: "SUCESSO",
        detalhesResposta: `${detalhe} Mesmo valor do lote: R$ ${(lote.valorFinalCentavos / 100).toFixed(2).replace(".", ",")} (versão ${versao}).`,
      },
    });
    return { url: link.url, versao, linkAnterior: lote.adyenPaymentUrl };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message.replace(/^CONFIG:\s*/, "") : "Falha ao gerar novo link.";
    await db.logRegua.create({
      data: { loteId: lote.id, etapa, acao: "GERAR_NOVO_LINK", canal: "Coral/Foco", resultado: "FALHA", detalhesResposta: mensagem.slice(0, 1000) },
    });
    throw new Error(mensagem);
  }
}
