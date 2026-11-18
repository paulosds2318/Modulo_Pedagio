-- AlterTable
ALTER TABLE "lotes_cobranca" ADD COLUMN     "emailCliente" TEXT,
ADD COLUMN     "valorPagoCentavos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "passagens_pedagio" ADD COLUMN     "linkPagoId" INTEGER,
ADD COLUMN     "pagoEm" TIMESTAMP(3),
ADD COLUMN     "statusPagamento" TEXT NOT NULL DEFAULT 'PENDENTE';

-- CreateTable
CREATE TABLE "links_pagamento" (
    "id" SERIAL NOT NULL,
    "loteId" INTEGER NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "linkIdExterno" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "origem" TEXT NOT NULL,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "transacaoId" TEXT,
    "formaPagamento" TEXT,

    CONSTRAINT "links_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "links_pagamento_passagens" (
    "linkId" INTEGER NOT NULL,
    "passagemId" INTEGER NOT NULL,

    CONSTRAINT "links_pagamento_passagens_pkey" PRIMARY KEY ("linkId","passagemId")
);

-- CreateIndex
CREATE INDEX "links_pagamento_loteId_idx" ON "links_pagamento"("loteId");

-- AddForeignKey
ALTER TABLE "links_pagamento" ADD CONSTRAINT "links_pagamento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_cobranca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links_pagamento_passagens" ADD CONSTRAINT "links_pagamento_passagens_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "links_pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links_pagamento_passagens" ADD CONSTRAINT "links_pagamento_passagens_passagemId_fkey" FOREIGN KEY ("passagemId") REFERENCES "passagens_pedagio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
