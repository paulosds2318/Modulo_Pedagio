/**
 * Prazos da régua de cobrança (alinhamento com o Financeiro):
 *   D+0  cobrança inicial com link de 48 h (template 1)
 *   D+2  1ª tentativa no cartão → aprovado: aviso de débito (template 2); recusado: nova cobrança com link (template 3)
 *   D+5  última cobrança com link de 48 h (template 4)
 *   D+7  2ª tentativa no cartão → aprovado: aviso de débito (template 5); recusado: cobrança extrajudicial (template 6)
 * As etapas continuam identificadas internamente como D5, D7 e D10 (1ª tentativa, última cobrança, 2ª tentativa);
 * os dias de cada uma vêm da configuração (tabela configuracao_regua).
 */
export type PrazosRegua = {
  diasPrimeiraTentativa: number;
  diasLembrete: number;
  diasSegundaTentativa: number;
  validadeLinkHoras: number;
};

export const PRAZOS_PADRAO: PrazosRegua = { diasPrimeiraTentativa: 2, diasLembrete: 5, diasSegundaTentativa: 7, validadeLinkHoras: 48 };
export const MAX_DIAS_REGUA = 60;
export const MAX_HORAS_LINK = 168;

type CampoDias = "diasPrimeiraTentativa" | "diasLembrete" | "diasSegundaTentativa";

export const ROTULOS: Record<keyof PrazosRegua, string> = {
  diasPrimeiraTentativa: "1ª tentativa no cartão",
  diasLembrete: "Última cobrança com link",
  diasSegundaTentativa: "2ª tentativa no cartão",
  validadeLinkHoras: "Validade do link de pagamento",
};

/** Valida os prazos: dias inteiros e crescentes (1ª tentativa < última cobrança < 2ª tentativa) e validade do link em horas. */
export function validarPrazos(input: Partial<Record<keyof PrazosRegua, unknown>>): { ok: true; prazos: PrazosRegua } | { ok: false; erro: string } {
  const valores: PrazosRegua = {
    diasPrimeiraTentativa: Number(input.diasPrimeiraTentativa),
    diasLembrete: Number(input.diasLembrete),
    diasSegundaTentativa: Number(input.diasSegundaTentativa),
    validadeLinkHoras: input.validadeLinkHoras === undefined ? PRAZOS_PADRAO.validadeLinkHoras : Number(input.validadeLinkHoras),
  };
  for (const campo of ["diasPrimeiraTentativa", "diasLembrete", "diasSegundaTentativa"] as CampoDias[]) {
    const valor = valores[campo];
    if (!Number.isInteger(valor) || valor < 1 || valor > MAX_DIAS_REGUA) {
      return { ok: false, erro: `${ROTULOS[campo]}: informe um número inteiro de 1 a ${MAX_DIAS_REGUA} dias.` };
    }
  }
  if (!(valores.diasPrimeiraTentativa < valores.diasLembrete && valores.diasLembrete < valores.diasSegundaTentativa)) {
    return { ok: false, erro: "Os prazos devem ser crescentes: 1ª tentativa < última cobrança < 2ª tentativa." };
  }
  if (!Number.isInteger(valores.validadeLinkHoras) || valores.validadeLinkHoras < 1 || valores.validadeLinkHoras > MAX_HORAS_LINK) {
    return { ok: false, erro: `${ROTULOS.validadeLinkHoras}: informe um número inteiro de 1 a ${MAX_HORAS_LINK} horas.` };
  }
  return { ok: true, prazos: valores };
}

/** Rótulo da etapa com os dias configurados (ex.: D5 → "D+2" com o padrão). */
export function rotuloEtapa(etapa: string, prazos: Pick<PrazosRegua, CampoDias> = PRAZOS_PADRAO) {
  if (etapa === "D0") return "D+0";
  if (etapa === "D5") return `D+${prazos.diasPrimeiraTentativa}`;
  if (etapa === "D7") return `D+${prazos.diasLembrete}`;
  if (etapa === "D10") return `D+${prazos.diasSegundaTentativa}`;
  return etapa;
}

/** Data em que um link emitido em `emitidoEm` vence. */
export function vencimentoLink(emitidoEm: Date, validadeHoras: number) {
  return new Date(emitidoEm.getTime() + validadeHoras * 60 * 60 * 1000);
}

/**
 * O link atual já venceu? Sem link, conta como vencido. Sem data de vencimento gravada (lotes antigos),
 * estima pela emissão do lote. A régua só tenta o débito no cartão com o link vencido (sem risco de pagamento em dobro).
 */
export function linkVencido(
  lote: { adyenPaymentUrl: string | null; linkExpiraEm: Date | null; dataCriacao: Date },
  validadeHoras: number,
  now = new Date()
) {
  if (!lote.adyenPaymentUrl) return true;
  const vence = lote.linkExpiraEm ?? vencimentoLink(lote.dataCriacao, validadeHoras);
  return now.getTime() >= vence.getTime();
}
