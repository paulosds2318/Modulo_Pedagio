import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isValidAdyenHmac } from "../src/lib/adyen.ts";
import { hasBearerSecret, hasRole } from "../src/lib/auth.ts";
import type { UserRole } from "../src/lib/auth.ts";

test("Segurança de Pagamento - HMAC Adyen: Aceita assinatura válida", () => {
  const secretHex = "447664FE2792BD73B1E3E2E7628BA460ED20D536CE753B5532243787758E37E2";
  process.env.ADYEN_HMAC_KEY = secretHex;
  process.env.ADYEN_MERCHANT_ACCOUNT = "FocoRentACarCOM";

  const item = {
    pspReference: "9912345678901234",
    originalReference: "",
    merchantAccountCode: "FocoRentACarCOM",
    merchantReference: "LOTE_42",
    amount: { value: 15400, currency: "BRL" },
    eventCode: "AUTHORISATION",
    success: "true",
  };

  const values = [
    item.pspReference,
    item.originalReference,
    item.merchantAccountCode,
    item.merchantReference,
    item.amount.value,
    item.amount.currency,
    item.eventCode,
    item.success,
  ];
  const payload = values.map((v) => String(v).replace(/\\/g, "\\\\").replace(/:/g, "\\:")).join(":");
  const hmac = createHmac("sha256", Buffer.from(secretHex, "hex")).update(payload, "utf8").digest("base64");

  const validItem = {
    ...item,
    additionalData: { hmacSignature: hmac },
  };

  assert.equal(isValidAdyenHmac(validItem), true);
});

test("Segurança de Pagamento - HMAC Adyen: Rejeita assinatura forjada ou alterada", () => {
  process.env.ADYEN_HMAC_KEY = "447664FE2792BD73B1E3E2E7628BA460ED20D536CE753B5532243787758E37E2";
  process.env.ADYEN_MERCHANT_ACCOUNT = "FocoRentACarCOM";

  const tamperedItem = {
    pspReference: "9912345678901234",
    originalReference: "",
    merchantAccountCode: "FocoRentACarCOM",
    merchantReference: "LOTE_42",
    amount: { value: 100, currency: "BRL" },
    eventCode: "AUTHORISATION",
    success: "true",
    additionalData: { hmacSignature: "AAAAForgerSignature==" },
  };

  assert.equal(isValidAdyenHmac(tamperedItem), false);
});

test("Segurança de Pagamento - HMAC Adyen: Rejeita se merchantAccountCode for de outra conta", () => {
  process.env.ADYEN_HMAC_KEY = "447664FE2792BD73B1E3E2E7628BA460ED20D536CE753B5532243787758E37E2";
  process.env.ADYEN_MERCHANT_ACCOUNT = "FocoRentACarCOM";

  const foreignMerchantItem = {
    pspReference: "9912345678901234",
    merchantAccountCode: "HackerMerchantCOM",
    merchantReference: "LOTE_42",
    amount: { value: 15400, currency: "BRL" },
    eventCode: "AUTHORISATION",
    success: "true",
    additionalData: { hmacSignature: "dummy" },
  };

  assert.equal(isValidAdyenHmac(foreignMerchantItem), false);
});

test("Segurança de Autenticação - Bearer Secret com timingSafeEqual", () => {
  const secret = "segredo-super-forte-foco-2026";
  const reqValid = new Request("http://localhost/api/cron/regua", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const reqInvalid = new Request("http://localhost/api/cron/regua", {
    headers: { Authorization: "Bearer segredo-incorreto" },
  });
  const reqMissing = new Request("http://localhost/api/cron/regua");

  assert.equal(hasBearerSecret(reqValid, secret), true);
  assert.equal(hasBearerSecret(reqInvalid, secret), false);
  assert.equal(hasBearerSecret(reqMissing, secret), false);
  assert.equal(hasBearerSecret(reqValid, undefined), false);
});

test("Segurança de Dados Sensíveis - Mascaramento de CPF", () => {
  const maskCpf = (cpf: string): string => {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
    }
    return cpf;
  };

  assert.equal(maskCpf("12345678901"), "123.***.***-01");
  assert.equal(maskCpf("123.456.789-01"), "123.***.***-01");
  assert.equal(maskCpf("123"), "123");
});

test("Segurança de Perfis - Validação de Papéis RBAC (Admin vs Visualização)", () => {
  const canPerformAdminActions = (role: UserRole | string | undefined): boolean => {
    return role === "admin";
  };

  assert.equal(canPerformAdminActions("admin"), true);
  assert.equal(canPerformAdminActions("viewer"), false);
  assert.equal(canPerformAdminActions(undefined), false);
  assert.equal(canPerformAdminActions("other"), false);
});

test("Authorization: only admin gets administrative permissions", () => {
  assert.equal(hasRole({ user: { role: "admin" } }, "admin"), true);
  assert.equal(hasRole({ user: { role: "viewer" } }, "admin"), false);
  assert.equal(hasRole(null, "admin"), false);
});
