import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { expirePaymentLink } from "@/lib/adyen";

export const runtime = "nodejs";

const closeSchema = z.object({
  status: z.enum(["PAGO", "INADIMPLENTE"]),
  nota: z
    .string()
    .trim()
    .min(5, "A justificativa auditável deve ter no mínimo 5 caracteres.")
    .max(500, "A justificativa não pode ultrapassar 500 caracteres."),
});

function validOpsToken(request: Request) {
  const expected = process.env.OPERATIONS_API_TOKEN?.trim();
  if (!expected) return false;
  const supplied = (request.headers.get("x-ops-token") ?? "").trim();
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Identificador de lote inválido." }, { status: 400 });
  }

  const lot = await db.loteCobranca.findUnique({
    where: { id },
    include: {
      passagens: { orderBy: { dataHora: "asc" } },
      logs: { orderBy: { dataHora: "desc" } },
    },
  });

  return lot
    ? NextResponse.json(lot)
    : NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!validOpsToken(request)) {
    return NextResponse.json(
      {
        error: process.env.OPERATIONS_API_TOKEN
          ? "Token operacional inválido ou ausente."
          : "Configure OPERATIONS_API_TOKEN no ambiente para autorizar baixas manuais.",
      },
      { status: process.env.OPERATIONS_API_TOKEN ? 401 : 503 }
    );
  }

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Identificador de lote inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição JSON inválido." }, { status: 400 });
  }

  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos." },
      { status: 400 }
    );
  }

  const lot = await db.loteCobranca.findUnique({ where: { id } });
  if (!lot) {
    return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
  }

  if (lot.status === "PAGO" && parsed.data.status !== "PAGO") {
    return NextResponse.json(
      { error: "Trava de segurança: Um lote já liquidado (PAGO) não pode ser revertido." },
      { status: 409 }
    );
  }

  // Trava Anti-Cobrança Dupla: Expirar link Adyen ativo se o lote estiver sendo liquidado ou encerrado
  if (lot.adyenLinkId) {
    try {
      await expirePaymentLink(lot.adyenLinkId, lot.id);
      await db.logRegua.create({
        data: {
          loteId: id,
          etapa: lot.etapaRegua,
          acao: "EXPIRAR_LINK_BAIXA_MANUAL",
          canal: "Adyen",
          resultado: "SUCESSO",
          detalhesResposta: `Link ${lot.adyenLinkId} cancelado preventivamente devido à baixa manual.`,
        },
      });
    } catch (err) {
      // Registra aviso de falha na expiração do link, mas segue com a auditoria
      await db.logRegua.create({
        data: {
          loteId: id,
          etapa: lot.etapaRegua,
          acao: "EXPIRAR_LINK_BAIXA_MANUAL",
          canal: "Adyen",
          resultado: "ALERTA",
          detalhesResposta: `Atenção: Não foi possível expirar o link ${lot.adyenLinkId}: ${err instanceof Error ? err.message : "Erro desconhecido"}.`,
        },
      });
    }
  }

  const clientIp = request.headers.get("x-forwarded-for") || "local";

  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.loteCobranca.update({
      where: { id },
      data: {
        status: parsed.data.status,
        dataPagamento: parsed.data.status === "PAGO" ? new Date() : null,
      },
    });

    await tx.logRegua.create({
      data: {
        loteId: id,
        etapa: lot.etapaRegua,
        acao: "BAIXA_MANUAL",
        canal: "Operador Autorizado",
        resultado: parsed.data.status,
        detalhesResposta: `Justificativa auditada: "${parsed.data.nota}" (IP: ${clientIp}).`,
      },
    });

    return saved;
  });

  return NextResponse.json(updated);
}
