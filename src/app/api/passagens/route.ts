import { NextResponse } from "next/server";
import { z } from "zod";
import { passagemSchema } from "@/lib/passagem-schema";
import { hasBearerSecret } from "@/lib/auth";
import { importarECompilarPassagens } from "@/lib/services/importar-passagens";

export const runtime = "nodejs";

const importSchema = z.array(passagemSchema).min(1).max(500);

export async function POST(request: Request) {
  const importSecret = process.env.CORAL_PASSAGES_SYNC_SECRET;
  if (!hasBearerSecret(request, importSecret)) {
    return NextResponse.json(
      { error: "Não autorizado ou integração de passagens do Coral não configurada." },
      { status: importSecret ? 401 : 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados de passagem inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await importarECompilarPassagens(parsed.data));
  } catch {
    return NextResponse.json({ error: "Falha ao importar passagens do Coral." }, { status: 503 });
  }
}
