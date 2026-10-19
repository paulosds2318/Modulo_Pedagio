import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { expirePaymentLink } from "@/lib/adyen";
import { getServerSession, hasRole } from "@/lib/auth";

export const runtime = "nodejs";
const closeSchema = z.object({
  status: z.enum(["PAGO", "INADIMPLENTE"]),
  nota: z.string().trim().min(5).max(500),
});

type RouteContext = { params: Promise<{ id: string }> };
function parseId(raw: string) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticacao necessaria." }, { status: 401 });
  const id = parseId((await context.params).id);
  if (!id) return NextResponse.json({ error: "ID de lote invalido." }, { status: 400 });

  try {
    const lot = await db.loteCobranca.findUnique({
      where: { id },
      include: {
        passagens: { orderBy: { dataHora: "asc" } },
        logs: { orderBy: { dataHora: "desc" } },
      },
    });
    return lot
      ? NextResponse.json(lot)
      : NextResponse.json({ error: "Lote nao encontrado." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponivel." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticacao necessaria." }, { status: 401 });
  if (!hasRole(session, "admin")) {
    return NextResponse.json({ error: "Acao restrita a administradores." }, { status: 403 });
  }

  const id = parseId((await context.params).id);
  if (!id) return NextResponse.json({ error: "ID de lote invalido." }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados invalidos." }, { status: 400 });
  }

  try {
    const lot = await db.loteCobranca.findUnique({ where: { id } });
    if (!lot) return NextResponse.json({ error: "Lote nao encontrado." }, { status: 404 });
    if (lot.status === "PAGO" && parsed.data.status !== "PAGO") {
      return NextResponse.json({ error: "Um lote pago nao pode ser revertido." }, { status: 409 });
    }
    if (lot.status === parsed.data.status) {
      return NextResponse.json({ error: "O lote ja esta neste status." }, { status: 409 });
    }

    const updated = await db.$transaction(async (tx) => {
      const changed = await tx.loteCobranca.updateMany({
        where: { id, status: lot.status },
        data: {
          status: parsed.data.status,
          dataPagamento: parsed.data.status === "PAGO" ? new Date() : null,
        },
      });
      if (!changed.count) throw new Error("STATUS_CHANGED");
      const saved = await tx.loteCobranca.findUniqueOrThrow({ where: { id } });
      await tx.logRegua.create({
        data: {
          loteId: id,
          etapa: lot.etapaRegua,
          acao: "BAIXA_MANUAL",
          canal: "Operador Autenticado",
          resultado: parsed.data.status,
          detalhesResposta: `Justificativa: "${parsed.data.nota}". Operador: ${session.user.id} (${session.user.email}).`,
        },
      });
      return saved;
    });

    if (lot.adyenLinkId) {
      try {
        const result = await expirePaymentLink(lot.adyenLinkId, lot.id);
        if (!result) throw new Error("Adyen credentials are not configured; the payment link may still be active.");
        await db.logRegua.create({
          data: {
            loteId: id,
            etapa: lot.etapaRegua,
            acao: "EXPIRAR_LINK_BAIXA_MANUAL",
            canal: "Adyen",
            resultado: "SUCESSO",
            detalhesResposta: `Link ${lot.adyenLinkId} expirado ap?s baixa manual.`,
          },
        });
      } catch (error) {
        await db.logRegua.create({
          data: {
            loteId: id,
            etapa: lot.etapaRegua,
            acao: "EXPIRAR_LINK_BAIXA_MANUAL",
            canal: "Adyen",
            resultado: "ALERTA",
            detalhesResposta: error instanceof Error ? error.message : "Falha ao expirar link Adyen.",
          },
        });
      }
    }
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "STATUS_CHANGED") {
      return NextResponse.json({ error: "O status do lote mudou durante a opera??o. Atualize e tente novamente." }, { status: 409 });
    }
    return NextResponse.json({ error: "Falha ao registrar a baixa manual." }, { status: 500 });
  }
}
