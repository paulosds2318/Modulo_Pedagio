/**
 * Prazos da régua de cobrança. As etapas continuam identificadas internamente como D5, D7 e D10;
 * os dias de cada uma vêm da configuração (tabela configuracao_regua).
 */
export type PrazosRegua = {
  diasPrimeiraTentativa: number;
  diasLembrete: number;
  diasSegundaTentativa: number;
};

export const PRAZOS_PADRAO: PrazosRegua = { diasPrimeiraTentativa: 5, diasLembrete: 7, diasSegundaTentativa: 10 };
export const MAX_DIAS_REGUA = 60;

/** Valida os prazos: inteiros, crescentes (1ª tentativa < lembrete < 2ª tentativa) e até 60 dias. */
export function validarPrazos(input: Partial<Record<keyof PrazosRegua, unknown>>): { ok: true; prazos: PrazosRegua } | { ok: false; erro: string } {
  const valores = {
    diasPrimeiraTentativa: Number(input.diasPrimeiraTentativa),
    diasLembrete: Number(input.diasLembrete),
    diasSegundaTentativa: Number(input.diasSegundaTentativa),
  };
  for (const [campo, valor] of Object.entries(valores)) {
    if (!Number.isInteger(valor) || valor < 1 || valor > MAX_DIAS_REGUA) {
      return { ok: false, erro: `${ROTULOS[campo as keyof PrazosRegua]}: informe um número inteiro de 1 a ${MAX_DIAS_REGUA} dias.` };
    }
  }
  if (!(valores.diasPrimeiraTentativa < valores.diasLembrete && valores.diasLembrete < valores.diasSegundaTentativa)) {
    return { ok: false, erro: "Os prazos devem ser crescentes: 1ª tentativa < lembrete < 2ª tentativa." };
  }
  return { ok: true, prazos: valores };
}

export const ROTULOS: Record<keyof PrazosRegua, string> = {
  diasPrimeiraTentativa: "1ª tentativa no cartão",
  diasLembrete: "Lembrete por WhatsApp",
  diasSegundaTentativa: "2ª tentativa no cartão",
};

/** Rótulo da etapa com os dias configurados (ex.: D5 → "D+5"; se configurado 6 dias, "D+6"). */
export function rotuloEtapa(etapa: string, prazos: PrazosRegua = PRAZOS_PADRAO) {
  if (etapa === "D0") return "D+0";
  if (etapa === "D5") return `D+${prazos.diasPrimeiraTentativa}`;
  if (etapa === "D7") return `D+${prazos.diasLembrete}`;
  if (etapa === "D10") return `D+${prazos.diasSegundaTentativa}`;
  return etapa;
}
