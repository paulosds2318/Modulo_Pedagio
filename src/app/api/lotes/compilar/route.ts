import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession, hasRole } from "@/lib/auth";
import { compilarLote } from "@/lib/services/compilar-lote";

export const runtime = "nodejs";

const schema = z
  .object({
    passagemIds: z.array(z.number().int().positive()).min(1).max(500),
    taxaCentavos: z.number().int().nonnegative().max(500_000, "A taxa administrativa não pode ultrapassar R$ 5.000,00.").default(0),
  })
  .refine((data) => new Set(data.passagemIds).size === data.passagemIds.length, "A lista de passagens contém identificadores duplicados.");

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição JSON inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos para compilação do lote." }, { status: 400 });
  }

  try {
    const lot = await compilarLote(parsed.data.passagemIds, parsed.data.taxaCentavos);
    return NextResponse.json(lot, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const mapping: Record<string, { status: number; message: string }> = {
      NOT_FOUND: { status: 404, message: "Uma ou mais passagens não foram localizadas no sistema." },
      ALREADY_BILLED: { status: 409, message: "Uma ou mais passagens selecionadas já pertencem a outro lote." },
      RACE_CONDITION: { status: 409, message: "Conflito de concorrência: uma das passagens foi compilada por outro operador simultaneamente." },
      MIXED_CONTRACTS: { status: 422, message: "Todas as passagens do lote devem pertencer estritamente ao mesmo contrato e cliente." },
      INVALID_AMOUNT: { status: 422, message: "O valor total do lote de pedágios deve ser superior a zero." },
      AMOUNT_EXCEEDED: { status: 422, message: "O valor total do lote excede o limite máximo permitido (R$ 500.000,00)." },
    };
    const response = mapping[code] ?? { status: 500, message: "Erro interno ao compilar o lote de cobrança." };
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
