import { createHmac, timingSafeEqual } from "node:crypto";

function config() {
  const key = process.env.ADYEN_API_KEY;
  const merchant = process.env.ADYEN_MERCHANT_ACCOUNT;
  if (!key || !merchant) return null;
  const env = process.env.ADYEN_ENVIRONMENT === "live" ? "live" : "test";
  const version = process.env.ADYEN_API_VERSION || "v71";
  if (env === "test") return { key, merchant, base: `https://checkout-test.adyen.com/${version}` };
  const prefix = process.env.ADYEN_LIVE_PREFIX;
  if (!prefix) throw new Error("Configure ADYEN_LIVE_PREFIX para usar Adyen Live.");
  return { key, merchant, base: `https://${prefix}-checkout-live.adyenpayments.com/checkout/${version}` };
}

async function adyenRequest(path: string, body?: unknown, method = "POST", idempotencyKey?: string) {
  const cfg = config();
  if (!cfg) return null;
  const headers: Record<string, string> = { "X-API-Key": cfg.key, "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${cfg.base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Adyen respondeu HTTP ${response.status}.`);
  if (response.status === 204) return {};
  return response.json() as Promise<Record<string, unknown>>;
}

export async function createPaymentLink(lotId: number, cents: number, contract: string) {
  const result = await adyenRequest("/paymentLinks", { merchantAccount: config()?.merchant, amount: { currency: "BRL", value: cents }, reference: `LOTE_${lotId}`, description: `Pedágio - contrato ${contract}` }, "POST", `toll-lot-${lotId}-link`);
  return result as { id?: string; url?: string } | null;
}

export async function expirePaymentLink(linkId: string, lotId: number) {
  return adyenRequest(`/paymentLinks/${encodeURIComponent(linkId)}`, { status: "expired" }, "PATCH", `toll-lot-${lotId}-expire-${linkId}`);
}

export async function chargeStoredPaymentMethod(lotId: number, stage: string, cents: number, contract: string, storedPaymentMethodId: string) {
  return adyenRequest("/payments", {
    merchantAccount: config()?.merchant,
    amount: { currency: "BRL", value: cents },
    reference: `LOTE_${lotId}_${stage}`,
    paymentMethod: { type: "scheme", storedPaymentMethodId },
    shopperInteraction: "ContAuth",
    recurringProcessingModel: "UnscheduledCardOnFile",
  }, "POST", `toll-lot-${lotId}-${stage}`) as Promise<{ resultCode?: string; pspReference?: string } | null>;
}

export function isValidAdyenHmac(item: Record<string, unknown>) {
  const keyHex = process.env.ADYEN_HMAC_KEY;
  const signature = item.additionalData && typeof item.additionalData === "object" ? (item.additionalData as Record<string, unknown>).hmacSignature : undefined;
  if (!keyHex || typeof signature !== "string") return false;
  const amount = (item.amount && typeof item.amount === "object" ? item.amount : {}) as Record<string, unknown>;
  const values = [item.pspReference, item.originalReference, item.merchantAccountCode, item.merchantReference, amount.value, amount.currency, item.eventCode, item.success];
  const encoded = values.map((value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/:/g, "\\:")).join(":");
  const expected = createHmac("sha256", Buffer.from(keyHex, "hex")).update(encoded, "utf8").digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

