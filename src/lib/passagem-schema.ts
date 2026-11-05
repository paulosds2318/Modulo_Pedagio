import { z } from "zod";

/**
 * Contrato canônico de passagem (docs/integracao-coral-adyen.md), compartilhado por
 * POST /api/passagens (Coral envia) e pela consulta ao toll-data do Coral (módulo busca).
 */
const ISO_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export const passagemSchema = z.object({
  idCoral: z.string().trim().min(1).max(100),
  numeroContrato: z.string().trim().min(1).max(50),
  cpfCliente: z.string().trim().regex(/^\d{11}$/, "CPF deve conter somente os 11 dígitos."),
  telefoneCliente: z.string().trim().max(30).optional().nullable(),
  placa: z.string().trim().min(1).max(10),
  tag: z.string().trim().min(1).max(50),
  praca: z.string().trim().min(1).max(100),
  rodovia: z.string().trim().min(1).max(100),
  dataHora: z
    .string()
    .trim()
    .regex(ISO_WITH_TIMEZONE, "dataHora deve estar em ISO 8601 com fuso horário explícito.")
    .transform((value) => new Date(value))
    .refine((value) => !Number.isNaN(value.getTime()), "dataHora inválida."),
  valorCentavos: z.number().int("valorCentavos deve ser inteiro em centavos.").nonnegative(),
  lojaRetirada: z.string().trim().min(1).max(100),
});

export type Passagem = z.output<typeof passagemSchema>;

/** Aceita lista direta ou envelopes comuns da API Coral: {data: [...]}, {items: [...]}, {data: {content: [...]}}. */
export function extractItems(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return null;
  for (const key of ["data", "items", "content", "results", "result", "passagens"]) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = extractItems(value);
      if (nested) return nested;
    }
  }
  return null;
}

/** Valida cada registro individualmente: os válidos seguem, os inválidos são reportados com o motivo. */
export function validarPassagens(items: unknown[]) {
  const validas: Passagem[] = [];
  const rejeitadas: Array<{ indice: number; idCoral?: string; motivo: string }> = [];
  items.forEach((item, indice) => {
    const parsed = passagemSchema.safeParse(item);
    if (parsed.success) { validas.push(parsed.data); return; }
    const issue = parsed.error.issues[0];
    const idCoral = item && typeof item === "object" && typeof (item as { idCoral?: unknown }).idCoral === "string"
      ? (item as { idCoral: string }).idCoral : undefined;
    rejeitadas.push({ indice, idCoral, motivo: `${issue?.path.join(".") || "registro"}: ${issue?.message ?? "inválido"}` });
  });
  return { validas, rejeitadas };
}
