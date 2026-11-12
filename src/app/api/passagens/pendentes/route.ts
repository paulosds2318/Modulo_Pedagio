import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  try {
    const passages = await db.passagemPedagio.findMany({
      where: { loteId: null },
      orderBy: { dataHora: "desc" },
    });
    return NextResponse.json(passages);
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}
