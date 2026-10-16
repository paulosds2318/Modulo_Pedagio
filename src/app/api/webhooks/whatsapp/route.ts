import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasBearerSecret } from "@/lib/auth";
import { z } from "zod";
export const runtime = "nodejs";
const eventSchema = z.object({ messageId: z.string().min(1), status: z.string().min(1).max(40), details: z.string().max(1000).optional() });
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.WHATSAPP_WEBHOOK_TOKEN)) return NextResponse.json({ error: "Não autorizado ou WHATSAPP_WEBHOOK_TOKEN não configurado." }, { status: process.env.WHATSAPP_WEBHOOK_TOKEN ? 401 : 503 });
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Evento WhatsApp inválido." }, { status: 400 });
  const changed = await db.logRegua.updateMany({ where: { providerMessageId: parsed.data.messageId }, data: { resultado: parsed.data.status.toUpperCase(), detalhesResposta: parsed.data.details } });
  return NextResponse.json({ updated: changed.count });
}
