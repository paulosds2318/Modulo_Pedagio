import { z } from "zod";

// Adaptador canônico para a resposta da API ConectCar. O fornecedor não informa contrato/CPF:
// esses dados são encontrados cruzando placa e data da passagem com contratos sincronizados do Coral.
const passageSchema = z.object({
  idConectcar: z.string().min(1).max(100), placa: z.string().trim().toUpperCase().transform((v) => v.replace(/[^A-Z0-9]/g, "")).pipe(z.string().min(1).max(10)), tag: z.string().min(1).max(50),
  praca: z.string().min(1).max(100), rodovia: z.string().min(1).max(100), dataHora: z.coerce.date(),
  valorCentavos: z.number().int().nonnegative(),
});
export type ConectCarPassage = z.infer<typeof passageSchema>;

export async function fetchConectCarPassages() {
  const url = process.env.CONECTCAR_API_URL;
  if (!url) throw new Error("CONECTCAR_API_URL não configurada.");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.CONECTCAR_API_TOKEN) headers.Authorization = `Bearer ${process.env.CONECTCAR_API_TOKEN}`;
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`ConectCar respondeu HTTP ${response.status}.`);
  const body: unknown = await response.json();
  const items = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items) ? (body as { items: unknown[] }).items : null;
  if (!items) throw new Error("A resposta ConectCar deve ser uma lista ou um objeto { items: [] }.");
  const parsed = z.array(passageSchema).safeParse(items);
  if (!parsed.success) throw new Error(`A resposta ConectCar não segue o formato canônico. ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

