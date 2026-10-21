import test from "node:test";
import assert from "node:assert/strict";
import { isCalendarDate, saoPauloDateRange } from "../src/lib/date-range.ts";
import { retryAt } from "../src/lib/retry.ts";

test("interpreta datas como dias locais de São Paulo, com fim exclusivo", () => {
  assert.deepEqual(saoPauloDateRange("2026-10-21", "2026-10-21"), {
    gte: new Date("2026-10-21T03:00:00.000Z"),
    lt: new Date("2026-10-22T03:00:00.000Z"),
  });
});

test("aceita limites de data opcionais", () => {
  assert.deepEqual(saoPauloDateRange(undefined, "2026-10-21"), {
    lt: new Date("2026-10-22T03:00:00.000Z"),
  });
});

test("rejeita datas de calendário inválidas", () => {
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-10-21"), true);
});

test("calcula retentativas com espera crescente e teto de 24 horas", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  assert.equal(retryAt(1, now).getTime() - now.getTime(), 60_000);
  assert.equal(retryAt(4, now).getTime() - now.getTime(), 8 * 60_000);
  assert.equal(retryAt(20, now).getTime() - now.getTime(), 24 * 60 * 60_000);
});
