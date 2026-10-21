import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { processIntegrationOutbox } from "@/lib/services/outbox";

export const runtime = "nodejs";

const schema = z
  .object({
    passagemIds: z.array(z.number().int().positive()).min(1).max(500),
    taxaCentavos: z
      .number()
      .int()
      .nonnegative()
      .max(500_000, "A taxa administrativa não pode ultrapassar R$ 5.000,00.")
      .default(0),
  })
  .refine(
    (data) => new Set(data.passagemIds).size === data.passagemIds.length,
    "A lista de passagens contém identificadores duplicados."
  );

export async function POST(request: Request) {
  // Guarda de Sessão: Perfil de visualização não possui permissão para compilar lotes
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticacao necessaria." }, { status: 401 });
  if (!hasRole(session, "admin")) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição JSON inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos para compilação do lote." },
      { status: 400 }
    );
  }

  try {
    // 1. Criação Atômica do Lote com Trava Anti-Concorrência em Passagens
    const lot = await db.$transaction(async (tx) => {
      const passages = await tx.passagemPedagio.findMany({
        where: { id: { in: parsed.data.passagemIds } },
      });

      if (passages.length !== parsed.data.passagemIds.length) {
        throw new Error("NOT_FOUND");
      }
      if (passages.some((p) => p.loteId !== null)) {
        throw new Error("ALREADY_BILLED");
      }
      if (
        new Set(passages.map((p) => p.numeroContrato)).size !== 1 ||
        new Set(passages.map((p) => p.cpfCliente)).size !== 1
      ) {
        throw new Error("MIXED_CONTRACTS");
      }

      const totalTolls = passages.reduce((sum, p) => sum + p.valorCentavos, 0);
      const finalAmount = totalTolls + parsed.data.taxaCentavos;

      if (finalAmount <= 0) {
        throw new Error("INVALID_AMOUNT");
      }
      if (finalAmount > 50_000_000) {
        // Teto de R$ 500.000,00 por lote para segurança contra estouro de inteiros/fraude
        throw new Error("AMOUNT_EXCEEDED");
      }

      const newLot = await tx.loteCobranca.create({
        data: {
          numeroContrato: passages[0].numeroContrato,
          cpfCliente: passages[0].cpfCliente,
          telefoneCliente: passages[0].telefoneCliente,
          quantidadePassagens: passages.length,
          valorTotalCentavos: totalTolls,
          taxaCentavos: parsed.data.taxaCentavos,
          valorFinalCentavos: finalAmount,
          status: "EM_REGUA",
          etapaRegua: "D0",
        },
      });

      await tx.integrationOutbox.createMany({
        data: [{ loteId: newLot.id, tipo: "ADYEN_LINK_D0" }, { loteId: newLot.id, tipo: "WHATSAPP_D0" }],
      });

      // Vinculação Atômica com Validação de Concorrência
      const linked = await tx.passagemPedagio.updateMany({
        where: {
          id: { in: parsed.data.passagemIds },
          loteId: null,
        },
        data: { loteId: newLot.id },
      });

      if (linked.count !== passages.length) {
        throw new Error("RACE_CONDITION");
      }

      return newLot;
    });

    // A outbox persistente preserva os envios se a aplicação cair ou o provedor estiver fora.
    try { await processIntegrationOutbox(new Date(), lot.id); }
    catch { /* As tarefas persistentes serão retomadas pelo cron. */ }
    const updated = await db.loteCobranca.findUniqueOrThrow({ where: { id: lot.id } });
    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const mapping: Record<string, { status: number; message: string }> = {
      NOT_FOUND: { status: 404, message: "Uma ou mais passagens não foram localizadas no sistema." },
      ALREADY_BILLED: { status: 409, message: "Uma ou mais passagens selecionadas já pertencem a outro lote." },
      RACE_CONDITION: { status: 409, message: "Conflito de concorrência: uma das passagens foi compilada por outro operador simultaneamente." },
      MIXED_CONTRACTS: { status: 422, message: "Todas as passagens do lote devem pertencer estritamente ao mesmo contrato e cliente." },
      INVALID_AMOUNT: { status: 422, message: "O valor total do lote de pedágios deve ser superior a zero." },
      AMOUNT_EXCEEDED: { status: 422, message: "O valor total do lote excede o limite máximo permitido de segurança (R$ 500.000,00)." },
    };

    const response = mapping[code] ?? {
      status: 500,
      message: "Erro interno ao compilar o lote de cobrança.",
    };
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
