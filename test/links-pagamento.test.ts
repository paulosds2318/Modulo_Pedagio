import test from "node:test";
import assert from "node:assert/strict";
import { lerEventoPagamento, lerReferencia, referenciaDoLink, selecionarPassagens, valorDoLink, valorEmAberto } from "../src/lib/links-pagamento.ts";

const P = [
  { id: 10, valorCentavos: 1000, statusPagamento: "PENDENTE" },
  { id: 11, valorCentavos: 2500, statusPagamento: "PENDENTE" },
  { id: 12, valorCentavos: 700, statusPagamento: "PAGA" },
];

test("sem lista, o link cobre todas as passagens em aberto (padrão)", () => {
  const r = selecionarPassagens(P);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.selecionadas.map((p) => p.id), [10, 11]);
    assert.equal(r.cobreTudo, true);
  }
});

test("com lista, cobre só as escolhidas e recusa passagem paga ou de outro lote", () => {
  const r = selecionarPassagens(P, [11]);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.cobreTudo, false);
  const todas = selecionarPassagens(P, [10, 11, 10]);
  assert.ok(todas.ok && todas.cobreTudo && todas.selecionadas.length === 2);
  assert.ok(!selecionarPassagens(P, [12]).ok);
  assert.ok(!selecionarPassagens(P, [99]).ok);
  assert.ok(!selecionarPassagens(P.map((p) => ({ ...p, statusPagamento: "PAGA" }))).ok);
});

test("a taxa do lote só entra no link que cobre todas as passagens em aberto", () => {
  const parcial = selecionarPassagens(P, [10]);
  const total = selecionarPassagens(P);
  assert.ok(parcial.ok && total.ok);
  if (parcial.ok && total.ok) {
    assert.equal(valorDoLink(parcial.selecionadas, parcial.cobreTudo, 500), 1000);
    assert.equal(valorDoLink(total.selecionadas, total.cobreTudo, 500), 4000);
  }
  assert.equal(valorEmAberto(4700, 1000), 3700);
  assert.equal(valorEmAberto(100, 500), 0);
});

test("referências LINK_<id> e LOTE_<id> (legado)", () => {
  assert.equal(referenciaDoLink(7), "LINK_7");
  assert.deepEqual(lerReferencia("LINK_7"), { tipo: "LINK", id: 7 });
  assert.deepEqual(lerReferencia("LOTE_5_v2"), { tipo: "LOTE", id: 5 });
  assert.equal(lerReferencia("CGH000005-26"), null);
  assert.equal(lerReferencia("LINK_x"), null);
});

test("webhook de pagamento: lê status, valor, data, forma e transação", () => {
  const r = lerEventoPagamento({ reference: "LINK_9", status: "paid", valorCentavos: 5605, paidAt: "2026-11-18T14:00:00Z", paymentMethod: "CREDIT_CARD", transactionId: 123 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.evento.referencia, { tipo: "LINK", id: 9 });
    assert.equal(r.evento.status, "PAGO");
    assert.equal(r.evento.valorCentavos, 5605);
    assert.equal(r.evento.pagoEm.toISOString(), "2026-11-18T14:00:00.000Z");
    assert.equal(r.evento.transacaoId, "123");
  }
  const reais = lerEventoPagamento({ reference: "LINK_9", status: "AUTHORISED", amount: 56.05 });
  assert.ok(reais.ok && reais.evento.valorCentavos === 5605);
  const expirado = lerEventoPagamento({ reference: "LINK_9", status: "EXPIRED" });
  assert.ok(expirado.ok && expirado.evento.status === "EXPIRADO");
  assert.ok(lerEventoPagamento({ reference: "LINK_9", status: "REFUSED" }).ok);
});

test("webhook de pagamento: recusa corpo sem referência ou com status desconhecido", () => {
  assert.ok(!lerEventoPagamento(null).ok);
  assert.ok(!lerEventoPagamento({ status: "PAID" }).ok);
  assert.ok(!lerEventoPagamento({ reference: "LINK_1", status: "TALVEZ" }).ok);
  assert.ok(!lerEventoPagamento({ reference: "XYZ", status: "PAID" }).ok);
});
