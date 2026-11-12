-- Nova régua (D+0, D+2, D+5, D+7) com links de 48 horas.
ALTER TABLE "lotes_cobranca" ADD COLUMN "linkExpiraEm" TIMESTAMP(3);
ALTER TABLE "configuracao_regua" ADD COLUMN "validadeLinkHoras" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "configuracao_regua" ALTER COLUMN "diasPrimeiraTentativa" SET DEFAULT 2;
ALTER TABLE "configuracao_regua" ALTER COLUMN "diasLembrete" SET DEFAULT 5;
ALTER TABLE "configuracao_regua" ALTER COLUMN "diasSegundaTentativa" SET DEFAULT 7;
-- Quem ainda usa os prazos antigos (5, 7, 10) passa para os novos (2, 5, 7); prazos personalizados são mantidos.
UPDATE "configuracao_regua" SET "diasPrimeiraTentativa" = 2, "diasLembrete" = 5, "diasSegundaTentativa" = 7
 WHERE "diasPrimeiraTentativa" = 5 AND "diasLembrete" = 7 AND "diasSegundaTentativa" = 10;
-- Lotes que já têm link: vencimento estimado em 48 h a partir da emissão.
UPDATE "lotes_cobranca" SET "linkExpiraEm" = "dataCriacao" + INTERVAL '48 hours'
 WHERE "adyenPaymentUrl" IS NOT NULL AND "linkExpiraEm" IS NULL;
