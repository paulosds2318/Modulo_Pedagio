-- Cancelamento de lote (motivo, observação, quem e quando).
ALTER TABLE "lotes_cobranca" ADD COLUMN "canceladoEm" TIMESTAMP(3);
ALTER TABLE "lotes_cobranca" ADD COLUMN "cancelamentoMotivo" TEXT;
ALTER TABLE "lotes_cobranca" ADD COLUMN "cancelamentoObservacao" TEXT;
ALTER TABLE "lotes_cobranca" ADD COLUMN "canceladoPor" TEXT;
