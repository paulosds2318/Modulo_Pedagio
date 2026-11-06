import test from "node:test";
import assert from "node:assert/strict";
import { maskCpf, maskName, maskPhone } from "../src/lib/pii.ts";

test("mascara CPF e telefone sem alterar os valores ausentes", () => {
  assert.equal(maskCpf("123.456.789-01"), "123.***.***-01");
  assert.equal(maskCpf("invalido"), "***");
  assert.equal(maskPhone("+55 (11) 98765-4321"), "***21");
  assert.equal(maskPhone(null), null);
});

test("abrevia o nome para perfis de visualização", () => {
  assert.equal(maskName("KELLY CRISTINA DA SILVA SANTOS"), "Kelly S.");
  assert.equal(maskName("  paulo  "), "Paulo");
  assert.equal(maskName(null), null);
  assert.equal(maskName(""), "");
});
