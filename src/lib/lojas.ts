/**
 * Lojas da Foco (mesma lista do controle de acesso do Coral). O contrato começa com a sigla da loja:
 * AJU000001-26 é da AJU10, CGH000004-26 é da SAO11 - CGH, GRU… é da SAO10 - GRU.
 */
export const LOJAS = [
  { codigo: "AJU10", sigla: "AJU" },
  { codigo: "BPS10", sigla: "BPS" },
  { codigo: "CGR10", sigla: "CGR" },
  { codigo: "CNF10", sigla: "CNF" },
  { codigo: "CWB10", sigla: "CWB" },
  { codigo: "FLN10", sigla: "FLN" },
  { codigo: "FOR10", sigla: "FOR" },
  { codigo: "GIG10", sigla: "GIG" },
  { codigo: "GYN10", sigla: "GYN" },
  { codigo: "JPA10", sigla: "JPA" },
  { codigo: "MCZ10", sigla: "MCZ" },
  { codigo: "NAT10", sigla: "NAT" },
  { codigo: "NVT10", sigla: "NVT" },
  { codigo: "POA10", sigla: "POA" },
  { codigo: "QNS10", sigla: "QNS" },
  { codigo: "RAO10", sigla: "RAO" },
  { codigo: "REC20", sigla: "REC" },
  { codigo: "SAO10 - GRU", sigla: "GRU" },
  { codigo: "SAO11 - CGH", sigla: "CGH" },
  { codigo: "SDU10", sigla: "SDU" },
  { codigo: "SSA10", sigla: "SSA" },
  { codigo: "VCP10", sigla: "VCP" },
  { codigo: "VIX10", sigla: "VIX" },
] as const;

export const CODIGOS_LOJA: string[] = LOJAS.map((l) => l.codigo);

/** Loja do contrato pela sigla inicial (ex.: CGH000004-26 → "SAO11 - CGH"); null quando não bate com nenhuma. */
export function lojaDoContrato(numeroContrato: string | null | undefined): string | null {
  const prefixo = (numeroContrato ?? "").trim().slice(0, 3).toUpperCase();
  return LOJAS.find((l) => l.sigla === prefixo)?.codigo ?? null;
}

/** Sigla de contrato de uma loja da lista (para filtrar por início do número do contrato). */
export function siglaDaLoja(codigo: string | null | undefined): string | null {
  return LOJAS.find((l) => l.codigo === codigo)?.sigla ?? null;
}
