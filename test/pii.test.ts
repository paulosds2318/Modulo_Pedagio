import test from "node:test";
import assert from "node:assert/strict";
import { maskCpf, maskPhone } from "../src/lib/pii.ts";

test("mascara CPF e telefone sem alterar os valores ausentes", () => {
  assert.equal(maskCpf("123.456.789-01"), "123.***.***-01");
  assert.equal(maskCpf("invalido"), "***");
  assert.equal(maskPhone("+55 (11) 98765-4321"), "***21");
  assert.equal(maskPhone(null), null);
});
