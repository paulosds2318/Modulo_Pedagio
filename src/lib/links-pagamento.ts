/**
 * Regras dos links de pagamento por passagem. Sem dependências de servidor, para testar com `node --test`.
 *
 * Um lote tem uma ou mais passagens, cada uma com ID próprio. O link pode cobrir todas as passagens em aberto
 * (padrão) ou só algumas. A taxa do lote vai junto com o link que fecha as últimas passagens em aberto.
 */

export const STATUS_LOTE_COBRAVEL = ["EM_REGUA", "INADIMPLENTE"];

export type PassagemLink = { id: number; valorCentavos: number; statusPagamento: string };

export type SelecaoPassagens =
  | { ok: true; selecionadas: PassagemLink[]; abertas: PassagemLink[]; cobreTudo: boolean }
  | { ok: false; erro: string };

/** Escolhe as passagens do link: as informadas (todas precisam estar em aberto no lote) ou, sem lista, todas as em aberto. */
export function selecionarPassagens(passagens: PassagemLink[], ids?: number[] | null): SelecaoPassagens {
  const abertas = passagens.filter((p) => p.statusPagamento !== "PAGA");
  if (!abertas.length) return { ok: false, erro: "Todas as passagens deste lote já foram pagas." };
  if (!ids || !ids.length) return { ok: true, selecionadas: abertas, abertas, cobreTudo: true };

  const unicos = [...new Set(ids)];
  const selecionadas: PassagemLink[] = [];
  for (const id of unicos) {
    const passagem = passagens.find((p) => p.id === id);
    if (!passagem) return { ok: false, erro: `A passagem ${id} não pertence a este lote.` };
    if (passagem.statusPagamento === "PAGA") return { ok: false, erro: `A passagem ${id} já foi paga.` };
    selecionadas.push(passagem);
  }
  return { ok: true, selecionadas, abertas, cobreTudo: selecionadas.length === abertas.length };
}

/** Valor do link: soma das passagens, mais a taxa do lote quando o link cobre todas as que ainda estão em aberto. */
export function valorDoLink(selecionadas: PassagemLink[], cobreTudo: boolean, taxaCentavos: number): number {
  return selecionadas.reduce((soma, p) => soma + p.valorCentavos, 0) + (cobreTudo ? Math.max(0, taxaCentavos) : 0);
}

/** Valor ainda devido do lote (já abatido o que foi pago por links parciais). */
export function valorEmAberto(valorFinalCentavos: number, valorPagoCentavos: number): number {
  return Math.max(0, valorFinalCentavos - valorPagoCentavos);
}

/** Referência enviada ao Coral e devolvida no retorno do pagamento. */
export const referenciaDoLink = (linkId: number) => `LINK_${linkId}`;

export type ReferenciaPagamento = { tipo: "LINK" | "LOTE"; id: number };

export function lerReferencia(referencia: string): ReferenciaPagamento | null {
  const link = /^LINK_(\d+)$/.exec(referencia.trim());
  if (link) return { tipo: "LINK", id: Number(link[1]) };
  const lote = /^LOTE_(\d+)(?:_|$)/.exec(referencia.trim());
  if (lote) return { tipo: "LOTE", id: Number(lote[1]) };
  return null;
}

export type EventoPagamento = {
  referencia: ReferenciaPagamento;
  status: "PAGO" | "EXPIRADO" | "RECUSADO";
  valorCentavos: number | null;
  pagoEm: Date;
  forma: string | null;
  transacaoId: string | null;
};

function texto(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

const STATUS_PAGO = new Set(["PAID", "PAGO", "AUTHORISED", "AUTHORIZED", "APPROVED", "COMPLETED"]);
const STATUS_EXPIRADO = new Set(["EXPIRED", "EXPIRADO"]);
const STATUS_RECUSADO = new Set(["REFUSED", "RECUSADO", "DECLINED", "FAILED", "CANCELED", "CANCELLED"]);

/**
 * Lê o corpo do webhook de pagamento do Coral (contrato que pedimos ao time de TI):
 * { reference, status, valorCentavos | amount, paidAt, paymentMethod, transactionId }.
 */
export function lerEventoPagamento(body: unknown, agora = new Date()): { ok: true; evento: EventoPagamento } | { ok: false; erro: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, erro: "Corpo inválido." };
  const b = body as Record<string, unknown>;
  const referenciaTexto = texto(b.reference);
  const referencia = referenciaTexto ? lerReferencia(referenciaTexto) : null;
  if (!referencia) return { ok: false, erro: "Referência ausente ou desconhecida (esperado LINK_<id>)." };

  const situacao = texto(b.status)?.toUpperCase();
  const status = situacao && STATUS_PAGO.has(situacao) ? "PAGO" : situacao && STATUS_EXPIRADO.has(situacao) ? "EXPIRADO" : situacao && STATUS_RECUSADO.has(situacao) ? "RECUSADO" : null;
  if (!status) return { ok: false, erro: "Status desconhecido." };

  let valorCentavos: number | null = null;
  if (typeof b.valorCentavos === "number" && Number.isInteger(b.valorCentavos) && b.valorCentavos > 0) valorCentavos = b.valorCentavos;
  else if (typeof b.amount === "number" && Number.isFinite(b.amount) && b.amount > 0) valorCentavos = Math.round(b.amount * 100);

  const data = texto(b.paidAt) ? new Date(texto(b.paidAt)!) : agora;
  return {
    ok: true,
    evento: {
      referencia,
      status,
      valorCentavos,
      pagoEm: Number.isNaN(data.getTime()) ? agora : data,
      forma: texto(b.paymentMethod),
      transacaoId: texto(b.transactionId),
    },
  };
}
