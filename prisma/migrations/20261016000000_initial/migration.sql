CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "contratos_locacao" (
    "id" SERIAL NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "cpfCliente" TEXT NOT NULL,
    "telefoneCliente" TEXT,
    "placa" TEXT NOT NULL,
    "dataRetirada" TIMESTAMP(3) NOT NULL,
    "dataDevolucao" TIMESTAMP(3) NOT NULL,
    "lojaRetirada" TEXT NOT NULL,
    CONSTRAINT "contratos_locacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "passagens_pedagio" (
    "id" SERIAL NOT NULL,
    "idConectcar" TEXT NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "cpfCliente" TEXT NOT NULL,
    "telefoneCliente" TEXT,
    "placa" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "praca" TEXT NOT NULL,
    "rodovia" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "lojaRetirada" TEXT NOT NULL,
    "loteId" INTEGER,
    CONSTRAINT "passagens_pedagio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lotes_cobranca" (
    "id" SERIAL NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "cpfCliente" TEXT NOT NULL,
    "telefoneCliente" TEXT,
    "quantidadePassagens" INTEGER NOT NULL,
    "valorTotalCentavos" INTEGER NOT NULL,
    "taxaCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorFinalCentavos" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "adyenLinkId" TEXT,
    "adyenPaymentUrl" TEXT,
    "adyenPspReference" TEXT,
    "etapaRegua" TEXT NOT NULL DEFAULT 'D0',
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPagamento" TIMESTAMP(3),
    "d5TentativaAt" TIMESTAMP(3),
    "d7LembreteAt" TIMESTAMP(3),
    "d10TentativaAt" TIMESTAMP(3),
    "processandoAte" TIMESTAMP(3),
    CONSTRAINT "lotes_cobranca_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "logs_regua" (
    "id" SERIAL NOT NULL,
    "loteId" INTEGER NOT NULL,
    "etapa" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "detalhesResposta" TEXT,
    "providerMessageId" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "logs_regua_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contratos_locacao_numeroContrato_key" ON "contratos_locacao"("numeroContrato");
CREATE INDEX "contratos_locacao_placa_dataRetirada_dataDevolucao_idx" ON "contratos_locacao"("placa", "dataRetirada", "dataDevolucao");
CREATE UNIQUE INDEX "passagens_pedagio_idConectcar_key" ON "passagens_pedagio"("idConectcar");
CREATE INDEX "passagens_pedagio_numeroContrato_idx" ON "passagens_pedagio"("numeroContrato");
CREATE INDEX "passagens_pedagio_loteId_idx" ON "passagens_pedagio"("loteId");
CREATE INDEX "lotes_cobranca_numeroContrato_idx" ON "lotes_cobranca"("numeroContrato");
CREATE INDEX "lotes_cobranca_status_idx" ON "lotes_cobranca"("status");
CREATE INDEX "logs_regua_loteId_idx" ON "logs_regua"("loteId");
CREATE INDEX "logs_regua_providerMessageId_idx" ON "logs_regua"("providerMessageId");

ALTER TABLE "passagens_pedagio" ADD CONSTRAINT "passagens_pedagio_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_cobranca"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "logs_regua" ADD CONSTRAINT "logs_regua_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_cobranca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
