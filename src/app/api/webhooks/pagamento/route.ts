import { NextResponse } from "next/server";
import { hasBearerSecret } from "@/lib/auth";
import { lerEventoPagamento } from "@/lib/links-pagamento";
import { aplicarPagamentoLink, aplicarPagamentoLoteLegado } from "@/lib/services/links-pagamento";

export const runtime = "nodejs";

/**
 * Retorno de pagamento do Coral (baixa automática). Autenticado por Bearer PAGAMENTO_WEBHOOK_TOKEN.
 * Corpo: { reference: "LINK_<id>", status: "PAID"|"EXPIRED"|"REFUSED", valorCentavos | amount, paidAt, paymentMethod, transactionId }.
 * Responde 200 para tudo que foi entendido (inclusive repetido ou de lote inexistente), para o Coral não reenviar à toa;
 * só erros de autenticação, de formato ou de banco retornam código de erro.
 */
export async function POST(request: Request) {
  const token = process.env.PAGAMENTO_WEBHOOK_TOKEN;
  if (!hasBearerSecret(request, token)) {
    return NextResponse.json({ error: token ? "Não autorizado." : "PAGAMENTO_WEBHOOK_TOKEN não configurado." }, { status: token ? 401 : 503 });
  }
  const body: unknown = await request.json().catch(() => null);
  const lido = lerEventoPagamento(body);
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 400 });
  const { evento } = lido;

  // Expirado ou recusado não baixa nada: o link continua ativo localmente até vencer ou o lote ser pago.
  if (evento.status !== "PAGO") return NextResponse.json({ recebido: true, acao: "ignorado", status: evento.status });

  try {
    const resultado =
      evento.referencia.tipo === "LINK" ? await aplicarPagamentoLink(evento.referencia.id, evento) : await aplicarPagamentoLoteLegado(evento.referencia.id, evento);
    return NextResponse.json({ recebido: true, resultado });
  } catch (error) {
    console.error("[webhook pagamento] falha ao aplicar:", error instanceof Error ? error.message : error);
    // 503 faz o Coral reenviar; a aplicação é idempotente.
    return NextResponse.json({ error: "Falha ao registrar o pagamento." }, { status: 503 });
  }
}
