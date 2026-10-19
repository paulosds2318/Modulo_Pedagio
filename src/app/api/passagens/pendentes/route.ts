import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  try {
    const passages = await db.passagemPedagio.findMany({ where: { loteId: null }, orderBy: { dataHora: "desc" } });
    return NextResponse.json(passages);
  } catch {
    // Modo offline / sem banco ativo - retorna dados demonstrativos para visualização
    return NextResponse.json([
      {
        id: 1,
        idConectcar: "DEMO-TOLL-001",
        numeroContrato: "DEMO-2026-001",
        cpfCliente: "00000000000",
        telefoneCliente: "5511999999999",
        placa: "ABC1D23",
        tag: "DEMO-TAG",
        praca: "Bandeirantes",
        rodovia: "SP-348",
        dataHora: new Date().toISOString(),
        valorCentavos: 1290,
        lojaRetirada: "São Paulo - Centro",
      },
      {
        id: 2,
        idConectcar: "DEMO-TOLL-002",
        numeroContrato: "DEMO-2026-001",
        cpfCliente: "00000000000",
        telefoneCliente: "5511999999999",
        placa: "ABC1D23",
        tag: "DEMO-TAG",
        praca: "Anhanguera",
        rodovia: "SP-348",
        dataHora: new Date().toISOString(),
        valorCentavos: 875,
        lojaRetirada: "São Paulo - Centro",
      },
    ]);
  }
}
