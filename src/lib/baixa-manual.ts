/** Regras da baixa manual de um lote (pagamento recebido fora do link/cartão). Sem dependências, para testes. */

export const FORMAS_BAIXA_MANUAL: Record<string, string> = {
  PIX: "PIX",
  DEPOSITO: "Depósito ou transferência",
  DINHEIRO: "Dinheiro",
  NEGOCIACAO: "Acordo / negociação",
  OUTRO: "Outro",
};

/** Rótulos de todas as formas de pagamento, inclusive as automáticas. */
export const FORMAS_PAGAMENTO: Record<string, string> = {
  ADYEN_LINK: "Link de pagamento",
  CARTAO: "Cartão salvo (débito automático)",
  ...FORMAS_BAIXA_MANUAL,
};

/** Situações em que a baixa manual é permitida: régua em andamento ou encerrada sem pagamento. */
export const STATUS_PERMITEM_BAIXA = ["EM_REGUA", "INADIMPLENTE"];

const MAX_CENTAVOS = 50_000_000;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const hojeBrasilia = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

export type BaixaManual = {
  forma: string;
  dataPagamento: Date;
  valorRecebidoCentavos: number;
  observacao: string;
};

/**
 * Valida a baixa. `dataCriacaoLote` impede pagamento anterior à emissão do lote; o valor pode diferir do devido
 * (acordo), mas nesse caso a observação é obrigatória e explica a diferença.
 */
export function validarBaixaManual(
  input: Record<string, unknown>,
  lote: { valorFinalCentavos: number; dataCriacao: Date },
  now = new Date()
): { ok: true; baixa: BaixaManual; divergenteCentavos: number } | { ok: false; erro: string } {
  const forma = typeof input.forma === "string" ? input.forma : "";
  if (!(forma in FORMAS_BAIXA_MANUAL)) return { ok: false, erro: "Escolha a forma de pagamento." };

  const dia = typeof input.dataPagamento === "string" ? input.dataPagamento.trim() : "";
  if (!DIA.test(dia)) return { ok: false, erro: "Informe a data do pagamento (AAAA-MM-DD)." };
  if (dia > hojeBrasilia(now)) return { ok: false, erro: "A data do pagamento não pode ser no futuro." };
  if (dia < hojeBrasilia(lote.dataCriacao)) return { ok: false, erro: "A data do pagamento não pode ser anterior à emissão do lote." };

  const valor = Number(input.valorRecebidoCentavos);
  if (!Number.isInteger(valor) || valor <= 0 || valor > MAX_CENTAVOS) return { ok: false, erro: "Informe o valor recebido (maior que zero)." };

  const observacao = typeof input.observacao === "string" ? input.observacao.trim() : "";
  if (observacao.length < 5) return { ok: false, erro: "Descreva o pagamento na observação (ex.: número do comprovante)." };
  if (observacao.length > 500) return { ok: false, erro: "A observação deve ter no máximo 500 caracteres." };

  return {
    ok: true,
    // Meio-dia de Brasília: o dia informado não muda ao converter para UTC.
    baixa: { forma, dataPagamento: new Date(`${dia}T12:00:00-03:00`), valorRecebidoCentavos: valor, observacao },
    divergenteCentavos: valor - lote.valorFinalCentavos,
  };
}

/** Converte "13,21" ou "1.234,56" em centavos; null se inválido. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  const valor = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? Math.round(valor * 100) : null;
}
