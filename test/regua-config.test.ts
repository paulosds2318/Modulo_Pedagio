import test from "node:test";
import assert from "node:assert/strict";
import { PRAZOS_PADRAO, rotuloEtapa, validarPrazos } from "../src/lib/regua-config.ts";

test("aceita prazos crescentes e converte texto em número", () => {
  const r = validarPrazos({ diasPrimeiraTentativa: "6", diasLembrete: 8, diasSegundaTentativa: "12" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.prazos, { diasPrimeiraTentativa: 6, diasLembrete: 8, diasSegundaTentativa: 12 });
  assert.equal(validarPrazos(PRAZOS_PADRAO).ok, true);
});

test("recusa prazos fora de ordem, não inteiros ou fora do limite", () => {
  const fora = validarPrazos({ diasPrimeiraTentativa: 7, diasLembrete: 7, diasSegundaTentativa: 10 });
  assert.ok(!fora.ok && fora.erro.includes("crescentes"));
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 0, diasLembrete: 7, diasSegundaTentativa: 10 }).ok, false);
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 5.5, diasLembrete: 7, diasSegundaTentativa: 10 }).ok, false);
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 5, diasLembrete: 7, diasSegundaTentativa: 61 }).ok, false);
  assert.equal(validarPrazos({}).ok, false);
});

test("rótulo da etapa acompanha os dias configurados", () => {
  assert.equal(rotuloEtapa("D5"), "D+5");
  assert.equal(rotuloEtapa("D5", { diasPrimeiraTentativa: 6, diasLembrete: 9, diasSegundaTentativa: 14 }), "D+6");
  assert.equal(rotuloEtapa("D10", { diasPrimeiraTentativa: 6, diasLembrete: 9, diasSegundaTentativa: 14 }), "D+14");
  assert.equal(rotuloEtapa("D0"), "D+0");
  assert.equal(rotuloEtapa("OUTRA"), "OUTRA");
});
