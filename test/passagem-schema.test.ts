import test from "node:test";
import assert from "node:assert/strict";
import { extractItems, passagemSchema, validarPassagens } from "../src/lib/passagem-schema.ts";

const valida = {
  idCoral: "PASSAGEM-987654321",
  numeroContrato: "LOC-2026-1234",
  cpfCliente: "12345678901",
  telefoneCliente: "5511999999999",
  placa: "ABC1D23",
  tag: "TAG-445566",
  praca: "Praça Exemplo",
  rodovia: "SP-348",
  dataHora: "2026-10-21T14:35:00-03:00",
  valorCentavos: 1290,
  lojaRetirada: "São Paulo - Centro",
};

test("aceita o exemplo da especificação e preserva o idCoral", () => {
  const r = passagemSchema.safeParse(valida);
  assert.ok(r.success);
  if (!r.success) return;
  assert.equal(r.data.idCoral, "PASSAGEM-987654321");
  assert.equal(r.data.dataHora.toISOString(), "2026-10-21T17:35:00.000Z");
  assert.equal(passagemSchema.safeParse({ ...valida, telefoneCliente: undefined }).success, true);
  assert.equal(passagemSchema.safeParse({ ...valida, dataHora: "2026-10-21T17:35:00Z" }).success, true);
});

test("exige todos os campos obrigatórios", () => {
  for (const campo of ["idCoral", "numeroContrato", "cpfCliente", "placa", "tag", "praca", "rodovia", "dataHora", "valorCentavos", "lojaRetirada"]) {
    const semCampo: Record<string, unknown> = { ...valida };
    delete semCampo[campo];
    assert.equal(passagemSchema.safeParse(semCampo).success, false, campo);
  }
});

test("rejeita formatos fora da especificação", () => {
  assert.equal(passagemSchema.safeParse({ ...valida, dataHora: "2026-10-21T14:35:00" }).success, false, "sem fuso");
  assert.equal(passagemSchema.safeParse({ ...valida, valorCentavos: 12.9 }).success, false, "não inteiro");
  assert.equal(passagemSchema.safeParse({ ...valida, valorCentavos: "1290" }).success, false, "texto");
  assert.equal(passagemSchema.safeParse({ ...valida, cpfCliente: "123.456.789-01" }).success, false, "CPF com pontuação");
});

test("valida registro a registro e extrai envelopes", () => {
  const { validas, rejeitadas } = validarPassagens([valida, { ...valida, idCoral: "X", valorCentavos: 1.5 }]);
  assert.equal(validas.length, 1);
  assert.equal(rejeitadas[0].idCoral, "X");
  assert.match(rejeitadas[0].motivo, /valorCentavos/);
  assert.deepEqual(extractItems({ data: [valida] }), [valida]);
  assert.deepEqual(extractItems({ data: { content: [valida] } }), [valida]);
  assert.equal(extractItems({ data: { message: "Endpoint is not configured." } }), null);
});
