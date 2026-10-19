import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  try {
    const lots = await db.loteCobranca.findMany({ orderBy: { dataCriacao: "desc" }, take: 100 });
    return NextResponse.json(lots);
  } catch {
    // Modo offline / sem banco ativo - retorna dados demonstrativos para visualização
    return NextResponse.json([
      {
        id: 1,
        numeroContrato: "DEMO-2026-001",
        cpfCliente: "00000000000",
        telefoneCliente: "5511999999999",
        quantidadePassagens: 2,
        valorTotalCentavos: 2165,
        taxaCentavos: 500,
        valorFinalCentavos: 2665,
        status: "EM_REGUA",
        etapaRegua: "D0",
        adyenPaymentUrl: null,
        dataCriacao: new Date().toISOString(),
        dataPagamento: null,
      },
    ]);
  }
}
