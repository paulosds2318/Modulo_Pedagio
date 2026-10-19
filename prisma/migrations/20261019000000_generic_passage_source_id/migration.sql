ALTER TABLE "passagens_pedagio" RENAME COLUMN "idConectcar" TO "idOrigem";
ALTER INDEX "passagens_pedagio_idConectcar_key" RENAME TO "passagens_pedagio_idOrigem_key";
