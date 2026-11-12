import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { MOTIVOS_CANCELAMENTO, STATUS_PERMITEM_CANCELAMENTO, validarCancelamento } from "@/lib/cancelamento";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Cancela um lote não pago (somente administradores): encerra a régua, cancela as tarefas pendentes e registra
 * motivo, observação e responsável. As passagens continuam vinculadas ao lote cancelado e não voltam a ser cobradas.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Somente administradores podem cancelar lotes." }, { status: 403 });

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de lote inválido." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = validarCancelamento(body ?? {});
  if (!result.ok) return NextResponse.json({ error: result.erro }, { status: 400 });

  try {
    const lote = await db.loteCobranca.findUnique({ where: { id } });
    if (!lote) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
    if (!STATUS_PERMITEM_CANCELAMENTO.includes(lote.status)) {
      return NextResponse.json(
        { error: lote.status === "PAGO" ? "Lote pago não pode ser cancelado; trate como estorno." : "Este lote já está cancelado." },
        { status: 409 }
      );
    }
    const usuario = session.user.email;
    const cancelado = await db.$transaction(async (tx) => {
      const update = await tx.loteCobranca.updateMany({
        where: { id, status: { in: STATUS_PERMITEM_CANCELAMENTO } },
        data: {
          status: "CANCELADO",
          canceladoEm: new Date(),
          cancelamentoMotivo: result.motivo,
          cancelamentoObservacao: result.observacao,
          canceladoPor: usuario,
          processandoAte: null,
        },
      });
      if (!update.count) return false;
      await tx.integrationOutbox.updateMany({
        where: { loteId: id, status: { in: ["PENDENTE", "AGUARDANDO_CONFIGURACAO"] } },
        data: { status: "CANCELADO", ultimoErro: "Cancelada junto com o lote." },
      });
      await tx.logRegua.create({
        data: {
          loteId: id,
          etapa: lote.etapaRegua,
          acao: "CANCELAR_LOTE",
          canal: "Manual",
          resultado: "CANCELADO",
          detalhesResposta: `Lote cancelado por ${usuario}. Motivo: ${MOTIVOS_CANCELAMENTO[result.motivo]}. Observação: ${result.observacao}`.slice(0, 2000),
        },
      });
      return true;
    });
    if (!cancelado) return NextResponse.json({ error: "O lote mudou de situação. Atualize a página." }, { status: 409 });

    await registrarAuditoria(session, request, "CANCELAR_LOTE", {
      entidade: "lote",
      entidadeId: id,
      detalhes: { motivo: result.motivo, observacao: result.observacao, situacaoAnterior: lote.status, valorFinalCentavos: lote.valorFinalCentavos, linkAtivo: Boolean(lote.adyenPaymentUrl) },
    });
    return NextResponse.json(await db.loteCobranca.findUnique({ where: { id } }));
  } catch {
    return NextResponse.json({ error: "Não foi possível cancelar o lote." }, { status: 503 });
  }
}
