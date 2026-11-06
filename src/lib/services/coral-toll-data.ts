import { extractItems, validarPassagens } from "@/lib/passagem-schema";
import { importarECompilarPassagens } from "@/lib/services/importar-passagens";

const TOLL_DATA_PATH = "/api/fleet/management/tag/public/events/conectcar/toll-data";
const DAY = 24 * 60 * 60 * 1000;
const tokens = new Map<string, string>();

/** URL completa do endpoint. Sem CORAL_TOLL_DATA_URL a sincronização fica desligada. */
export function tollDataUrl() {
  const url = process.env.CORAL_TOLL_DATA_URL?.trim();
  if (!url) return null;
  return url.includes("/api/") ? url : `${url.replace(/\/$/, "")}${TOLL_DATA_PATH}`;
}

async function login(origin: string, force = false) {
  if (!force && tokens.has(origin)) return tokens.get(origin)!;
  const login = process.env.CORAL_TOLL_DATA_LOGIN?.trim() || process.env.CORAL_PAY_BY_LINK_LOGIN?.trim();
  const password = process.env.CORAL_TOLL_DATA_PASSWORD || process.env.CORAL_PAY_BY_LINK_PASSWORD;
  if (!login || !password) throw new Error("CONFIG: Credenciais do Coral para consulta de passagens não configuradas.");

  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as { data?: { token?: unknown } } | null;
  const token = body?.data?.token;
  if (!response.ok || typeof token !== "string" || !token) throw new Error(`Coral não autenticou (HTTP ${response.status}).`);
  tokens.set(origin, token);
  return token;
}

function describeError(status: number, body: unknown) {
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  let message = data && typeof data === "object" ? (data as { message?: unknown }).message : data;
  if (typeof message === "string") {
    try { message = (JSON.parse(message) as { message?: unknown }).message ?? message; } catch { /* texto simples */ }
  }
  return `Coral respondeu HTTP ${status} na consulta de passagens${typeof message === "string" ? `: ${message}` : "."}`;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_PERIOD_DAYS = 31;

async function fetchPage(url: URL, fixedToken: string | undefined): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = fixedToken || await login(url.origin, attempt > 0);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401 && fixedToken) throw new Error("Coral recusou o CORAL_TOLL_DATA_TOKEN (HTTP 401). Verifique se o token é válido para este ambiente.");
    if (response.status === 401 && attempt === 0) continue;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(describeError(response.status, body));
    return body;
  }
  throw new Error("Coral recusou a autenticação após renovar o token.");
}

/** Lê todas as páginas: o Coral responde {data: {total, page, pageSize, data: [...]}}. */
export async function fetchCoralTollData(from: Date, to: Date): Promise<unknown[]> {
  const base = tollDataUrl();
  if (!base) throw new Error("CONFIG: CORAL_TOLL_DATA_URL não configurada.");
  const url = new URL(base);
  // O Coral exige startDate e endDate juntos (AAAA-MM-DD), com período de no máximo 31 dias.
  url.searchParams.set("startDate", from.toISOString().slice(0, 10));
  url.searchParams.set("endDate", to.toISOString().slice(0, 10));
  url.searchParams.set("pageSize", String(PAGE_SIZE));

  // Token fixo fornecido pelo Coral tem prioridade sobre o login com usuário e senha.
  const fixedToken = process.env.CORAL_TOLL_DATA_TOKEN?.trim().replace(/^Bearer\s+/i, "");
  const all: unknown[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    url.searchParams.set("page", String(page));
    const body = await fetchPage(url, fixedToken);
    const items = extractItems(body);
    if (!items) throw new Error("Resposta do Coral sem lista de passagens reconhecível.");
    all.push(...items);
    const data = body && typeof body === "object" ? (body as { data?: { total?: unknown } }).data : undefined;
    const total = typeof data?.total === "number" ? data.total : undefined;
    if (items.length < PAGE_SIZE || (total !== undefined && all.length >= total)) return all;
  }
  throw new Error(`Consulta ao Coral excedeu ${MAX_PAGES} páginas; reduza o período.`);
}

/** Período padrão (últimos N dias) ou informado, sempre dentro do limite do Coral. */
export function resolverPeriodo(now: Date, inicio?: string, fim?: string) {
  if (!inicio && !fim) {
    const days = Math.min(Math.max(Number(process.env.CORAL_TOLL_DATA_LOOKBACK_DAYS) || 7, 1), MAX_PERIOD_DAYS);
    return { from: new Date(now.getTime() - days * DAY), to: now };
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!inicio || !fim || !iso.test(inicio) || !iso.test(fim)) throw new Error("PERIODO: Informe startDate e endDate no formato AAAA-MM-DD.");
  const from = new Date(`${inicio}T00:00:00Z`);
  const to = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error("PERIODO: Período inválido.");
  if ((to.getTime() - from.getTime()) / DAY > MAX_PERIOD_DAYS) throw new Error(`PERIODO: O período não pode passar de ${MAX_PERIOD_DAYS} dias.`);
  return { from, to };
}

/**
 * Busca passagens no toll-data do Coral (mesmo contrato de POST /api/passagens) e importa/compila.
 * O idCoral é usado sem alteração, então a mesma passagem recebida pelos dois caminhos não duplica.
 */
export async function sincronizarPassagensCoral(now = new Date(), periodo?: { startDate?: string; endDate?: string }) {
  const { from, to } = resolverPeriodo(now, periodo?.startDate, periodo?.endDate);
  const items = await fetchCoralTollData(from, to);
  const { validas, rejeitadas } = validarPassagens(items);
  const resultado = await importarECompilarPassagens(validas);
  return {
    periodo: { startDate: from.toISOString().slice(0, 10), endDate: to.toISOString().slice(0, 10) },
    recebidas: items.length,
    ...resultado,
    rejeitadas: rejeitadas.length,
    exemplosRejeicao: rejeitadas.slice(0, 10),
  };
}
