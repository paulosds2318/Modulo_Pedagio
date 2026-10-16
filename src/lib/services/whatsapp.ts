export type WhatsAppResult = { messageId?: string };

/** Adaptador para um gateway configurado pela empresa; contrato JSON: {to,text,reference}. */
export async function sendWhatsAppMessage(to: string, text: string, reference: string): Promise<WhatsAppResult | null> {
  const url = process.env.WHATSAPP_API_URL;
  if (!url) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.WHATSAPP_API_TOKEN) headers.Authorization = `Bearer ${process.env.WHATSAPP_API_TOKEN}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ to, text, reference }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Gateway WhatsApp respondeu HTTP ${response.status}.`);
  const body: unknown = await response.json().catch(() => ({}));
  const messageId = body && typeof body === "object" && "messageId" in body && typeof body.messageId === "string" ? body.messageId : undefined;
  return { messageId };
}

export function buildPaymentMessage(contract: string, amountCents: number, paymentUrl?: string | null) {
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
  return `Olá! Identificamos pedágios do contrato ${contract}, no total de ${amount}.${paymentUrl ? ` Para pagar, acesse: ${paymentUrl}` : " Em breve enviaremos as instruções de pagamento."}`;
}
