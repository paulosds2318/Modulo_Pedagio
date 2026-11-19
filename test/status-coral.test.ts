import test from "node:test";
import assert from "node:assert/strict";
import { etapaInterna, lerRespostaStatus, reguaExecutadaPeloCoral } from "../src/lib/status-coral.ts";

test("quem executa a régua: módulo por padrão, Coral só com REGUA_EXECUTOR=coral", () => {
  assert.equal(reguaExecutadaPeloCoral(undefined), false);
  assert.equal(reguaExecutadaPeloCoral("modulo"), false);
  assert.equal(reguaExecutadaPeloCoral(""), false);
  assert.equal(reguaExecutadaPeloCoral("coral"), true);
  assert.equal(reguaExecutadaPeloCoral(" Coral "), true);
});

test("etapas do Coral (D+N) para as chaves internas do módulo", () => {
  assert.equal(etapaInterna("D+0"), "D0");
  assert.equal(etapaInterna("D+2"), "D5");
  assert.equal(etapaInterna("D+5"), "D7");
  assert.equal(etapaInterna("D+7"), "D10");
  assert.equal(etapaInterna(" d+2 "), "D5");
  assert.equal(etapaInterna("D+9"), null);
  assert.equal(etapaInterna(null), null);
});

test("lê o pagamento: referência, status, valor, data, forma e transação", () => {
  const itens = lerRespostaStatus({
    data: [
      { reference: "LINK_7", status: "paid", valorCentavos: 5605, paidAt: "2026-11-19T12:00:00Z", paymentMethod: "CREDIT_CARD", transactionId: 99, updatedAt: "2026-11-19T12:01:00Z" },
      { reference: "LOTE_5_v2", status: "EXPIRED" },
      { reference: "LINK_8", status: "qualquer coisa", amount: 12.5 },
    ],
  });
  assert.equal(itens.length, 3);
  assert.deepEqual(itens[0].referencia, { tipo: "LINK", id: 7 });
  assert.equal(itens[0].status, "PAGO");
  assert.equal(itens[0].valorCentavos, 5605);
  assert.equal(itens[0].pagoEm?.toISOString(), "2026-11-19T12:00:00.000Z");
  assert.equal(itens[0].transacaoId, "99");
  assert.deepEqual(itens[1].referencia, { tipo: "LOTE", id: 5 });
  assert.equal(itens[1].status, "EXPIRADO");
  assert.equal(itens[2].status, "AGUARDANDO");
  assert.equal(itens[2].valorCentavos, 1250);
});

test("aceita os formatos { data: [...] }, { data: { data: [...] } } e lista direta; ignora referência desconhecida", () => {
  const um = { reference: "LINK_1", status: "PAID" };
  assert.equal(lerRespostaStatus([um]).length, 1);
  assert.equal(lerRespostaStatus({ data: [um] }).length, 1);
  assert.equal(lerRespostaStatus({ data: { total: 1, data: [um] } }).length, 1);
  assert.equal(lerRespostaStatus({ data: [{ reference: "CGH000005-26", status: "PAID" }, { status: "PAID" }] }).length, 0);
  assert.deepEqual(lerRespostaStatus(null), []);
  assert.deepEqual(lerRespostaStatus("texto"), []);
});

test("lê a situação da régua: etapa, comunicações, débito, próxima etapa e encerramento", () => {
  const [item] = lerRespostaStatus({
    data: [
      {
        reference: "LINK_3",
        status: "EXPIRED",
        regua: {
          etapa: "D+2",
          proximaEtapa: "D+5",
          proximaEm: "2026-11-22T12:00:00Z",
          comunicacoes: [
            { etapa: "D+0", template: 1, canal: "WhatsApp", enviadoEm: "2026-11-19T12:00:00Z", entrega: "DELIVERED" },
            { etapa: "D+2", template: "3", canal: "E-mail", enviadoEm: "invalida", entrega: "SENT" },
          ],
          debito: { resultado: "REFUSED", em: "2026-11-21T12:00:00Z" },
        },
      },
    ],
  });
  assert.ok(item.regua);
  assert.equal(item.regua.etapa, "D5");
  assert.equal(item.regua.etapaTexto, "D+2");
  assert.equal(item.regua.comunicacoes.length, 2);
  assert.equal(item.regua.comunicacoes[1].template, 3);
  assert.equal(item.regua.comunicacoes[1].enviadoEm, null);
  assert.equal(item.regua.debito?.resultado, "REFUSED");
  assert.equal(item.regua.encerradaMotivo, null);

  const [fim] = lerRespostaStatus({ data: [{ reference: "LINK_4", status: "EXPIRED", regua: { etapa: "D+7", encerradaMotivo: "extrajudicial" } }] });
  assert.equal(fim.regua?.encerradaMotivo, "EXTRAJUDICIAL");
  assert.equal(fim.regua?.etapa, "D10");
  const [semRegua] = lerRespostaStatus({ data: [{ reference: "LINK_5", status: "PAID" }] });
  assert.equal(semRegua.regua, null);
});
