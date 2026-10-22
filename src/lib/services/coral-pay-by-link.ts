const API_BASE = (process.env.CORAL_PAY_BY_LINK_BASE_URL?.trim() || "https://servicescoral.aluguefoco.com.br").replace(/\/$/, "");
const LOGIN = `${API_BASE}/api/auth/login`;
const CREATE_LINK = `${API_BASE}/api/adyen-pay-by-link/v2/create`;

let cachedToken: string | null = null;
let tokenRequest: Promise<string> | null = null;

type ApiObject = Record<string, unknown>;

async function readJson(response: Response): Promise<ApiObject> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" ? body as ApiObject : {};
}

function getCredentials() {
  const login = process.env.CORAL_PAY_BY_LINK_LOGIN?.trim();
  const password = process.env.CORAL_PAY_BY_LINK_PASSWORD;
  if (!login || !password) {
    throw new Error("CONFIG: Credenciais do Coral Pay By Link não configuradas.");
  }
  return { login, password };
}

async function loginToCoral(force = false): Promise<string> {
  if (cachedToken && !force) return cachedToken;
  if (tokenRequest && !force) return tokenRequest;

  tokenRequest = (async () => {
    const credentials = getCredentials();
    const response = await fetch(LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(credentials),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await readJson(response);
    const data = result.data && typeof result.data === "object" ? result.data as ApiObject : {};
    if (!response.ok || typeof data.token !== "string" || !data.token) {
      throw new Error(`Coral Pay By Link não autenticou (HTTP ${response.status}).`);
    }
    cachedToken = data.token;
    return data.token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

export async function createCoralPaymentLink(input: {
  lotId: number;
  cents: number;
  contract: string;
  cpf: string;
  dateInRA?: Date | null;
}): Promise<{ id?: string; url: string }> {
  if (input.cents <= 0) throw new Error("Valor do link deve ser maior que zero.");

  const body = {
    reference: `LOTE_${input.lotId}`,
    amount: { value: input.cents / 100 },
    isPrePayment: false,
    isFromApp: false,
    isCheckin: false,
    documentNumber: input.cpf.replace(/\D/g, ""),
    ...(input.dateInRA ? { dateInRA: input.dateInRA.toISOString() } : {}),
    typePayDue: "due",
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await loginToCoral(attempt > 0);
    const response = await fetch(CREATE_LINK, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": `foco-toll-lot-${input.lotId}-link-v1`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (response.status === 401 && attempt === 0) {
      cachedToken = null;
      continue;
    }

    const result = await readJson(response);
    const data = result.data && typeof result.data === "object" ? result.data as ApiObject : {};
    if (!response.ok || typeof data.link !== "string" || !data.link.startsWith("https://")) {
      throw new Error(`Coral Pay By Link falhou ao criar link (HTTP ${response.status}).`);
    }
    return { url: data.link };
  }

  throw new Error("Coral Pay By Link recusou a autenticação após renovar o token.");
}
