import { NextResponse } from "next/server";
import { hasBearerSecret } from "@/lib/auth";
import { processBillingRule } from "@/lib/services/regua";
import { processIntegrationOutbox } from "@/lib/services/outbox";
export const runtime = "nodejs";
async function run(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) return NextResponse.json({ error: "Não autorizado ou CRON_SECRET não configurado." }, { status: process.env.CRON_SECRET ? 401 : 503 });
  try {
    const [regua, integracoes] = await Promise.all([processBillingRule(), processIntegrationOutbox()]);
    return NextResponse.json({ regua, integracoes });
  }
  catch { return NextResponse.json({ error: "Falha temporária ao processar tarefas agendadas." }, { status: 500 }); }
}
export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
