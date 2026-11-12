import test from "node:test";
import assert from "node:assert/strict";
import { PRAZOS_PADRAO, linkVencido, rotuloEtapa, validarPrazos, vencimentoLink } from "../src/lib/regua-config.ts";
import { textoProvisorio } from "../src/lib/templates-cobranca.ts";

test("padrão da régua: D+2, D+5, D+7 e link de 48 h", () => {
  assert.deepEqual(PRAZOS_PADRAO, { diasPrimeiraTentativa: 2, diasLembrete: 5, diasSegundaTentativa: 7, validadeLinkHoras: 48 });
  assert.equal(rotuloEtapa("D0"), "D+0");
  assert.equal(rotuloEtapa("D5"), "D+2");
  assert.equal(rotuloEtapa("D7"), "D+5");
  assert.equal(rotuloEtapa("D10"), "D+7");
  assert.equal(rotuloEtapa("OUTRA"), "OUTRA");
});

test("aceita prazos crescentes, converte texto e usa 48 h quando a validade não é informada", () => {
  const r = validarPrazos({ diasPrimeiraTentativa: "3", diasLembrete: 6, diasSegundaTentativa: "9", validadeLinkHoras: "72" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.prazos, { diasPrimeiraTentativa: 3, diasLembrete: 6, diasSegundaTentativa: 9, validadeLinkHoras: 72 });
  const semValidade = validarPrazos({ diasPrimeiraTentativa: 2, diasLembrete: 5, diasSegundaTentativa: 7 });
  assert.ok(semValidade.ok && semValidade.prazos.validadeLinkHoras === 48);
});

test("recusa prazos fora de ordem, não inteiros, fora do limite e validade inválida", () => {
  const fora = validarPrazos({ diasPrimeiraTentativa: 5, diasLembrete: 5, diasSegundaTentativa: 7 });
  assert.ok(!fora.ok && fora.erro.includes("crescentes"));
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 0, diasLembrete: 5, diasSegundaTentativa: 7 }).ok, false);
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 2.5, diasLembrete: 5, diasSegundaTentativa: 7 }).ok, false);
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 2, diasLembrete: 5, diasSegundaTentativa: 61 }).ok, false);
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 2, diasLembrete: 5, diasSegundaTentativa: 7, validadeLinkHoras: 0 }).ok, false);
  assert.equal(validarPrazos({ diasPrimeiraTentativa: 2, diasLembrete: 5, diasSegundaTentativa: 7, validadeLinkHoras: 200 }).ok, false);
  assert.equal(validarPrazos({}).ok, false);
});

test("vencimento do link: só debita depois que o link vence", () => {
  const emissao = new Date("2026-11-10T12:00:00Z");
  assert.equal(vencimentoLink(emissao, 48).toISOString(), "2026-11-12T12:00:00.000Z");
  const lote = { adyenPaymentUrl: "https://x", linkExpiraEm: new Date("2026-11-12T12:00:00Z"), dataCriacao: emissao };
  assert.equal(linkVencido(lote, 48, new Date("2026-11-12T11:59:00Z")), false);
  assert.equal(linkVencido(lote, 48, new Date("2026-11-12T12:00:00Z")), true);
  // lote antigo sem data gravada: estima pela emissão
  assert.equal(linkVencido({ ...lote, linkExpiraEm: null }, 48, new Date("2026-11-11T12:00:00Z")), false);
  assert.equal(linkVencido({ ...lote, linkExpiraEm: null }, 48, new Date("2026-11-13T12:00:00Z")), true);
  // sem link: nada a esperar
  assert.equal(linkVencido({ ...lote, adyenPaymentUrl: null }, 48, emissao), true);
});

test("textos provisórios dos templates trazem os dados da cobrança", () => {
  const d = { nomeCliente: "MARIA SILVA", numeroContrato: "CGH1", valorCentavos: 1321, link: "https://link", prazo: new Date("2026-11-12T15:00:00Z") };
  const inicial = textoProvisorio("COBRANCA_INICIAL", d);
  assert.match(inicial, /MARIA/);
  assert.match(inicial, /CGH1/);
  assert.match(inicial, /13,21/);
  assert.match(inicial, /https:\/\/link/);
  assert.match(inicial, /12\/11\/2026/);
  assert.doesNotMatch(textoProvisorio("AVISO_DEBITO", d), /https:\/\/link/);
  assert.match(textoProvisorio("COBRANCA_EXTRAJUDICIAL", d), /extrajudicial/);
});
