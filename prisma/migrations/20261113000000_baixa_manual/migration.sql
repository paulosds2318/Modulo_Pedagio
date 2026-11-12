-- Baixa manual e forma de pagamento do lote.
ALTER TABLE "lotes_cobranca" ADD COLUMN "formaPagamento" TEXT;
ALTER TABLE "lotes_cobranca" ADD COLUMN "valorRecebidoCentavos" INTEGER;
ALTER TABLE "lotes_cobranca" ADD COLUMN "baixaManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lotes_cobranca" ADD COLUMN "baixaObservacao" TEXT;
ALTER TABLE "lotes_cobranca" ADD COLUMN "baixaPor" TEXT;
