import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasBearerSecret } from "@/lib/auth";
export const runtime = "nodejs";
const schema = z.array(z.object({ idConectcar: z.string().min(1).max(100), numeroContrato: z.string().min(1).max(50), cpfCliente: z.string().min(1).max(14), telefoneCliente: z.string().optional().nullable(), placa: z.string().min(1).max(10), tag: z.string().min(1).max(50), praca: z.string().min(1).max(100), rodovia: z.string().min(1).max(100), dataHora: z.coerce.date(), valorCentavos: z.number().int().nonnegative(), lojaRetirada: z.string().min(1).max(100) })).min(1).max(500);
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CONECTCAR_SYNC_SECRET)) return NextResponse.json({ error: "Não autorizado ou integração não configurada." }, { status: process.env.CONECTCAR_SYNC_SECRET ? 401 : 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados de passagem inválidos.", details: parsed.error.flatten() }, { status: 400 });
  const result = await db.$transaction(parsed.data.map((passage) => db.passagemPedagio.upsert({ where: { idConectcar: passage.idConectcar }, create: passage, update: passage })));
  return NextResponse.json({ imported: result.length });
}
