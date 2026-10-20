import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasBearerSecret } from "@/lib/auth";

export const runtime = "nodejs";

const passageSchema = z.object({
  idCoral: z.string().trim().min(1).max(100),
  numeroContrato: z.string().trim().min(1).max(50),
  cpfCliente: z.string().trim().min(1).max(14),
  telefoneCliente: z.string().trim().max(30).optional().nullable(),
  placa: z.string().trim().min(1).max(10),
  tag: z.string().trim().min(1).max(50),
  praca: z.string().trim().min(1).max(100),
  rodovia: z.string().trim().min(1).max(100),
  dataHora: z.coerce.date(),
  valorCentavos: z.number().int().nonnegative(),
  lojaRetirada: z.string().trim().min(1).max(100),
});

const importSchema = z.array(passageSchema).min(1).max(500);

export async function POST(request: Request) {
  const importSecret = process.env.CORAL_PASSAGES_SYNC_SECRET;
  if (!hasBearerSecret(request, importSecret)) {
    return NextResponse.json(
      { error: "Nao autorizado ou integracao de passagens do Coral nao configurada." },
      { status: importSecret ? 401 : 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON invalido." }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados de passagem invalidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await db.passagemPedagio.createMany({
      data: parsed.data,
      skipDuplicates: true,
    });
    return NextResponse.json({
      importadas: result.count,
      duplicadas: parsed.data.length - result.count,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao importar passagens do Coral." }, { status: 503 });
  }
}
