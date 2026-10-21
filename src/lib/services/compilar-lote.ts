import { db } from "@/lib/db";
import { processIntegrationOutbox } from "@/lib/services/outbox";

export async function compilarLote(passagemIds: number[], taxaCentavos = 0) {
  const lot = await db.$transaction(async (tx) => {
    const passages = await tx.passagemPedagio.findMany({ where: { id: { in: passagemIds } } });
    if (passages.length !== passagemIds.length) throw new Error("NOT_FOUND");
    if (passages.some((p) => p.loteId !== null)) throw new Error("ALREADY_BILLED");
    if (new Set(passages.map((p) => p.numeroContrato)).size !== 1 || new Set(passages.map((p) => p.cpfCliente)).size !== 1) {
      throw new Error("MIXED_CONTRACTS");
    }

    const totalTolls = passages.reduce((sum, p) => sum + p.valorCentavos, 0);
    const finalAmount = totalTolls + taxaCentavos;
    if (finalAmount <= 0) throw new Error("INVALID_AMOUNT");
    if (finalAmount > 50_000_000) throw new Error("AMOUNT_EXCEEDED");

    const newLot = await tx.loteCobranca.create({
      data: {
        numeroContrato: passages[0].numeroContrato,
        cpfCliente: passages[0].cpfCliente,
        telefoneCliente: passages[0].telefoneCliente,
        quantidadePassagens: passages.length,
        valorTotalCentavos: totalTolls,
        taxaCentavos,
        valorFinalCentavos: finalAmount,
        status: "EM_REGUA",
        etapaRegua: "D0",
      },
    });

    await tx.integrationOutbox.createMany({
      data: [{ loteId: newLot.id, tipo: "ADYEN_LINK_D0" }, { loteId: newLot.id, tipo: "WHATSAPP_D0" }],
    });
    const linked = await tx.passagemPedagio.updateMany({
      where: { id: { in: passagemIds }, loteId: null },
      data: { loteId: newLot.id },
    });
    if (linked.count !== passages.length) throw new Error("RACE_CONDITION");
    return newLot;
  });

  try { await processIntegrationOutbox(new Date(), lot.id); }
  catch { /* A outbox mantém as tarefas para nova tentativa pelo cron. */ }
  return db.loteCobranca.findUniqueOrThrow({ where: { id: lot.id } });
}
