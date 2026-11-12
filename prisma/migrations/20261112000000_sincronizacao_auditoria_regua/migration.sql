-- Registro das sincronizações com o Coral (toll-data).
CREATE TABLE "sincronizacoes_coral" (
    "id" SERIAL NOT NULL,
    "origem" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "periodoInicio" TEXT,
    "periodoFim" TEXT,
    "recebidas" INTEGER NOT NULL DEFAULT 0,
    "importadas" INTEGER NOT NULL DEFAULT 0,
    "duplicadas" INTEGER NOT NULL DEFAULT 0,
    "rejeitadas" INTEGER NOT NULL DEFAULT 0,
    "lotesCompilados" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    CONSTRAINT "sincronizacoes_coral_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sincronizacoes_coral_iniciadoEm_idx" ON "sincronizacoes_coral"("iniciadoEm");

-- Auditoria das ações dos usuários.
CREATE TABLE "auditoria_usuarios" (
    "id" SERIAL NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioEmail" TEXT,
    "usuarioNome" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "detalhes" TEXT,
    "ip" TEXT,
    CONSTRAINT "auditoria_usuarios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auditoria_usuarios_dataHora_idx" ON "auditoria_usuarios"("dataHora");
CREATE INDEX "auditoria_usuarios_acao_idx" ON "auditoria_usuarios"("acao");
CREATE INDEX "auditoria_usuarios_usuarioId_idx" ON "auditoria_usuarios"("usuarioId");

-- Prazos da régua (registro único com os valores atuais do sistema).
CREATE TABLE "configuracao_regua" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "diasPrimeiraTentativa" INTEGER NOT NULL DEFAULT 5,
    "diasLembrete" INTEGER NOT NULL DEFAULT 7,
    "diasSegundaTentativa" INTEGER NOT NULL DEFAULT 10,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,
    CONSTRAINT "configuracao_regua_pkey" PRIMARY KEY ("id")
);
INSERT INTO "configuracao_regua" ("id") VALUES (1);
