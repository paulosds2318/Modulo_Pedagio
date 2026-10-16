import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const lots = await db.loteCobranca.findMany({ orderBy: { dataCriacao: "desc" }, take: 100 });
  return NextResponse.json(lots);
}
