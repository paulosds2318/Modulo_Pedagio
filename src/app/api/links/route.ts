import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { STATUS_LOTE_COBRAVEL } from "@/lib/links-pagamento";
import { ErroLink, gerarLinkPagamento } from "@/lib/services/links-pagamento";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";

const schema = z
  .object({
    loteId: z.number().int().positive().optional(),
    contrato: z.string().trim().min(1).max(50).optional(),
    passagemIds: z.array(z.number().int().positive()).max(200).optional(),
  })
  .refine((v) => v.loteId || v.contrato || v.passagemIds?.length, { message: "Informe loteId, contrato ou passagemIds." });

/** Descobre o lote do pedido: pelo ID, pelo contrato (um lote em aberto) ou pelas passagens informadas. */
async function resolverLote(v: z.infer<typeof schema>): Promise<number> {
  if (v.loteId) return v.loteId;
  if (v.contrato) {
    const lotes = await db.loteCobranca.findMany({ where: { numeroContrato: v.contrato, status: { in: STATUS_LOTE_COBRAVEL } }, select: { id: true } });
    if (!lotes.length) throw new ErroLink("Nenhum lote em aberto para este contrato.", 404);
    if (lotes.length > 1) throw new ErroLink(`Há ${lotes.length} lotes em aberto neste contrato (${lotes.map((l) => `#${l.id}`).join(", ")}). Informe o loteId.`, 409);
    return lotes[0].id;
  }
  const passagens = await db.passagemPedagio.findMany({ where: { id: { in: v.passagemIds! } }, select: { id: true, loteId: true } });
  if (passagens.length !== new Set(v.passagemIds).size) throw new ErroLink("Alguma passagem informada não existe.", 404);
  const lotes = new Set(passagens.map((p) => p.loteId));
  if (lotes.size !== 1 || lotes.has(null)) throw new ErroLink("As passagens precisam pertencer a um mesmo lote.", 400);
  return passagens[0].loteId!;
}

/**
 * Gera um link de pagamento (somente administradores):
 * - por lote ou contrato, com todas as passagens em aberto (padrão) ou só as de `passagemIds`;
 * - por ID de passagem (`passagemIds`, sem informar o lote).
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Somente administradores podem gerar links de pagamento." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Corpo da requisição inválido." }, { status: 400 });

  try {
    const loteId = await resolverLote(parsed.data);
    const { link, reutilizado } = await gerarLinkPagamento({
      loteId,
      passagemIds: parsed.data.passagemIds,
      origem: "MANUAL",
      usuario: session.user.email,
    });
    if (!reutilizado) {
      await registrarAuditoria(session, request, "GERAR_LINK_PAGAMENTO", {
        entidade: "lote",
        entidadeId: loteId,
        detalhes: { linkId: link.id, valorCentavos: link.valorCentavos, passagens: parsed.data.passagemIds ?? "todas em aberto" },
      });
    }
    return NextResponse.json({ ...link, reutilizado }, { status: reutilizado ? 200 : 201 });
  } catch (error) {
    if (error instanceof ErroLink) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível gerar o link." }, { status: 503 });
  }
}
