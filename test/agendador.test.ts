import test from "node:test";
import assert from "node:assert/strict";
import { agendadorLigado, intervaloAgendadorMin } from "../src/lib/agendador.ts";

test("agendador só liga com AGENDADOR_INTERNO=true", () => {
  delete process.env.AGENDADOR_INTERNO;
  assert.equal(agendadorLigado(), false);
  process.env.AGENDADOR_INTERNO = "TRUE";
  assert.equal(agendadorLigado(), true);
  process.env.AGENDADOR_INTERNO = "sim";
  assert.equal(agendadorLigado(), false);
});

test("intervalo padrão de 60 min e mínimo de 5 min", () => {
  delete process.env.AGENDADOR_INTERVALO_MIN;
  assert.equal(intervaloAgendadorMin(), 60);
  process.env.AGENDADOR_INTERVALO_MIN = "15";
  assert.equal(intervaloAgendadorMin(), 15);
  process.env.AGENDADOR_INTERVALO_MIN = "1";
  assert.equal(intervaloAgendadorMin(), 60);
  process.env.AGENDADOR_INTERVALO_MIN = "abc";
  assert.equal(intervaloAgendadorMin(), 60);
});
