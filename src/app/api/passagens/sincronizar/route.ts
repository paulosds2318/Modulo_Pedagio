import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasBearerSecret } from "@/lib/auth";
import { fetchConectCarPassages } from "@/lib/services/conectcar";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CONECTCAR_SYNC_SECRET)) return NextResponse.json({ error: "Não autorizado ou CONECTCAR_SYNC_SECRET não configurado." }, { status: process.env.CONECTCAR_SYNC_SECRET ? 401 : 503 });
  try {
    const source = await fetchConectCarPassages();
    let imported = 0, unmatched = 0, ambiguous = 0, alreadyBilled = 0;
    for (const passage of source) {
      const rentals = await db.contratoLocacao.findMany({ where: { placa: passage.placa, dataRetirada: { lte: passage.dataHora }, dataDevolucao: { gte: passage.dataHora } }, take: 2 });
      if (!rentals.length) { unmatched++; continue; }
      if (rentals.length > 1) { ambiguous++; continue; }
      const existing = await db.passagemPedagio.findUnique({ where: { idConectcar: passage.idConectcar } });
      if (existing?.loteId !== null && existing) { alreadyBilled++; continue; }
      const rental = rentals[0];
      await db.passagemPedagio.upsert({ where: { idConectcar: passage.idConectcar }, create: { ...passage, numeroContrato: rental.numeroContrato, cpfCliente: rental.cpfCliente, telefoneCliente: rental.telefoneCliente, lojaRetirada: rental.lojaRetirada }, update: { ...passage, numeroContrato: rental.numeroContrato, cpfCliente: rental.cpfCliente, telefoneCliente: rental.telefoneCliente, lojaRetirada: rental.lojaRetirada } });
      imported++;
    }
    return NextResponse.json({ recebidas: source.length, importadas: imported, semContrato: unmatched, contratosSobrepostos: ambiguous, jaEmLote: alreadyBilled });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao sincronizar ConectCar." }, { status: 502 }); }
}
