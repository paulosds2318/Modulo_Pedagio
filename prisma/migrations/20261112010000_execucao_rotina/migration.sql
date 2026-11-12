-- Histórico das execuções da rotina automática.
CREATE TABLE "execucoes_rotina" (
    "id" SERIAL NOT NULL,
    "origem" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "resumo" TEXT,
    "erro" TEXT,
    CONSTRAINT "execucoes_rotina_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "execucoes_rotina_iniciadoEm_idx" ON "execucoes_rotina"("iniciadoEm");

-- Trava da rotina (registro único).
CREATE TABLE "rotina_trava" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ocupadaAte" TIMESTAMP(3),
    CONSTRAINT "rotina_trava_pkey" PRIMARY KEY ("id")
);
INSERT INTO "rotina_trava" ("id") VALUES (1);
