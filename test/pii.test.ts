import test from "node:test";
import assert from "node:assert/strict";
import { formatCpf, formatPhone, maskCpf, maskName, maskPhone } from "../src/lib/pii.ts";

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

test("formata telefone para exibição, inclusive no formato do Coral", () => {
  assert.equal(formatPhone("05581987385401"), "+55 (81) 98738-5401");
  assert.equal(formatPhone("5581987385401"), "+55 (81) 98738-5401");
  assert.equal(formatPhone("(11) 3456-7890"), "+55 (11) 3456-7890");
  assert.equal(formatPhone("***01"), "***01");
  assert.equal(formatPhone(null), null);
});

test("formata o CPF completo para exibição", () => {
  assert.equal(formatCpf("11374337447"), "113.743.374-47");
  assert.equal(formatCpf("113.743.374-47"), "113.743.374-47");
  assert.equal(formatCpf("123"), "123");
  assert.equal(formatCpf(null), null);
});
