import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasBearerSecret } from "@/lib/auth";
export const runtime = "nodejs";
const schema = z.array(z.object({ numeroContrato: z.string().min(1).max(50), cpfCliente: z.string().min(1).max(14), telefoneCliente: z.string().max(30).optional().nullable(), placa: z.string().trim().toUpperCase().transform((v) => v.replace(/[^A-Z0-9]/g, "")).pipe(z.string().min(1).max(10)), dataRetirada: z.coerce.date(), dataDevolucao: z.coerce.date(), lojaRetirada: z.string().min(1).max(100) }).refine((item) => item.dataRetirada <= item.dataDevolucao, "Período da locação inválido.")).min(1).max(1000);
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CORAL_RENTALS_SYNC_SECRET)) return NextResponse.json({ error: "Não autorizado ou CORAL_RENTALS_SYNC_SECRET não configurado." }, { status: process.env.CORAL_RENTALS_SYNC_SECRET ? 401 : 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Contratos inválidos.", details: parsed.error.flatten() }, { status: 400 });
  const saved = await db.$transaction(parsed.data.map((rental) => db.contratoLocacao.upsert({ where: { numeroContrato: rental.numeroContrato }, create: rental, update: rental })));
  return NextResponse.json({ sincronizados: saved.length });
}

