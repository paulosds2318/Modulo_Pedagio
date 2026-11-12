import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { FORMAS_BAIXA_MANUAL, STATUS_PERMITEM_BAIXA, validarBaixaManual } from "@/lib/baixa-manual";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/**
 * Baixa manual (somente administradores): registra pagamento recebido fora do link/cartão (PIX, depósito, acordo…),
 * marca o lote como pago, encerra a régua e cancela as tarefas pendentes. Permitida com a régua em andamento ou
 * encerrada (inadimplente), para não cobrar de novo quem já pagou por outro meio.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Somente administradores podem registrar baixa manual." }, { status: 403 });

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de lote inválido." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });

  try {
    const lote = await db.loteCobranca.findUnique({ where: { id } });
    if (!lote) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
    if (lote.status === "PAGO") return NextResponse.json({ error: "Este lote já está pago." }, { status: 409 });
    if (!STATUS_PERMITEM_BAIXA.includes(lote.status)) {
      return NextResponse.json({ error: "A baixa manual só é permitida para lotes em régua ou inadimplentes." }, { status: 409 });
    }

    const result = validarBaixaManual(body, lote);
    if (!result.ok) return NextResponse.json({ error: result.erro }, { status: 400 });
    const { baixa, divergenteCentavos } = result;
    const usuario = session.user.email;

    const detalhe =
      `Baixa manual por ${usuario}: ${FORMAS_BAIXA_MANUAL[baixa.forma]}, recebido ${money(baixa.valorRecebidoCentavos)} ` +
      `em ${baixa.dataPagamento.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` +
      (divergenteCentavos ? ` (${divergenteCentavos < 0 ? "abaixo" : "acima"} do devido em ${money(Math.abs(divergenteCentavos))})` : "") +
      `. Observação: ${baixa.observacao}`;

    const atualizado = await db.$transaction(async (tx) => {
      // Só baixa se o lote ainda estiver em régua/inadimplente (protege contra pagamento simultâneo por outro canal).
      const update = await tx.loteCobranca.updateMany({
        where: { id, status: { in: STATUS_PERMITEM_BAIXA } },
        data: {
          status: "PAGO",
          dataPagamento: baixa.dataPagamento,
          formaPagamento: baixa.forma,
          valorRecebidoCentavos: baixa.valorRecebidoCentavos,
          baixaManual: true,
          baixaObservacao: baixa.observacao,
          baixaPor: usuario,
          processandoAte: null,
        },
      });
      if (!update.count) return false;
      await tx.integrationOutbox.updateMany({
        where: { loteId: id, status: { in: ["PENDENTE", "AGUARDANDO_CONFIGURACAO"] } },
        data: { status: "CANCELADO", ultimoErro: "Cancelada pela baixa manual do lote." },
      });
      await tx.logRegua.create({
        data: { loteId: id, etapa: lote.etapaRegua, acao: "BAIXA_MANUAL", canal: "Manual", resultado: "PAGO", detalhesResposta: detalhe.slice(0, 2000) },
      });
      return true;
    });
    if (!atualizado) return NextResponse.json({ error: "O lote mudou de situação durante a baixa. Atualize a página." }, { status: 409 });

    await registrarAuditoria(session, request, "BAIXA_MANUAL", {
      entidade: "lote",
      entidadeId: id,
      detalhes: {
        forma: baixa.forma,
        valorRecebidoCentavos: baixa.valorRecebidoCentavos,
        valorDevidoCentavos: lote.valorFinalCentavos,
        diferencaCentavos: divergenteCentavos,
        dataPagamento: baixa.dataPagamento.toISOString().slice(0, 10),
        situacaoAnterior: lote.status,
        observacao: baixa.observacao,
      },
    });
    return NextResponse.json(await db.loteCobranca.findUnique({ where: { id } }));
  } catch {
    return NextResponse.json({ error: "Não foi possível registrar a baixa manual." }, { status: 503 });
  }
}
