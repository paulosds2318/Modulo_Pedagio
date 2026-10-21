import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentLink } from "@/lib/adyen";
import { getServerSession } from "@/lib/auth";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID de lote inválido." }, { status: 400 });

  try {
    const lot = await db.loteCobranca.findUnique({ where: { id } });
    if (!lot) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
    if (!lot.adyenLinkId) return NextResponse.json({ error: "Este lote ainda não possui link de pagamento Adyen." }, { status: 409 });

    let paymentLink: Awaited<ReturnType<typeof getPaymentLink>>;
    try {
      paymentLink = await getPaymentLink(lot.adyenLinkId);
    } catch {
      await db.logRegua.create({
        data: { loteId: id, etapa: lot.etapaRegua, acao: "CONSULTAR_STATUS_ADYEN", canal: "Adyen", resultado: "FALHA", detalhesResposta: "Não foi possível consultar o status do link na Adyen." },
      });
      return NextResponse.json({ error: "Não foi possível consultar a Adyen agora. Tente novamente." }, { status: 502 });
    }

    if (!paymentLink?.status) {
      await db.logRegua.create({
        data: { loteId: id, etapa: lot.etapaRegua, acao: "CONSULTAR_STATUS_ADYEN", canal: "Adyen", resultado: "FALHA", detalhesResposta: "A consulta não retornou um status de pagamento válido." },
      });
      return NextResponse.json({ error: "A Adyen não retornou um status reconhecido para este link." }, { status: 502 });
    }

    const amount = paymentLink.amount;
    const amountMatches = amount?.currency?.toUpperCase() === "BRL" && amount.value === lot.valorFinalCentavos;
    const referenceMatches = paymentLink.reference === `LOTE_${lot.id}`;
    if (!amountMatches || !referenceMatches) {
      await db.logRegua.create({
        data: { loteId: id, etapa: lot.etapaRegua, acao: "CONSULTAR_STATUS_ADYEN", canal: "Adyen", resultado: "BLOQUEADO", detalhesResposta: "A consulta retornou valor, moeda ou referência diferente do lote. O status local não foi alterado." },
      });
      return NextResponse.json({ error: "Os dados do link não correspondem ao lote. O status não foi alterado." }, { status: 409 });
    }

    let statusLocal = lot.status;
    if (paymentLink.status === "completed" && lot.status !== "PAGO") {
      await db.$transaction(async (tx) => {
        await tx.loteCobranca.updateMany({
          where: { id, status: { not: "PAGO" } },
          data: { status: "PAGO", dataPagamento: new Date() },
        });
        await tx.logRegua.create({
          data: { loteId: id, etapa: lot.etapaRegua, acao: "CONFIRMAR_PAGAMENTO_ADYEN", canal: "Adyen", resultado: "PAGO", detalhesResposta: "Pagamento confirmado após consulta solicitada pelo administrador à Adyen." },
        });
      });
      statusLocal = "PAGO";
    } else {
      await db.logRegua.create({
        data: { loteId: id, etapa: lot.etapaRegua, acao: "CONSULTAR_STATUS_ADYEN", canal: "Adyen", resultado: paymentLink.status.toUpperCase(), detalhesResposta: `Status do link consultado na Adyen: ${paymentLink.status}.` },
      });
    }

    return NextResponse.json({ statusAdyen: paymentLink.status, statusLote: statusLocal });
  } catch {
    return NextResponse.json({ error: "Falha ao consultar o status do pagamento." }, { status: 503 });
  }
}
