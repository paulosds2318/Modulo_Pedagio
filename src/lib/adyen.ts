import { createHmac, timingSafeEqual } from "node:crypto";

function config() {
  const key = process.env.ADYEN_API_KEY?.trim();
  const merchant = process.env.ADYEN_MERCHANT_ACCOUNT?.trim();
  if (!key || !merchant) return null;
  const env = process.env.ADYEN_ENVIRONMENT === "live" ? "live" : "test";
  const version = process.env.ADYEN_API_VERSION?.trim() || "v71";
  if (env === "test") {
    return { key, merchant, base: `https://checkout-test.adyen.com/${version}` };
  }
  const prefix = process.env.ADYEN_LIVE_PREFIX?.trim();
  if (!prefix) {
    throw new Error("Configuração de segurança: ADYEN_LIVE_PREFIX é obrigatório no ambiente Live.");
  }
  return { key, merchant, base: `https://${prefix}-checkout-live.adyenpayments.com/checkout/${version}` };
}

export type AdyenErrorDetails = {
  status: number;
  errorCode?: string;
  message?: string;
  errorType?: string;
};

export class AdyenApiError extends Error {
  details: AdyenErrorDetails;
  constructor(message: string, details: AdyenErrorDetails) {
    super(message);
    this.name = "AdyenApiError";
    this.details = details;
  }
}

async function adyenRequest(
  path: string,
  body?: unknown,
  method = "POST",
  idempotencyKey?: string
): Promise<Record<string, unknown> | null> {
  const cfg = config();
  if (!cfg) return null;

  const headers: Record<string, string> = {
    "X-API-Key": cfg.key,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch(`${cfg.base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 204) return {};

  const responseText = await response.text();
  let json: Record<string, unknown> = {};
  try {
    if (responseText) {
      json = JSON.parse(responseText);
    }
  } catch {
    json = { raw: responseText };
  }

  if (!response.ok) {
    const errorCode = typeof json.errorCode === "string" ? json.errorCode : undefined;
    const message = typeof json.message === "string" ? json.message : `Adyen respondeu HTTP ${response.status}`;
    const errorType = typeof json.errorType === "string" ? json.errorType : undefined;

    throw new AdyenApiError(`Adyen erro [${response.status}]: ${message}`, {
      status: response.status,
      errorCode,
      message,
      errorType,
    });
  }

  return json;
}

export async function createPaymentLink(lotId: number, cents: number, contract: string) {
  if (cents <= 0) {
    throw new Error("Segurança de pagamento: valor da cobrança deve ser maior que zero.");
  }
  const cfg = config();
  if (!cfg) return null;

  const result = await adyenRequest(
    "/paymentLinks",
    {
      merchantAccount: cfg.merchant,
      amount: { currency: "BRL", value: cents },
      reference: `LOTE_${lotId}`,
      description: `Foco Aluguel de Carros - Pedágio contrato ${contract}`,
      reusable: false,
    },
    "POST",
    `foco-toll-lot-${lotId}-link-v1`
  );
  return result as { id?: string; url?: string } | null;
}

export async function expirePaymentLink(linkId: string, lotId: number) {
  if (!linkId) return null;
  try {
    return await adyenRequest(
      `/paymentLinks/${encodeURIComponent(linkId)}`,
      { status: "expired" },
      "PATCH",
      `foco-toll-lot-${lotId}-expire-${linkId}`
    );
  } catch (error) {
    // Se o link já estava expirado ou pago, a Adyen pode responder 422/400.
    if (error instanceof AdyenApiError && (error.details.status === 422 || error.details.status === 400)) {
      return { status: "already_closed", details: error.details.message };
    }
    throw error;
  }
}

export async function chargeStoredPaymentMethod(
  lotId: number,
  stage: string,
  cents: number,
  contract: string,
  storedPaymentMethodId: string
) {
  if (cents <= 0) {
    throw new Error("Segurança de pagamento: valor de débito deve ser maior que zero.");
  }
  const cfg = config();
  if (!cfg) return null;

  const result = await adyenRequest(
    "/payments",
    {
      merchantAccount: cfg.merchant,
      amount: { currency: "BRL", value: cents },
      reference: `LOTE_${lotId}_${stage}`,
      paymentMethod: { type: "scheme", storedPaymentMethodId },
      shopperInteraction: "ContAuth",
      recurringProcessingModel: "UnscheduledCardOnFile",
      description: `Débito pedágio contrato ${contract} - etapa ${stage}`,
    },
    "POST",
    `foco-toll-lot-${lotId}-${stage}-v1`
  );

  return result as { resultCode?: string; pspReference?: string; refusalReason?: string } | null;
}

export function isValidAdyenHmac(item: Record<string, unknown>): boolean {
  try {
    const keyHex = process.env.ADYEN_HMAC_KEY?.trim();
    if (!keyHex) return false;

    const signature =
      item.additionalData && typeof item.additionalData === "object"
        ? (item.additionalData as Record<string, unknown>).hmacSignature
        : undefined;

    if (typeof signature !== "string" || !signature) return false;

    // Se merchantAccountCode estiver presente, validar se confere com o da aplicação
    const configuredMerchant = process.env.ADYEN_MERCHANT_ACCOUNT?.trim();
    if (
      configuredMerchant &&
      item.merchantAccountCode &&
      String(item.merchantAccountCode) !== configuredMerchant
    ) {
      return false;
    }

    const amount = (item.amount && typeof item.amount === "object" ? item.amount : {}) as Record<string, unknown>;
    const values = [
      item.pspReference,
      item.originalReference,
      item.merchantAccountCode,
      item.merchantReference,
      amount.value,
      amount.currency,
      item.eventCode,
      item.success,
    ];

    const encoded = values
      .map((value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/:/g, "\\:"))
      .join(":");

    const expected = createHmac("sha256", Buffer.from(keyHex, "hex")).update(encoded, "utf8").digest();
    const received = Buffer.from(signature, "base64");

    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}
