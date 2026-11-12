import test from "node:test";
import assert from "node:assert/strict";
import { reaisParaCentavos, validarBaixaManual } from "../src/lib/baixa-manual.ts";

const NOW = new Date("2026-11-13T15:00:00Z"); // 12:00 em Brasília
const lote = { valorFinalCentavos: 1321, dataCriacao: new Date("2026-11-05T13:00:00Z") };
const valida = { forma: "PIX", dataPagamento: "2026-11-10", valorRecebidoCentavos: 1321, observacao: "PIX comprovante E123" };

test("aceita baixa válida e grava a data ao meio-dia de Brasília", () => {
  const r = validarBaixaManual(valida, lote, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.baixa.dataPagamento.toISOString(), "2026-11-10T15:00:00.000Z");
  assert.equal(r.divergenteCentavos, 0);
  const desconto = validarBaixaManual({ ...valida, forma: "NEGOCIACAO", valorRecebidoCentavos: 1000 }, lote, NOW);
  assert.ok(desconto.ok && desconto.divergenteCentavos === -321);
});

test("recusa forma, data, valor e observação inválidos", () => {
  assert.equal(validarBaixaManual({ ...valida, forma: "CARTAO" }, lote, NOW).ok, false, "forma automática não é manual");
  assert.equal(validarBaixaManual({ ...valida, dataPagamento: "2026-11-14" }, lote, NOW).ok, false, "futuro");
  assert.equal(validarBaixaManual({ ...valida, dataPagamento: "2026-11-04" }, lote, NOW).ok, false, "antes da emissão");
  assert.equal(validarBaixaManual({ ...valida, dataPagamento: "10/11/2026" }, lote, NOW).ok, false, "formato");
  assert.equal(validarBaixaManual({ ...valida, valorRecebidoCentavos: 0 }, lote, NOW).ok, false, "zero");
  assert.equal(validarBaixaManual({ ...valida, valorRecebidoCentavos: 13.5 }, lote, NOW).ok, false, "não inteiro");
  assert.equal(validarBaixaManual({ ...valida, observacao: "ok" }, lote, NOW).ok, false, "observação curta");
  assert.equal(validarBaixaManual({ ...valida, dataPagamento: "2026-11-13" }, lote, NOW).ok, true, "hoje vale");
});

test("converte reais digitados em centavos", () => {
  assert.equal(reaisParaCentavos("13,21"), 1321);
  assert.equal(reaisParaCentavos("1.234,56"), 123456);
  assert.equal(reaisParaCentavos("R$ 10"), 1000);
  assert.equal(reaisParaCentavos("10,5"), 1050);
  assert.equal(reaisParaCentavos("abc"), null);
  assert.equal(reaisParaCentavos("1,234"), null);
});
