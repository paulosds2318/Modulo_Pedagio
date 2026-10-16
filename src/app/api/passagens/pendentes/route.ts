import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const passages = await db.passagemPedagio.findMany({ where: { loteId: null }, orderBy: { dataHora: "desc" } });
  return NextResponse.json(passages);
}
