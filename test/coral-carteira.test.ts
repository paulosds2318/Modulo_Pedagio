import test from "node:test";
import assert from "node:assert/strict";
import { criptografarPayloadCoral, descriptografarPayloadCoral, interpretarRespostaCobranca } from "../src/lib/services/coral-carteira.ts";

// Gerado com: echo -n '"hello wallet"' | openssl enc -aes-256-cbc -md md5 -S 0102030405060708 -k segredo
const SALT = Buffer.from("0102030405060708", "hex");

test("criptografia no padrão OpenSSL/CryptoJS (Salted__ + salt, EVP MD5)", () => {
  const cifrado = criptografarPayloadCoral("hello wallet", "segredo", SALT);
  const bruto = Buffer.from(cifrado, "base64");
  assert.equal(bruto.subarray(0, 8).toString(), "Salted__");
  assert.deepEqual(bruto.subarray(8, 16), SALT);
  // mesmo texto cifrado que o OpenSSL gera com o mesmo salt e senha
  assert.equal(bruto.subarray(16).toString("base64"), "DCNLZB/TQb3SXjIZi9uXcw==");
  assert.equal(descriptografarPayloadCoral(cifrado, "segredo"), "hello wallet");
});

test("vai e volta com objeto e salt aleatório; senha errada não decifra", () => {
  const payload = { documentNumber: "12345678900", value: 56.05, isWallet: true };
  const a = criptografarPayloadCoral(payload, "chave");
  assert.notEqual(a, criptografarPayloadCoral(payload, "chave"));
  assert.deepEqual(descriptografarPayloadCoral(a, "chave"), payload);
  assert.throws(() => descriptografarPayloadCoral(a, "outra"));
});

test("resposta do débito: aprovado só com Authorised e transactionId numérico", () => {
  assert.deepEqual(interpretarRespostaCobranca(200, { status: "Authorised", transactionId: 123 }), { resultado: "APROVADO", transactionId: "123" });
  assert.deepEqual(interpretarRespostaCobranca(200, { data: { result: "Authorised", transactionId: "456" } }), { resultado: "APROVADO", transactionId: "456" });
  assert.equal(interpretarRespostaCobranca(200, { status: "Authorised" }).resultado, "INCERTO");
  assert.equal(interpretarRespostaCobranca(200, { status: "Authorised", transactionId: "abc" }).resultado, "INCERTO");
});

test("resposta do débito: recusa, erro de validação e resposta incerta", () => {
  const recusado = interpretarRespostaCobranca(200, { refusalReasonCode: "Refused" });
  assert.equal(recusado.resultado, "RECUSADO");
  assert.equal(interpretarRespostaCobranca(400, { message: "ADYEN_DECLINED" }).resultado, "RECUSADO");
  assert.equal(interpretarRespostaCobranca(400, { message: "payload inválido" }).resultado, "ERRO");
  assert.equal(interpretarRespostaCobranca(500, {}).resultado, "INCERTO");
  assert.equal(interpretarRespostaCobranca(200, {}).resultado, "INCERTO");
});
