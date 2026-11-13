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

import { resolverBaseCoral, verificarAmbienteDoLink } from "../src/lib/services/coral-pay-by-link.ts";

test("fora de produção só aceita link de teste (checkout de homologação ou test.adyen.link)", () => {
  assert.equal(verificarAmbienteDoLink("https://homologcheckout.aluguefoco.com.br/pay/abc", "test"), null);
  assert.equal(verificarAmbienteDoLink("https://test.adyen.link/PLABC123", undefined), null);
  assert.match(verificarAmbienteDoLink("https://pay.adyen.link/PLABC123", "test") ?? "", /não é de teste/);
  assert.match(verificarAmbienteDoLink("https://checkout.aluguefoco.com.br/pay/abc", undefined) ?? "", /não é de teste/);
  assert.equal(verificarAmbienteDoLink("https://pay.adyen.link/PLABC123", "live"), null);
  assert.equal(verificarAmbienteDoLink("https://checkout.aluguefoco.com.br/pay/abc", "live"), null);
  assert.ok(verificarAmbienteDoLink("não é url", "test"));
});

test("base do Coral: homologação por padrão, produção só com ADYEN_ENVIRONMENT=live", () => {
  assert.equal(resolverBaseCoral(undefined, undefined), "https://homologservicescoral.aluguefoco.com.br");
  assert.equal(resolverBaseCoral("https://homologservicescoral.aluguefoco.com.br/", "test"), "https://homologservicescoral.aluguefoco.com.br");
  assert.equal(resolverBaseCoral(undefined, "live"), "https://servicescoral.aluguefoco.com.br");
  assert.equal(resolverBaseCoral("https://servicescoral.aluguefoco.com.br", "live"), "https://servicescoral.aluguefoco.com.br");
  assert.throws(() => resolverBaseCoral("https://servicescoral.aluguefoco.com.br", "test"), /produção/);
  assert.throws(() => resolverBaseCoral("https://servicescoral.aluguefoco.com.br", undefined), /produção/);
});
