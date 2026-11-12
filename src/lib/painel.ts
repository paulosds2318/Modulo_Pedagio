import { CODIGOS_LOJA } from "./lojas.ts";
/**
 * Regras do painel de acompanhamento (período, filtros, comparação e gráfico), no mesmo padrão do painel da
 * Conciliação DMA. Sem dependências de servidor, para ser testável com `node --test`.
 */

export const PERIODS = { hoje: "Hoje", "7dias": "Últimos 7 dias", "30dias": "Últimos 30 dias" } as const;
export type Period = keyof typeof PERIODS;

export const SITUACOES: Record<string, string> = { EM_REGUA: "Em régua", PAGO: "Pago", INADIMPLENTE: "Inadimplente", CANCELADO: "Cancelado" };
export const ETAPAS: Record<string, string> = { D0: "D+0", D5: "D+2", D7: "D+5", D10: "D+7" };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Brasília não tem horário de verão desde 2019: o horário local é sempre UTC-3. */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const brasiliaToday = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
const brasiliaMidnight = (day: string) => new Date(`${day}T00:00:00-03:00`);

/** Início do período: meia-noite de Brasília de hoje, de 6 ou de 29 dias atrás (o dia de hoje conta). */
export function periodStart(period: Period, now = new Date()) {
  const today = brasiliaMidnight(brasiliaToday(now));
  const daysBack = period === "hoje" ? 0 : period === "7dias" ? 6 : 29;
  return new Date(today.getTime() - daysBack * DAY_MS);
}

