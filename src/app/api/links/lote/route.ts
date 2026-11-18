import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession, hasRole } from "@/lib/auth";
import { ErroLink, gerarLinkPagamento } from "@/lib/services/links-pagamento";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";

const schema = z.object({ loteIds: z.array(z.number().int().positive()).min(1).max(50) });

/**
 * Cobrança em lote (somente administradores): gera um link com todas as passagens em aberto de cada lote informado
 * (até 50). Cada lote é independente: se um falhar, os demais seguem e o erro vem identificado no resultado.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Somente administradores podem gerar links de pagamento." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe de 1 a 50 lotes em loteIds." }, { status: 400 });

  const loteIds = [...new Set(parsed.data.loteIds)];
  const resultados: Array<{ loteId: number; ok: boolean; linkId?: number; url?: string; valorCentavos?: number; erro?: string }> = [];
  // Em sequência: cada link consulta e cria no Coral, e assim não passamos do limite de requisições dele.
  for (const loteId of loteIds) {
    try {
      const { link } = await gerarLinkPagamento({ loteId, origem: "LOTE", usuario: session.user.email });
      resultados.push({ loteId, ok: true, linkId: link.id, url: link.url, valorCentavos: link.valorCentavos });
    } catch (error) {
      resultados.push({ loteId, ok: false, erro: error instanceof ErroLink ? error.message : "Falha ao gerar o link." });
    }
  }
  await registrarAuditoria(session, request, "GERAR_LINKS_EM_LOTE", {
    entidade: "lote",
    detalhes: { lotes: loteIds.length, gerados: resultados.filter((r) => r.ok).length, falhas: resultados.filter((r) => !r.ok).map((r) => r.loteId) },
  });
  return NextResponse.json({ total: resultados.length, gerados: resultados.filter((r) => r.ok).length, resultados });
}
