import { NextResponse } from "next/server";
import { hasBearerSecret } from "@/lib/auth";
import { processBillingRule } from "@/lib/services/regua";
import { processIntegrationOutbox } from "@/lib/services/outbox";
import { sincronizarPassagensCoral, tollDataUrl } from "@/lib/services/coral-toll-data";
export const runtime = "nodejs";

/** Falha na consulta ao Coral não deve impedir a régua nem a outbox. */
async function syncPassages() {
  if (!tollDataUrl()) return { status: "NAO_CONFIGURADO" };
  try { return { status: "OK", ...(await sincronizarPassagensCoral()) }; }
  catch (error) { return { status: "FALHA", erro: error instanceof Error ? error.message.replace(/^CONFIG:\s*/, "") : "Falha desconhecida." }; }
}

async function run(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) return NextResponse.json({ error: "Não autorizado ou CRON_SECRET não configurado." }, { status: process.env.CRON_SECRET ? 401 : 503 });
  try {
    const passagens = await syncPassages();
    const [regua, integracoes] = await Promise.all([processBillingRule(), processIntegrationOutbox()]);
    return NextResponse.json({ passagens, regua, integracoes });
  }
  catch { return NextResponse.json({ error: "Falha temporária ao processar tarefas agendadas." }, { status: 500 }); }
}
export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
