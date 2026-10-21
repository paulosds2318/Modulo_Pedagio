CREATE TABLE "integration_outbox" (
    "id" SERIAL NOT NULL,
    "loteId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processandoAte" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_outbox_loteId_tipo_key" ON "integration_outbox"("loteId", "tipo");
CREATE INDEX "integration_outbox_status_proximaTentativaAt_idx" ON "integration_outbox"("status", "proximaTentativaAt");
ALTER TABLE "integration_outbox" ADD CONSTRAINT "integration_outbox_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_cobranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
