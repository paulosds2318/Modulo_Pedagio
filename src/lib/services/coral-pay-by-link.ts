const CORAL_PRODUCAO = "https://servicescoral.aluguefoco.com.br";
const CORAL_HOMOLOG = "https://homologservicescoral.aluguefoco.com.br";

/**
 * Base da API do Coral. Só ADYEN_ENVIRONMENT=live usa produção (servicescoral); sem essa variável o padrão é a
 * homologação, e uma URL de produção configurada fora de "live" é recusada: nada de link real por engano.
 */
export function resolverBaseCoral(configurada = process.env.CORAL_PAY_BY_LINK_BASE_URL, ambiente = process.env.ADYEN_ENVIRONMENT): string {
  const live = ambiente === "live";
  const base = (configurada?.trim() || (live ? CORAL_PRODUCAO : CORAL_HOMOLOG)).replace(/\/$/, "");
  if (!live && !new URL(base).hostname.toLowerCase().includes("homolog")) {
    throw new Error(`Ambiente de teste não pode usar o Coral de produção (${new URL(base).hostname}). Use a URL de homologação ou ADYEN_ENVIRONMENT=live.`);
  }
  return base;
}
const LOGIN = () => `${resolverBaseCoral()}/api/auth/login`;
const RENT_AGREEMENT = () => `${resolverBaseCoral()}/api/rentagreement`;
const CREATE_LINK = () => `${resolverBaseCoral()}/api/adyen-pay-by-link/v2/create`;

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
  const phone = firstString(customer.phone1, customer.phone2, customer.phone, nestedCustomer.phone1, nestedCustomer.phone);
  const agreementDate = firstString(agreement.dateInRA, agreement.dataRetirada, agreement.startDate);
  const parsedDate = agreementDate ? new Date(agreementDate) : fallbackDate;
  const dateInRA = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined;

  if (!name || !email) {
    throw new Error("Consulta do contrato no Coral não retornou nome e e-mail do cliente.");
  }
  return { name, email, documentNumber, dateInRA, phone };
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

export function limparTokenCoral() {
  cachedToken = null;
}

export async function loginToCoral(force = false): Promise<string> {
  if (cachedToken && !force) return cachedToken;
  if (tokenRequest && !force) return tokenRequest;

  tokenRequest = (async () => {
    const credentials = getCredentials();
    const response = await fetch(LOGIN(), {
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

/**
 * Data enviada em `dateInRA`. O checkout trata o link como uma "reserva" para essa data e o mostra como
 * "Reserva expirada" quando ela já passou. Para cobrança de pedágio (sempre depois da locação), enviar a
 * data de retirada faz o link nascer expirado. Por isso o padrão é "validade": emissão + N dias.
 * CORAL_PAY_BY_LINK_DATA_REFERENCIA: "validade" (padrão) | "emissao" | "retirada" (comportamento antigo).
 * CORAL_PAY_BY_LINK_VALIDADE_DIAS: dias somados à emissão no modo "validade" (padrão 15, de 1 a 60).
 */
export function dataReferenciaLink(dataRetirada?: string, now = new Date()): string | undefined {
  const modo = process.env.CORAL_PAY_BY_LINK_DATA_REFERENCIA?.trim().toLowerCase() || "validade";
  if (modo === "retirada") return dataRetirada;
  if (modo === "emissao") return now.toISOString();
  const dias = Number(process.env.CORAL_PAY_BY_LINK_VALIDADE_DIAS);
  const validade = Number.isInteger(dias) && dias >= 1 && dias <= 60 ? dias : 15;
  return new Date(now.getTime() + validade * 24 * 60 * 60 * 1000).toISOString();
}

export async function createCoralPaymentLink(input: {
  lotId: number;
  cents: number;
  contract: string;
  cpf: string;
  dateInRA?: Date | null;
  /** 1 no primeiro link do lote; 2, 3… para links novos (cada versão usa uma chave de idempotência própria). */
  versao?: number;
}): Promise<{ id?: string; url: string; nomeCliente?: string; telefoneContato?: string }> {
  if (input.cents <= 0) throw new Error("Valor do link deve ser maior que zero.");

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await loginToCoral(attempt > 0);
    const agreementResponse = await fetch(`${RENT_AGREEMENT()}/${encodeURIComponent(input.contract)}`, {
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
      ...(dataReferenciaLink(customer.dateInRA) ? { dateInRA: dataReferenciaLink(customer.dateInRA) } : {}),
      typePayDue: "due",
    };
    const response = await fetch(CREATE_LINK(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": `foco-toll-lot-${input.lotId}-link-v${input.versao ?? 1}`,
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
    const erroAmbiente = verificarAmbienteDoLink(data.link);
    if (erroAmbiente) throw new Error(erroAmbiente);
    return { url: data.link, nomeCliente: customer.name, telefoneContato: customer.phone };
  }

  throw new Error("Coral Pay By Link recusou a autenticação após renovar o token.");
}

/**
 * Fora de produção (ADYEN_ENVIRONMENT diferente de "live") só vale link de teste: o checkout de homologação do Coral
 * (homologcheckout…) ou o link do ambiente de testes da Adyen (test.adyen.link). Link de produção nunca é salvo nem
 * enviado ao cliente. Devolve a mensagem de erro, ou null se estiver ok.
 */
export function verificarAmbienteDoLink(link: string, ambiente = process.env.ADYEN_ENVIRONMENT): string | null {
  if (ambiente === "live") return null;
  let host = "";
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return "O Coral devolveu um link de pagamento inválido.";
  }
  if (host === "test.adyen.link" || host.includes("homolog")) return null;
  return `O Coral devolveu um link que não é de teste (${host}). Em teste só são aceitos o checkout de homologação do Coral e test.adyen.link; o link foi descartado. Confira a configuração do ambiente de homologação no Coral.`;
}

/** Nome e telefone do cliente no contrato do Coral (GET /api/rentagreement/{contrato}); null se não encontrado. */
export async function consultarContatoCliente(contract: string): Promise<{ nome: string | null; telefone: string | null } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await loginToCoral(attempt > 0);
    const response = await fetch(`${RENT_AGREEMENT()}/${encodeURIComponent(contract)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 && attempt === 0) {
      cachedToken = null;
      continue;
    }
    if (!response.ok) return null;
    const result = await readJson(response);
    const rawData = result.data ?? result;
    const data = Array.isArray(rawData) ? record(rawData[0]) : record(rawData);
    const agreement = record(data.rentAgreement ?? data.rentagreement ?? data.contrato ?? data);
    const customer = record(agreement.customer ?? agreement.customerData ?? agreement.client ?? agreement.cliente ?? agreement.locatario);
    return {
      nome: firstString(agreement.customerName, agreement.nomeCliente, customer.name, customer.nome, customer.fullName, customer.nomeCompleto) ?? null,
      telefone: firstString(customer.phone1, customer.phone2, customer.phone) ?? null,
    };
  }
  return null;
}
