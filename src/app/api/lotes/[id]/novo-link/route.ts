import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { gerarNovoLink } from "@/lib/services/novo-link";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/** Gera um novo link de pagamento (link anterior expirado, cliente pediu de novo, renegociação). Somente administradores. */
export async function POST(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Somente administradores podem gerar um novo link." }, { status: 403 });

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de lote inválido." }, { status: 400 });

  const lote = await db.loteCobranca.findUnique({ where: { id }, select: { status: true, etapaRegua: true } });
  if (!lote) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
  if (lote.status !== "EM_REGUA" && lote.status !== "INADIMPLENTE") {
    return NextResponse.json({ error: "Só é possível gerar novo link para lotes em régua ou inadimplentes." }, { status: 409 });
  }

  try {
    const resultado = await gerarNovoLink(id, lote.etapaRegua, `Novo link gerado manualmente por ${session.user.email}.`);
    await registrarAuditoria(session, request, "GERAR_NOVO_LINK", {
      entidade: "lote",
      entidadeId: id,
      detalhes: { versao: resultado.versao, linkAnterior: resultado.linkAnterior, linkNovo: resultado.url },
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o novo link." }, { status: 502 });
  }
}
