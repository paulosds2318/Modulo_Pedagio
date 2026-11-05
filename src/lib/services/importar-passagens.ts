import { db } from "@/lib/db";
import type { Passagem } from "@/lib/passagem-schema";
import { compilarLote } from "@/lib/services/compilar-lote";

export type PassagemImportacao = Passagem;

const compilationErrorMessages: Record<string, string> = {
  INVALID_AMOUNT: "O valor total do grupo precisa ser maior que zero.",
  AMOUNT_EXCEEDED: "O grupo excede o limite de R$ 500.000,00 por lote.",
  ALREADY_BILLED: "Uma ou mais passagens já foram vinculadas a outro lote.",
  RACE_CONDITION: "As passagens foram alteradas por outra operação durante a compilação.",
};

/**
 * Grava passagens (idempotente por idCoral) e compila automaticamente as pendentes deste envio,
 * agrupadas por contrato e CPF. Grupos que falham permanecem pendentes para compilação manual.
 */
export async function importarECompilarPassagens(passagens: PassagemImportacao[]) {
  const result = passagens.length
    ? await db.passagemPedagio.createMany({ data: passagens, skipDuplicates: true })
    : { count: 0 };

  const pendentes = passagens.length
    ? await db.passagemPedagio.findMany({
        where: { idCoral: { in: passagens.map((p) => p.idCoral) }, loteId: null },
        select: { id: true, numeroContrato: true, cpfCliente: true },
      })
    : [];

  const grupos = new Map<string, { numeroContrato: string; passagemIds: number[] }>();
  for (const passagem of pendentes) {
    const chave = JSON.stringify([passagem.numeroContrato, passagem.cpfCliente]);
    const grupo = grupos.get(chave) ?? { numeroContrato: passagem.numeroContrato, passagemIds: [] };
    grupo.passagemIds.push(passagem.id);
    grupos.set(chave, grupo);
  }

  const idsLotesCompilados: number[] = [];
  const falhasCompilacao: Array<{ contrato: string; mensagem: string }> = [];
  let passagensCompiladas = 0;
  for (const grupo of grupos.values()) {
    try {
      const lote = await compilarLote(grupo.passagemIds);
      idsLotesCompilados.push(lote.id);
      passagensCompiladas += grupo.passagemIds.length;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      falhasCompilacao.push({
        contrato: grupo.numeroContrato,
        mensagem: compilationErrorMessages[code] ?? "Não foi possível compilar este grupo. As passagens continuam pendentes.",
      });
    }
  }

  return {
    importadas: result.count,
    duplicadas: passagens.length - result.count,
    lotesCompilados: idsLotesCompilados.length,
    passagensCompiladas,
    idsLotesCompilados,
    falhasCompilacao,
  };
}