/** Filtros do painel, lidos da URL; valem para a tela e para o relatório exportado. */
export type PainelFilters = {
  period: Period | "personalizado";
  /** Início (inclusivo) e fim (exclusivo) da data de emissão do lote; sem fim, vai até agora. */
  from: Date;
  to: Date | null;
  de?: string;
  ate?: string;
  loja?: string;
  situacao?: string;
  etapa?: string;
};
type SearchParams = Record<string, string | string[] | undefined>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function param(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function validDay(value: string | undefined) {
  return value && DAY.test(value) && !Number.isNaN(brasiliaMidnight(value).getTime()) ? value : undefined;
}

/** Datas De/Até (dias de Brasília) têm prioridade sobre os atalhos; sem nenhum, últimos 7 dias. */
export function parsePainelFilters(params: SearchParams, now = new Date()): PainelFilters {
  const situacao = param(params, "situacao");
  const etapa = param(params, "etapa");
  const scope = {
    loja: CODIGOS_LOJA.find((codigo) => codigo === param(params, "loja")),
    situacao: situacao && situacao in SITUACOES ? situacao : undefined,
    etapa: etapa && etapa in ETAPAS ? etapa : undefined,
  };
  let de = validDay(param(params, "de"));
  let ate = validDay(param(params, "ate"));
  if (de || ate) {
    if (de && ate && de > ate) [de, ate] = [ate, de];
    const to = ate ? new Date(brasiliaMidnight(ate).getTime() + DAY_MS) : null;
    return { period: "personalizado", from: de ? brasiliaMidnight(de) : new Date(0), to, de, ate, ...scope };
  }
  const requested = param(params, "periodo");
  const period: Period = requested && requested in PERIODS ? (requested as Period) : "7dias";
  return { period, from: periodStart(period, now), to: null, ...scope };
}

/** Monta a query string mantendo os filtros; `extra` acrescenta ou troca parâmetros (ex.: página). */
export function painelQuery(filters: PainelFilters, extra: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  if (filters.period !== "personalizado") query.set("periodo", filters.period);
  const values = { de: filters.de, ate: filters.ate, loja: filters.loja, situacao: filters.situacao, etapa: filters.etapa, ...extra };
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}

/** Página pedida na URL (1 quando ausente ou inválida). */
export function pageParam(params: SearchParams, key: string) {
  const page = Number.parseInt(param(params, key) ?? "", 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

const brDay = (day: string) => day.split("-").reverse().join("/");
export function periodLabel(filters: PainelFilters) {
  if (filters.period !== "personalizado") return PERIODS[filters.period];
  if (filters.de && filters.ate) return filters.de === filters.ate ? `Em ${brDay(filters.de)}` : `De ${brDay(filters.de)} até ${brDay(filters.ate)}`;
  return filters.de ? `A partir de ${brDay(filters.de)}` : `Até ${brDay(filters.ate!)}`;
}

/** Período anterior de mesma duração, para comparação. Sem data inicial não há base de comparação. */
export function previousFilters(filters: PainelFilters, now = new Date()): PainelFilters | null {
  if (filters.period === "personalizado" && !filters.de) return null;
  const end = filters.to ?? now;
  const days =
    filters.period === "hoje" ? 1 : filters.period === "7dias" ? 7 : filters.period === "30dias" ? 30 : Math.ceil((end.getTime() - filters.from.getTime()) / DAY_MS);
  const shift = days * DAY_MS;
  return { ...filters, from: new Date(filters.from.getTime() - shift), to: new Date(end.getTime() - shift) };
}

/** Variação em relação ao período anterior (ex.: "▲ 12%"); sem base quando o anterior é zero ou não existe. */
export function variation(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? "sem variação" : "sem base anterior";
  const change = Math.round(((current - previous) / previous) * 100);
  return change === 0 ? "sem variação" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}%`;
}

export function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

/** Percentual inteiro para exibição; "—" quando não há base. */
export function percent(part: number, total: number) {
  return total ? `${Math.round((part / total) * 100)}%` : "—";
}

/** Duração em texto curto (ex.: "45 min", "5 h", "2 d 4 h"); "—" sem valor. */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 && hours < 10 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type TimelineUnit = "hour" | "day" | "week" | "month";
export type TimelinePoint = { key: string; label: string; value: number };
export const UNIT_LABELS: Record<TimelineUnit, string> = { hour: "hora", day: "dia", week: "semana", month: "mês" };

/** Agrupamento do gráfico: por hora num dia, por dia até ~2 meses, por semana até ~6 meses e por mês acima disso. */
export function timelineUnit(from: Date, to: Date): TimelineUnit {
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  return days <= 1 ? "hour" : days <= 62 ? "day" : days <= 183 ? "week" : "month";
}

const pad = (value: number) => String(value).padStart(2, "0");
function bucketKey(local: Date) {
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}`;
}
function truncate(local: Date, unit: TimelineUnit) {
  const date = new Date(local);
  date.setUTCMinutes(0, 0, 0);
  if (unit === "hour") return date;
  date.setUTCHours(0);
  if (unit === "week") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (unit === "month") date.setUTCDate(1);
  return date;
}
function advance(local: Date, unit: TimelineUnit) {
  const date = new Date(local);
  if (unit === "hour") date.setUTCHours(date.getUTCHours() + 1);
  else if (unit === "day") date.setUTCDate(date.getUTCDate() + 1);
  else if (unit === "week") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function bucketLabel(local: Date, unit: TimelineUnit) {
  const dayMonth = `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}`;
  if (unit === "hour") return `${pad(local.getUTCHours())}h`;
  if (unit === "day") return dayMonth;
  if (unit === "week") return `Semana de ${dayMonth}`;
  return `${MONTHS[local.getUTCMonth()]}/${local.getUTCFullYear()}`;
}

/** Chave do grupo (horário de Brasília) de uma data, no mesmo formato de `timelinePoints`. */
export function timelineKey(date: Date, unit: TimelineUnit) {
  return bucketKey(truncate(new Date(date.getTime() - BRASILIA_OFFSET_MS), unit));
}

/** Todos os grupos do período, inclusive os sem lotes (valor 0). */
export function timelinePoints(from: Date, to: Date, unit: TimelineUnit, totals: Map<string, number>, limit = 400): TimelinePoint[] {
  const end = new Date(to.getTime() - 1 - BRASILIA_OFFSET_MS);
  const points: TimelinePoint[] = [];
  for (let local = truncate(new Date(from.getTime() - BRASILIA_OFFSET_MS), unit); local <= end && points.length < limit; local = advance(local, unit)) {
    const key = bucketKey(local);
    points.push({ key, label: bucketLabel(local, unit), value: totals.get(key) ?? 0 });
  }
  return points;
}
