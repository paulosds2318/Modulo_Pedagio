import { NextResponse } from "next/server";
import { hasBearerSecret } from "@/lib/auth";
import { processBillingRule } from "@/lib/services/regua";
export const runtime = "nodejs";
async function run(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) return NextResponse.json({ error: "Não autorizado ou CRON_SECRET não configurado." }, { status: process.env.CRON_SECRET ? 401 : 503 });
  try { return NextResponse.json(await processBillingRule()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar a régua." }, { status: 500 }); }
}
export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
