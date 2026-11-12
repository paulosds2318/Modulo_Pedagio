/** Regras do cancelamento de lote (cobrança gerada por engano, contestação, isenção…). Sem dependências, para testes. */

export const MOTIVOS_CANCELAMENTO: Record<string, string> = {
  CONTESTACAO: "Passagem contestada pelo cliente",
  CONTRATO_INCORRETO: "Contrato ou cliente incorreto",
  ISENCAO: "Cliente isento / cortesia",
  DUPLICIDADE: "Cobrança em duplicidade",
  OUTRO: "Outro",
};

/** Só lotes ainda não pagos podem ser cancelados. Lote pago se resolve com estorno, fora do módulo. */
export const STATUS_PERMITEM_CANCELAMENTO = ["EM_REGUA", "INADIMPLENTE"];

export function validarCancelamento(input: Record<string, unknown>): { ok: true; motivo: string; observacao: string } | { ok: false; erro: string } {
  const motivo = typeof input.motivo === "string" ? input.motivo : "";
  if (!(motivo in MOTIVOS_CANCELAMENTO)) return { ok: false, erro: "Escolha o motivo do cancelamento." };
  const observacao = typeof input.observacao === "string" ? input.observacao.trim() : "";
  if (observacao.length < 5) return { ok: false, erro: "Explique o cancelamento na observação (mínimo de 5 caracteres)." };
  if (observacao.length > 500) return { ok: false, erro: "A observação deve ter no máximo 500 caracteres." };
  return { ok: true, motivo, observacao };
}
