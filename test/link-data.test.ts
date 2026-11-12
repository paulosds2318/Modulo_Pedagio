import test from "node:test";
import assert from "node:assert/strict";
import { dataReferenciaLink } from "../src/lib/services/coral-pay-by-link.ts";

const NOW = new Date("2026-11-13T15:00:00Z");

test("padrão: emissão + 15 dias (link não nasce expirado)", () => {
  delete process.env.CORAL_PAY_BY_LINK_DATA_REFERENCIA;
  delete process.env.CORAL_PAY_BY_LINK_VALIDADE_DIAS;
  assert.equal(dataReferenciaLink("2026-08-25T03:00:00.000Z", NOW), "2026-11-28T15:00:00.000Z");
  process.env.CORAL_PAY_BY_LINK_VALIDADE_DIAS = "10";
  assert.equal(dataReferenciaLink(undefined, NOW), "2026-11-23T15:00:00.000Z");
  process.env.CORAL_PAY_BY_LINK_VALIDADE_DIAS = "999";
  assert.equal(dataReferenciaLink(undefined, NOW), "2026-11-28T15:00:00.000Z");
});

test("modos emissão e retirada (comportamento antigo)", () => {
  process.env.CORAL_PAY_BY_LINK_DATA_REFERENCIA = "emissao";
  assert.equal(dataReferenciaLink("2026-08-25T03:00:00.000Z", NOW), NOW.toISOString());
  process.env.CORAL_PAY_BY_LINK_DATA_REFERENCIA = "retirada";
  assert.equal(dataReferenciaLink("2026-08-25T03:00:00.000Z", NOW), "2026-08-25T03:00:00.000Z");
  delete process.env.CORAL_PAY_BY_LINK_DATA_REFERENCIA;
  delete process.env.CORAL_PAY_BY_LINK_VALIDADE_DIAS;
});
