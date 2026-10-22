const API_BASE = (process.env.CORAL_PAY_BY_LINK_BASE_URL?.trim() || "https://servicescoral.aluguefoco.com.br").replace(/\/$/, "");
const LOGIN = `${API_BASE}/api/auth/login`;
const RENT_AGREEMENT = `${API_BASE}/api/rentagreement`;
const CREATE_LINK = `${API_BASE}/api/adyen-pay-by-link/v2/create`;

let cachedToken: string | null = null;
let tokenRequest: Promise<string> | null = null;

type ApiObject = Record<string, unknown>;

function record(value: unknown): ApiObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ApiObject : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function agreementCustomer(result: ApiObject, fallbackDate?: Date | null) {
  const rawData = result.data ?? result;
  const data = Array.isArray(rawData) ? record(rawData[0]) : record(rawData);
  const agreement = record(data.rentAgreement ?? data.rentagreement ?? data.contrato ?? data);
  const customer = record(agreement.customer ?? agreement.client ?? agreement.cliente ?? agreement.locatario ?? agreement.customerDetails ?? agreement.renter ?? agreement.tenant);
  const nestedCustomer = record(customer.customer ?? customer.client ?? customer.cliente);

  const name = firstString(
    agreement.customerName, agreement.nomeCliente, agreement.clientName, agreement.name, agreement.nome,
    customer.customerName, customer.name, customer.nome, customer.fullName, customer.nomeCompleto,
    nestedCustomer.name, nestedCustomer.nome, nestedCustomer.fullName
  );
  const email = firstString(
    agreement.customerEmail, agreement.emailCliente, agreement.clientEmail, agreement.email,
    customer.customerEmail, customer.email, nestedCustomer.email
  );
  const documentNumber = firstString(
    agreement.documentNumber, agreement.cpfCliente, agreement.cpf, agreement.clientDocumentNumber,
    customer.documentNumber, customer.cpf, customer.cpfCliente, nestedCustomer.documentNumber, nestedCustomer.cpf
  );
  const agreementDate = firstString(agreement.dateInRA, agreement.dataRetirada, agreement.startDate);
  const parsedDate = agreementDate ? new Date(agreementDate) : fallbackDate;
  const dateInRA = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined;

  if (!name || !email) {
    throw new Error("Consulta do contrato no Coral não retornou nome e e-mail do cliente.");
  }
  return { name, email, documentNumber, dateInRA };
}

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

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await loginToCoral(attempt > 0);
    const agreementResponse = await fetch(`${RENT_AGREEMENT}/${encodeURIComponent(input.contract)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (agreementResponse.status === 401 && attempt === 0) {
      cachedToken = null;
      continue;
    }
    const agreementResult = await readJson(agreementResponse);
    if (!agreementResponse.ok) {
      throw new Error(`Coral não conseguiu consultar o contrato (HTTP ${agreementResponse.status}).`);
    }
    const customer = agreementCustomer(agreementResult, input.dateInRA);
    const body = {
      reference: `LOTE_${input.lotId}`,
      amount: { value: input.cents / 100 },
      isPrePayment: false,
      isFromApp: false,
      isCheckin: false,
      documentNumber: (customer.documentNumber ?? input.cpf).replace(/\D/g, ""),
      customerName: customer.name,
      customerEmail: customer.email,
      ...(customer.dateInRA ? { dateInRA: customer.dateInRA } : {}),
      typePayDue: "due",
    };
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
