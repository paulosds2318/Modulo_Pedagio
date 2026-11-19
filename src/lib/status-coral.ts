import { lerReferencia, type ReferenciaPagamento } from "./links-pagamento.ts";

/**
 * Consulta de pagamento e de régua no Coral. O Coral recebe o aviso da Adyen e o módulo consulta o Coral.
 * O formato abaixo é o contrato que pedimos ao time de TI; ajustar aqui quando eles responderem.
 *
 * GET <CORAL_PAYMENT_STATUS_URL>?references=LINK_1,LINK_2
 * -> { data: [ { reference, linkId, status, valorCentavos | amount, paidAt, paymentMethod, transactionId, updatedAt,
 *                regua: { etapa, proximaEtapa, proximaEm, encerradaMotivo, comunicacoes: [...], debito: {...} } } ] }
 */

/** Quem executa a régua: o módulo (padrão) ou o Coral. Com "coral" o módulo só acompanha e exibe. */
export function reguaExecutadaPeloCoral(valor = process.env.REGUA_EXECUTOR): boolean {
  return valor?.trim().toLowerCase() === "coral";
}

export type StatusPagamentoCoral = "AGUARDANDO" | "PAGO" | "EXPIRADO" | "RECUSADO";

export type ComunicacaoCoral = {
  etapa: string | null;
  template: number | null;
  canal: string | null;
  enviadoEm: string | null;
  entrega: string | null;
};

export type ReguaCoral = {
  /** Etapa interna do módulo (D0, D5, D7, D10) ou null quando o Coral não informou uma etapa conhecida. */
  etapa: "D0" | "D5" | "D7" | "D10" | null;
  etapaTexto: string | null;
  proximaEtapa: string | null;
  proximaEm: string | null;
  encerradaMotivo: "PAGO" | "EXTRAJUDICIAL" | "CANCELADO" | null;
  comunicacoes: ComunicacaoCoral[];
  debito: { resultado: string | null; em: string | null } | null;
};

export type ItemStatusCoral = {
  referencia: ReferenciaPagamento;
  status: StatusPagamentoCoral;
  valorCentavos: number | null;
  pagoEm: Date | null;
  forma: string | null;
  transacaoId: string | null;
  atualizadoEm: Date | null;
  regua: ReguaCoral | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

function texto(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function data(v: unknown): Date | null {
  const t = texto(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Etapa em D+N (ou D0, D5…) para a chave interna do módulo: D+0=D0, D+2=D5, D+5=D7, D+7=D10. */
export function etapaInterna(valor: unknown): ReguaCoral["etapa"] {
  const t = texto(valor)?.toUpperCase().replace(/\s/g, "");
  if (!t) return null;
  const mapa: Record<string, ReguaCoral["etapa"]> = { "D+0": "D0", D0: "D0", "D+2": "D5", D2: "D5", "D+5": "D7", D5: "D7", "D+7": "D10", D7: "D10" };
  return mapa[t] ?? null;
}

const PAGO = new Set(["PAID", "PAGO", "AUTHORISED", "AUTHORIZED", "APPROVED", "COMPLETED"]);
const EXPIRADO = new Set(["EXPIRED", "EXPIRADO"]);
const RECUSADO = new Set(["REFUSED", "RECUSADO", "DECLINED", "FAILED"]);

function statusPagamento(v: unknown): StatusPagamentoCoral {
  const t = texto(v)?.toUpperCase();
  if (t && PAGO.has(t)) return "PAGO";
  if (t && EXPIRADO.has(t)) return "EXPIRADO";
  if (t && RECUSADO.has(t)) return "RECUSADO";
  return "AGUARDANDO";
}

function motivoEncerramento(v: unknown): ReguaCoral["encerradaMotivo"] {
  const t = texto(v)?.toUpperCase();
  if (!t) return null;
  if (t.startsWith("PAG") || t === "PAID") return "PAGO";
  if (t.startsWith("EXTRA")) return "EXTRAJUDICIAL";
  if (t.startsWith("CANCEL")) return "CANCELADO";
  return null;
}

function lerRegua(v: unknown): ReguaCoral | null {
  const r = obj(v);
  if (!Object.keys(r).length) return null;
  const comunicacoes = (Array.isArray(r.comunicacoes) ? r.comunicacoes : []).map((c) => {
    const o = obj(c);
    const template = typeof o.template === "number" ? o.template : Number.parseInt(texto(o.template) ?? "", 10);
    return {
      etapa: texto(o.etapa),
      template: Number.isFinite(template) ? template : null,
      canal: texto(o.canal),
      enviadoEm: data(o.enviadoEm)?.toISOString() ?? null,
      entrega: texto(o.entrega),
    };
  });
  const debito = obj(r.debito);
  return {
    etapa: etapaInterna(r.etapa),
    etapaTexto: texto(r.etapa),
    proximaEtapa: texto(r.proximaEtapa),
    proximaEm: data(r.proximaEm)?.toISOString() ?? null,
    encerradaMotivo: motivoEncerramento(r.encerradaMotivo),
    comunicacoes,
    debito: Object.keys(debito).length ? { resultado: texto(debito.resultado), em: data(debito.em)?.toISOString() ?? null } : null,
  };
}

/** Lê a resposta da consulta. Itens sem referência conhecida (LINK_<id> ou LOTE_<id>) são ignorados. */
export function lerRespostaStatus(corpo: unknown): ItemStatusCoral[] {
  const raiz = obj(corpo);
  const dados = raiz.data;
  const lista = Array.isArray(corpo) ? corpo : Array.isArray(dados) ? dados : Array.isArray(obj(dados).data) ? (obj(dados).data as unknown[]) : [];
  const itens: ItemStatusCoral[] = [];
  for (const bruto of lista) {
    const o = obj(bruto);
    const refTexto = texto(o.reference);
    const referencia = refTexto ? lerReferencia(refTexto) : null;
    if (!referencia) continue;
    let valorCentavos: number | null = null;
    if (typeof o.valorCentavos === "number" && Number.isInteger(o.valorCentavos) && o.valorCentavos > 0) valorCentavos = o.valorCentavos;
    else if (typeof o.amount === "number" && Number.isFinite(o.amount) && o.amount > 0) valorCentavos = Math.round(o.amount * 100);
    itens.push({
      referencia,
      status: statusPagamento(o.status),
      valorCentavos,
      pagoEm: data(o.paidAt),
      forma: texto(o.paymentMethod),
      transacaoId: texto(o.transactionId),
      atualizadoEm: data(o.updatedAt),
      regua: lerRegua(o.regua),
    });
  }
  return itens;
}
