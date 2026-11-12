import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDuration,
  median,
  painelQuery,
  parsePainelFilters,
  percent,
  periodLabel,
  previousFilters,
  timelineKey,
  timelinePoints,
  timelineUnit,
  variation,
} from "../src/lib/painel.ts";

const NOW = new Date("2026-11-12T15:00:00Z"); // 12:00 em Brasília

test("período padrão é os últimos 7 dias a partir da meia-noite de Brasília", () => {
  const f = parsePainelFilters({}, NOW);
  assert.equal(f.period, "7dias");
  assert.equal(f.from.toISOString(), "2026-11-06T03:00:00.000Z");
  assert.equal(f.to, null);
  assert.equal(parsePainelFilters({ periodo: "hoje" }, NOW).from.toISOString(), "2026-11-12T03:00:00.000Z");
  assert.equal(parsePainelFilters({ periodo: "30dias" }, NOW).from.toISOString(), "2026-10-14T03:00:00.000Z");
});

test("datas De/Até têm prioridade, são reordenadas e o fim é exclusivo", () => {
  const f = parsePainelFilters({ periodo: "hoje", de: "2026-09-05", ate: "2026-08-06" }, NOW);
  assert.equal(f.period, "personalizado");
  assert.equal(f.de, "2026-08-06");
  assert.equal(f.from.toISOString(), "2026-08-06T03:00:00.000Z");
  assert.equal(f.to?.toISOString(), "2026-09-06T03:00:00.000Z");
  assert.equal(periodLabel(f), "De 06/08/2026 até 05/09/2026");
});

test("filtros inválidos são ignorados e a query mantém os válidos", () => {
  const f = parsePainelFilters({ situacao: "QUALQUER", etapa: "D99", loja: "SAO11 - CGH" }, NOW);
  assert.equal(f.situacao, undefined);
  assert.equal(f.etapa, undefined);
  assert.equal(painelQuery(f, { p: 2 }), "periodo=7dias&loja=SAO11+-+CGH&p=2");
  assert.equal(parsePainelFilters({ situacao: "PAGO", etapa: "D7" }, NOW).situacao, "PAGO");
});

test("período anterior tem a mesma duração; sem data inicial não há comparação", () => {
  const f = parsePainelFilters({}, NOW);
  const p = previousFilters(f, NOW)!;
  assert.equal(p.from.toISOString(), "2026-10-30T03:00:00.000Z");
  assert.equal(p.to?.toISOString(), "2026-11-05T15:00:00.000Z");
  assert.equal(previousFilters(parsePainelFilters({ ate: "2026-09-05" }, NOW), NOW), null);
});

test("variação, percentual, mediana e duração", () => {
  assert.equal(variation(12, 10), "▲ 20%");
  assert.equal(variation(5, 10), "▼ 50%");
  assert.equal(variation(3, 0), "sem base anterior");
  assert.equal(variation(0, 0), "sem variação");
  assert.equal(percent(1, 3), "33%");
  assert.equal(percent(1, 0), "—");
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([]), null);
  assert.equal(formatDuration(3 * 86400 + 4 * 3600), "3 d 4 h");
  assert.equal(formatDuration(null), "—");
});

test("gráfico agrupa por dia no horário de Brasília e inclui dias sem lotes", () => {
  const from = new Date("2026-11-10T03:00:00Z");
  const to = new Date("2026-11-13T03:00:00Z");
  assert.equal(timelineUnit(from, to), "day");
  const lote = new Date("2026-11-12T02:30:00Z"); // 23:30 do dia 11 em Brasília
  const totals = new Map([[timelineKey(lote, "day"), 2]]);
  const points = timelinePoints(from, to, "day", totals);
  assert.deepEqual(points.map((p) => [p.label, p.value]), [["10/11", 0], ["11/11", 2], ["12/11", 0]]);
});
