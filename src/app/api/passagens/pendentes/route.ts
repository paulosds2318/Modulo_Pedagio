import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { maskCpf, maskPhone } from "@/lib/pii";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autentica??o necess?ria." }, { status: 401 });

  try {
    const passages = await db.passagemPedagio.findMany({
      where: { loteId: null },
      orderBy: { dataHora: "desc" },
    });
    return NextResponse.json(hasRole(session, "admin") ? passages : passages.map((passage) => ({
      ...passage,
      cpfCliente: maskCpf(passage.cpfCliente),
      telefoneCliente: maskPhone(passage.telefoneCliente),
    })));
  } catch {
    return NextResponse.json({ error: "Banco de dados indispon?vel." }, { status: 503 });
  }
}
