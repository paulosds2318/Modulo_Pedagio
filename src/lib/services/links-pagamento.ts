import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/adyen";
import { obterPrazosRegua } from "@/lib/services/config-regua";
import { vencimentoLink } from "@/lib/regua-config";
import {
  STATUS_LOTE_COBRAVEL,
  referenciaDoLink,
  selecionarPassagens,
  valorDoLink,
  type EventoPagamento,
} from "@/lib/links-pagamento";

export type OrigemLink = "REGUA" | "MANUAL" | "LOTE";

export class ErroLink extends Error {
  status: number;
  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const REUTILIZAR_MS = 30_000;

/**
 * Gera um link de pagamento para todas as passagens em aberto do lote ou só para as informadas, e grava o link
 * com as passagens que ele cobre. A referência enviada ao Coral é LINK_<id>, que volta no webhook de pagamento.
 * Um clique repetido (mesmas passagens em até 30 s) devolve o link que acabou de ser criado.
 */
export async function gerarLinkPagamento(input: {
  loteId: number;
  passagemIds?: number[] | null;
  origem: OrigemLink;
  usuario?: string | null;
  etapa?: string;
  /** Ação gravada no histórico do lote (a régua mantém CRIAR_PAY_BY_LINK e GERAR_NOVO_LINK). */
  logAcao?: string;
  detalhe?: string;
}) {
  const lote = await db.loteCobranca.findUnique({ where: { id: input.loteId }, include: { passagens: { select: { id: true, valorCentavos: true, statusPagamento: true } } } });
  if (!lote) throw new ErroLink("Lote não encontrado.", 404);
  if (!STATUS_LOTE_COBRAVEL.includes(lote.status)) {
    throw new ErroLink("Só é possível gerar link para lotes em régua ou em tratamento manual.", 409);
  }
  const escolha = selecionarPassagens(lote.passagens, input.passagemIds);
  if (!escolha.ok) throw new ErroLink(escolha.erro, 400);
  const valor = valorDoLink(escolha.selecionadas, escolha.cobreTudo, lote.taxaCentavos);
  if (valor <= 0) throw new ErroLink("Valor do link deve ser maior que zero.", 400);
  const ids = escolha.selecionadas.map((p) => p.id).sort((a, b) => a - b);

  const recentes = await db.linkPagamento.findMany({
    where: { loteId: lote.id, status: "ATIVO", valorCentavos: valor, criadoEm: { gte: new Date(Date.now() - REUTILIZAR_MS) } },
    include: { passagens: { select: { passagemId: true } } },
  });
  const igual = recentes.find((l) => l.passagens.length === ids.length && l.passagens.every((p) => ids.includes(p.passagemId)));
  if (igual) return { link: igual, reutilizado: true };

  const etapa = input.etapa ?? lote.etapaRegua;
  const logAcao = input.logAcao ?? "GERAR_LINK_PAGAMENTO";
  const { validadeLinkHoras } = await obterPrazosRegua();
  const expiraEm = vencimentoLink(new Date(), validadeLinkHoras);

  // O registro nasce antes da chamada ao Coral para termos o ID da referência; se a chamada falhar, é removido.
  const registro = await db.linkPagamento.create({
    data: {
      loteId: lote.id,
      numeroContrato: lote.numeroContrato,
      valorCentavos: valor,
      url: "",
      status: "GERANDO",
      origem: input.origem,
      criadoPor: input.usuario ?? null,
      expiraEm,
      passagens: { create: ids.map((passagemId) => ({ passagemId })) },
    },
  });

  try {
    const rental = await db.contratoLocacao.findUnique({ where: { numeroContrato: lote.numeroContrato }, select: { dataRetirada: true } });
    const criado = await createPaymentLink(lote.id, valor, lote.numeroContrato, lote.cpfCliente, rental?.dataRetirada, undefined, {
      reference: referenciaDoLink(registro.id),
      idempotencyKey: `foco-toll-link-${registro.id}`,
    });
    if (!criado?.url) throw new Error("A API não retornou a URL do link.");
    const link = await db.linkPagamento.update({ where: { id: registro.id }, data: { url: criado.url, linkIdExterno: criado.id ?? null, status: "ATIVO" } });
    await db.loteCobranca.update({
      where: { id: lote.id },
      data: {
        adyenLinkId: criado.id ?? null,
        adyenPaymentUrl: criado.url,
        linkExpiraEm: expiraEm,
        ...(criado.nomeCliente ? { nomeCliente: criado.nomeCliente } : {}),
        ...(criado.telefoneContato ? { telefoneContato: criado.telefoneContato } : {}),
        ...(criado.email ? { emailCliente: criado.email } : {}),
      },
    });
    await db.logRegua.create({
      data: {
        loteId: lote.id,
        etapa,
        acao: logAcao,
        canal: "Coral/Foco",
        resultado: "SUCESSO",
        detalhesResposta: `${input.detalhe ?? (input.usuario ? `Link gerado por ${input.usuario}.` : "Link gerado.")} Link ${link.id}: ${money(valor)} para ${ids.length === lote.passagens.length ? "todas as" : `${ids.length} de ${lote.passagens.length}`} passagens (${ids.map((i) => `#${i}`).join(", ")}).`.slice(0, 1000),
      },
    });
    return { link, reutilizado: false };
  } catch (error) {
    await db.linkPagamento.delete({ where: { id: registro.id } }).catch(() => undefined);
    const mensagem = error instanceof Error ? error.message.replace(/^CONFIG:\s*/, "") : "Falha ao gerar o link.";
    await db.logRegua.create({
      data: { loteId: lote.id, etapa, acao: logAcao, canal: "Coral/Foco", resultado: "FALHA", detalhesResposta: mensagem.slice(0, 1000) },
    });
    throw new ErroLink(mensagem, 502);
  }
}

export type ResultadoPagamento = "BAIXADO" | "PARCIAL" | "JA_PAGO" | "DUPLICADO" | "DIVERGENTE" | "NAO_ENCONTRADO";

/**
 * Aplica o retorno de pagamento de um link: marca o link e as passagens como pagos e, quando não resta passagem
 * em aberto, baixa o lote e encerra a régua. Idempotente (o mesmo aviso repetido não faz nada) e sem baixa
 * automática quando o valor recebido difere do valor do link.
 */
export async function aplicarPagamentoLink(linkId: number, evento: Pick<EventoPagamento, "valorCentavos" | "pagoEm" | "forma" | "transacaoId">): Promise<ResultadoPagamento> {
  const link = await db.linkPagamento.findUnique({ where: { id: linkId }, include: { passagens: { select: { passagemId: true } } } });
  if (!link) return "NAO_ENCONTRADO";
  if (link.status === "PAGO") return "JA_PAGO";

  const lote = await db.loteCobranca.findUnique({ where: { id: link.loteId } });
  if (!lote) return "NAO_ENCONTRADO";

  if (evento.valorCentavos !== null && evento.valorCentavos !== link.valorCentavos) {
    await db.logRegua.create({
      data: {
        loteId: lote.id,
        etapa: lote.etapaRegua,
        acao: "ALERTA_DIVERGENCIA_VALOR",
        canal: "Coral",
        resultado: "BLOQUEADO",
        detalhesResposta: `Valor divergente no link ${link.id}! Esperado ${money(link.valorCentavos)}, recebido ${money(evento.valorCentavos)}${evento.transacaoId ? ` (transação ${evento.transacaoId})` : ""}. Baixa automática bloqueada por segurança.`,
      },
    });
    return "DIVERGENTE";
  }

  const forma = evento.forma ?? "ADYEN_LINK";
  return db.$transaction(async (tx) => {
    const reivindicado = await tx.linkPagamento.updateMany({
      where: { id: link.id, status: { not: "PAGO" } },
      data: { status: "PAGO", pagoEm: evento.pagoEm, transacaoId: evento.transacaoId, formaPagamento: forma },
    });
    if (!reivindicado.count) return "JA_PAGO" as const;

    const atual = await tx.loteCobranca.findUniqueOrThrow({ where: { id: lote.id } });
    const idsPassagens = link.passagens.map((p) => p.passagemId);
    const jaPagas = await tx.passagemPedagio.count({ where: { id: { in: idsPassagens }, statusPagamento: "PAGA" } });

    // Lote já pago por outro meio, cancelado, ou passagens já pagas por outro link: o cliente pagou em dobro.
    if (!STATUS_LOTE_COBRAVEL.includes(atual.status) || jaPagas > 0) {
      await tx.logRegua.create({
        data: {
          loteId: lote.id,
          etapa: atual.etapaRegua,
          acao: "ALERTA_DUPLICIDADE_DEBITO",
          canal: "Coral",
          resultado: "ESTORNO_NECESSARIO",
          detalhesResposta: `Link ${link.id} (${money(link.valorCentavos)}) foi pago, mas ${atual.status === "PAGO" ? "o lote já estava pago" : atual.status === "CANCELADO" ? "o lote está cancelado" : "parte das passagens já tinha sido paga"}. Necessário estorno${evento.transacaoId ? ` (transação ${evento.transacaoId})` : ""}.`,
        },
      });
      return "DUPLICADO" as const;
    }

    await tx.passagemPedagio.updateMany({
      where: { id: { in: idsPassagens } },
      data: { statusPagamento: "PAGA", pagoEm: evento.pagoEm, linkPagoId: link.id },
    });
    const emAberto = await tx.passagemPedagio.count({ where: { loteId: lote.id, statusPagamento: { not: "PAGA" } } });
    const valorPago = atual.valorPagoCentavos + link.valorCentavos;

    if (emAberto > 0) {
      await tx.loteCobranca.update({ where: { id: lote.id }, data: { valorPagoCentavos: valorPago } });
      await tx.logRegua.create({
        data: {
          loteId: lote.id,
          etapa: atual.etapaRegua,
          acao: "PAGAMENTO_LINK",
          canal: "Coral",
          resultado: "PARCIAL",
          detalhesResposta: `Link ${link.id} pago (${money(link.valorCentavos)}). Restam ${emAberto} passagem(ns) em aberto; a régua segue com ${money(Math.max(0, atual.valorFinalCentavos - valorPago))}.`,
          providerMessageId: evento.transacaoId ?? undefined,
        },
      });
      return "PARCIAL" as const;
    }

    await tx.loteCobranca.update({
      where: { id: lote.id },
      data: {
        status: "PAGO",
        dataPagamento: evento.pagoEm,
        formaPagamento: forma,
        adyenPspReference: evento.transacaoId ?? atual.adyenPspReference,
        valorPagoCentavos: valorPago,
        valorRecebidoCentavos: valorPago,
        processandoAte: null,
      },
    });
    await tx.linkPagamento.updateMany({ where: { loteId: lote.id, status: "ATIVO" }, data: { status: "CANCELADO" } });
    await tx.integrationOutbox.updateMany({
      where: { loteId: lote.id, status: { in: ["PENDENTE", "AGUARDANDO_CONFIGURACAO"] } },
      data: { status: "CANCELADO", ultimoErro: "Cancelada: lote pago pelo link." },
    });
    await tx.logRegua.create({
      data: {
        loteId: lote.id,
        etapa: atual.etapaRegua,
        acao: "PAGAMENTO_LINK",
        canal: "Coral",
        resultado: "PAGO",
        detalhesResposta: `Link ${link.id} pago (${money(link.valorCentavos)}). Lote baixado e régua encerrada.`,
        providerMessageId: evento.transacaoId ?? undefined,
      },
    });
    return "BAIXADO" as const;
  });
}

/** Retorno de pagamento com a referência antiga LOTE_<id> (links criados antes dos links por passagem): paga o lote todo. */
export async function aplicarPagamentoLoteLegado(loteId: number, evento: Pick<EventoPagamento, "valorCentavos" | "pagoEm" | "forma" | "transacaoId">): Promise<ResultadoPagamento> {
  const lote = await db.loteCobranca.findUnique({ where: { id: loteId } });
  if (!lote) return "NAO_ENCONTRADO";
  if (lote.status === "PAGO") return "JA_PAGO";
  const devido = Math.max(0, lote.valorFinalCentavos - lote.valorPagoCentavos);
  if (evento.valorCentavos !== null && evento.valorCentavos !== devido) {
    await db.logRegua.create({
      data: {
        loteId,
        etapa: lote.etapaRegua,
        acao: "ALERTA_DIVERGENCIA_VALOR",
        canal: "Coral",
        resultado: "BLOQUEADO",
        detalhesResposta: `Valor divergente! Esperado ${money(devido)}, recebido ${money(evento.valorCentavos)}. Baixa automática bloqueada por segurança.`,
      },
    });
    return "DIVERGENTE";
  }
  if (!STATUS_LOTE_COBRAVEL.includes(lote.status)) return "DUPLICADO";
  const baixado = await db.$transaction(async (tx) => {
    const r = await tx.loteCobranca.updateMany({
      where: { id: loteId, status: { in: STATUS_LOTE_COBRAVEL } },
      data: { status: "PAGO", dataPagamento: evento.pagoEm, formaPagamento: evento.forma ?? "ADYEN_LINK", adyenPspReference: evento.transacaoId, valorRecebidoCentavos: lote.valorFinalCentavos, processandoAte: null },
    });
    if (!r.count) return false;
    await tx.passagemPedagio.updateMany({ where: { loteId, statusPagamento: { not: "PAGA" } }, data: { statusPagamento: "PAGA", pagoEm: evento.pagoEm } });
    await tx.linkPagamento.updateMany({ where: { loteId, status: "ATIVO" }, data: { status: "CANCELADO" } });
    await tx.integrationOutbox.updateMany({ where: { loteId, status: { in: ["PENDENTE", "AGUARDANDO_CONFIGURACAO"] } }, data: { status: "CANCELADO", ultimoErro: "Cancelada: lote pago pelo link." } });
    await tx.logRegua.create({
      data: { loteId, etapa: lote.etapaRegua, acao: "PAGAMENTO_LINK", canal: "Coral", resultado: "PAGO", detalhesResposta: `Pagamento do link confirmado (${money(devido)}). Lote baixado e régua encerrada.`, providerMessageId: evento.transacaoId ?? undefined },
    });
    return true;
  });
  return baixado ? "BAIXADO" : "JA_PAGO";
}
