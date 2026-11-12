import test from "node:test";
import assert from "node:assert/strict";
import { CODIGOS_LOJA, lojaDoContrato, siglaDaLoja } from "../src/lib/lojas.ts";
import { parsePainelFilters } from "../src/lib/painel.ts";

test("loja do contrato pela sigla inicial", () => {
  assert.equal(CODIGOS_LOJA.length, 23);
  assert.equal(lojaDoContrato("CGH000004-26"), "SAO11 - CGH");
  assert.equal(lojaDoContrato("gru000010-26"), "SAO10 - GRU");
  assert.equal(lojaDoContrato("REC000001-26"), "REC20");
  assert.equal(lojaDoContrato("DEMO-2026-001"), null);
  assert.equal(siglaDaLoja("SAO11 - CGH"), "CGH");
  assert.equal(siglaDaLoja("XYZ"), null);
});

test("filtro do painel só aceita lojas da lista", () => {
  assert.equal(parsePainelFilters({ loja: "SAO11 - CGH" }).loja, "SAO11 - CGH");
  assert.equal(parsePainelFilters({ loja: "São Paulo - Congonhas" }).loja, undefined);
});
