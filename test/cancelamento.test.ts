import test from "node:test";
import assert from "node:assert/strict";
import { STATUS_PERMITEM_CANCELAMENTO, validarCancelamento } from "../src/lib/cancelamento.ts";

test("aceita motivo conhecido com observação", () => {
  const r = validarCancelamento({ motivo: "CONTESTACAO", observacao: "  Cliente provou que não passou  " });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.observacao, "Cliente provou que não passou");
});

test("recusa motivo desconhecido e observação curta ou longa", () => {
  assert.equal(validarCancelamento({ motivo: "QUALQUER", observacao: "texto válido" }).ok, false);
  assert.equal(validarCancelamento({ motivo: "OUTRO", observacao: "ok" }).ok, false);
  assert.equal(validarCancelamento({ motivo: "OUTRO", observacao: "x".repeat(501) }).ok, false);
  assert.equal(validarCancelamento({}).ok, false);
});

test("lote pago ou já cancelado não pode ser cancelado", () => {
  assert.deepEqual(STATUS_PERMITEM_CANCELAMENTO, ["EM_REGUA", "INADIMPLENTE"]);
});
