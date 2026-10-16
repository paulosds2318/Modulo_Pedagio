import { z } from "zod";

// Adaptador canônico para a resposta da API ConectCar com validações estritas de segurança
const passageSchema = z.object({
  idConectcar: z.string().trim().min(1).max(100),
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/[^A-Z0-9]/g, ""))
    .pipe(z.string().min(7).max(8)), // Padrão brasileiro antigo e Mercosul (7 caracteres)
  tag: z.string().trim().min(1).max(50),
  praca: z.string().trim().min(1).max(100),
  rodovia: z.string().trim().min(1).max(100),
  dataHora: z.coerce.date(),
  valorCentavos: z.number().int().positive("Valor do pedágio deve ser positivo.").max(1_000_000, "Valor do pedágio excede limite plausível."), // Máx R$ 10.000 por passagem única
});

export type ConectCarPassage = z.infer<typeof passageSchema>;

export async function fetchConectCarPassages() {
  const url = process.env.CONECTCAR_API_URL?.trim();
  if (!url) {
    throw new Error("Configuração ausente: CONECTCAR_API_URL não está definida.");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.CONECTCAR_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.CONECTCAR_API_TOKEN.trim()}`;
  }

  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`ConectCar respondeu HTTP ${response.status} ao consultar passagens.`);
  }

  const body: unknown = await response.json();
  const items = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: unknown[] }).items
    : null;

  if (!items) {
    throw new Error("A resposta da API ConectCar deve ser uma lista ou conter a propriedade { items: [] }.");
  }

  const parsed = z.array(passageSchema).safeParse(items);
  if (!parsed.success) {
    throw new Error(
      `Dados da ConectCar fora do padrão canônico de segurança: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`
    );
  }

  return parsed.data;
}
