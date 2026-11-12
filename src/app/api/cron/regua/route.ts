import { NextResponse } from "next/server";
import { hasBearerSecret } from "@/lib/auth";
import { executarRotina } from "@/lib/services/rotina";

export const runtime = "nodejs";

/**
 * Rotina automática chamada de fora (cron-job.org, EventBridge…), com Authorization: Bearer CRON_SECRET.
 * Em produção com AGENDADOR_INTERNO=true, o próprio módulo já roda a rotina sozinho; esta rota continua
 * disponível para execuções manuais. A trava no banco impede duas execuções ao mesmo tempo.
 */
async function run(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Não autorizado ou CRON_SECRET não configurado." }, { status: process.env.CRON_SECRET ? 401 : 503 });
  }
  try {
    const resultado = await executarRotina("CRON_EXTERNO");
    return NextResponse.json(resultado, { status: resultado.status === "IGNORADA" ? 409 : 200 });
  } catch {
    return NextResponse.json({ error: "Falha temporária ao processar tarefas agendadas." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
