import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
export const runtime = "nodejs";
const closeSchema = z.object({ status: z.enum(["PAGO", "INADIMPLENTE"]), nota: z.string().min(3).max(500) });
function validOpsToken(request: Request) {
  const expected = process.env.OPERATIONS_API_TOKEN;
  if (!expected) return false;
  const supplied = request.headers.get("x-ops-token") ?? "";
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const lot = await db.loteCobranca.findUnique({ where: { id }, include: { passagens: { orderBy: { dataHora: "asc" } }, logs: { orderBy: { dataHora: "asc" } } } });
  return lot ? NextResponse.json(lot) : NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!validOpsToken(request)) return NextResponse.json({ error: process.env.OPERATIONS_API_TOKEN ? "Não autorizado." : "Configure OPERATIONS_API_TOKEN para habilitar baixa manual." }, { status: process.env.OPERATIONS_API_TOKEN ? 401 : 503 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const parsed = closeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe o status e uma justificativa de pelo menos 3 caracteres." }, { status: 400 });
  const lot = await db.loteCobranca.findUnique({ where: { id } });
  if (!lot) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
  if (lot.status === "PAGO" && parsed.data.status !== "PAGO") return NextResponse.json({ error: "Um lote pago não pode ser reaberto como inadimplente." }, { status: 409 });
  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.loteCobranca.update({ where: { id }, data: { status: parsed.data.status, dataPagamento: parsed.data.status === "PAGO" ? new Date() : null } });
    await tx.logRegua.create({ data: { loteId: id, etapa: lot.etapaRegua, acao: "BAIXA_MANUAL", canal: "Operador", resultado: parsed.data.status, detalhesResposta: parsed.data.nota } });
    return saved;
  });
  return NextResponse.json(updated);
}

