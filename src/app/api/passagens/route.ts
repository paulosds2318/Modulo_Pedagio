import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasBearerSecret } from "@/lib/auth";
import { compilarLote } from "@/lib/services/compilar-lote";

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

const compilationErrorMessages: Record<string, string> = {
  INVALID_AMOUNT: "O valor total do grupo precisa ser maior que zero.",
  AMOUNT_EXCEEDED: "O grupo excede o limite de R$ 500.000,00 por lote.",
  ALREADY_BILLED: "Uma ou mais passagens já foram vinculadas a outro lote.",
  RACE_CONDITION: "As passagens foram alteradas por outra operação durante a compilação.",
};

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
    const result = await db.passagemPedagio.createMany({
      data: parsed.data,
      skipDuplicates: true,
    });

    const idsCoral = parsed.data.map((passagem) => passagem.idCoral);
    const pendentes = await db.passagemPedagio.findMany({
      where: { idCoral: { in: idsCoral }, loteId: null },
      select: { id: true, numeroContrato: true, cpfCliente: true },
    });

    const grupos = new Map<string, { numeroContrato: string; passagemIds: number[] }>();
    for (const passagem of pendentes) {
      const chave = JSON.stringify([passagem.numeroContrato, passagem.cpfCliente]);
      const grupo = grupos.get(chave) ?? { numeroContrato: passagem.numeroContrato, passagemIds: [] };
      grupo.passagemIds.push(passagem.id);
      grupos.set(chave, grupo);
    }

    const idsLotesCompilados: number[] = [];
    const falhasCompilacao: Array<{ contrato: string; mensagem: string }> = [];
    let passagensCompiladas = 0;
    for (const grupo of grupos.values()) {
      try {
        const lote = await compilarLote(grupo.passagemIds);
        idsLotesCompilados.push(lote.id);
        passagensCompiladas += grupo.passagemIds.length;
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        falhasCompilacao.push({
          contrato: grupo.numeroContrato,
          mensagem: compilationErrorMessages[code] ?? "Não foi possível compilar este grupo. As passagens continuam pendentes.",
        });
      }
    }

    return NextResponse.json({
      importadas: result.count,
      duplicadas: parsed.data.length - result.count,
      lotesCompilados: idsLotesCompilados.length,
      passagensCompiladas,
      idsLotesCompilados,
      falhasCompilacao,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao importar passagens do Coral." }, { status: 503 });
  }
}
