import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/services/auditoria";
import { sincronizarPagamentosCoral, urlStatusCoral } from "@/lib/services/consultar-pagamentos";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Consulta o Coral sobre os links do lote (pagamento e situação da régua) e atualiza o lote com o que mudou.
 * O mesmo que a rotina automática faz para todos os lotes, sob demanda para um.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de lote inválido." }, { status: 400 });
  if (!urlStatusCoral()) {
    return NextResponse.json({ error: "A consulta de pagamento no Coral ainda não foi configurada (CORAL_PAYMENT_STATUS_URL)." }, { status: 409 });
  }

  try {
    const lote = await db.loteCobranca.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!lote) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });

    const resumo = await sincronizarPagamentosCoral({ loteId: id });
    const depois = await db.loteCobranca.findUnique({ where: { id }, select: { status: true } });
    await registrarAuditoria(session, request, "CONSULTAR_PAGAMENTO_CORAL", {
      entidade: "lote",
      entidadeId: id,
      detalhes: { ...resumo, situacaoAnterior: lote.status, situacaoAtual: depois?.status },
    });
    return NextResponse.json({ ...resumo, statusAnterior: lote.status, statusLote: depois?.status ?? lote.status });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message.replace(/^CONFIG:\s*/, "") : "Falha na consulta.";
    return NextResponse.json({ error: `Não foi possível consultar o Coral agora: ${mensagem}` }, { status: 502 });
  }
}
