ALTER TABLE "passagens_pedagio" RENAME COLUMN "idOrigem" TO "idCoral";
ALTER INDEX "passagens_pedagio_idOrigem_key" RENAME TO "passagens_pedagio_idCoral_key";
