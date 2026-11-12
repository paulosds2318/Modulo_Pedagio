import { NextResponse } from "next/server";
import { getServerSession, hasBearerSecret, hasRole } from "@/lib/auth";
import { sincronizarPassagensCoral, tollDataUrl } from "@/lib/services/coral-toll-data";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";

/** Busca passagens ConectCar no Coral (toll-data). Aceita sessão admin ou Bearer CRON_SECRET. */
export async function POST(request: Request) {
  const viaCron = hasBearerSecret(request, process.env.CRON_SECRET);
  const session = viaCron ? null : await getServerSession();
  if (!viaCron) {
    if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    if (!hasRole(session, "admin")) {
      return NextResponse.json({ error: "Apenas administradores podem sincronizar passagens." }, { status: 403 });
    }
  }
  if (!tollDataUrl()) {
    return NextResponse.json({ error: "Sincronização com o Coral não configurada (CORAL_TOLL_DATA_URL)." }, { status: 503 });
  }

  // Corpo opcional {startDate, endDate} (AAAA-MM-DD, até 31 dias); sem corpo, usa os últimos N dias.
  const body = (await request.json().catch(() => null)) as { startDate?: unknown; endDate?: unknown } | null;
  const periodo = {
    startDate: typeof body?.startDate === "string" ? body.startDate : undefined,
    endDate: typeof body?.endDate === "string" ? body.endDate : undefined,
  };

  try {
    const resultado = await sincronizarPassagensCoral(new Date(), periodo, viaCron ? "CRON" : "MANUAL");
    if (session) {
      await registrarAuditoria(session, request, "SINCRONIZAR_CORAL", {
        detalhes: { periodo: resultado.periodo, recebidas: resultado.recebidas, importadas: resultado.importadas, lotesCompilados: resultado.lotesCompilados },
      });
    }
    return NextResponse.json(resultado);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Falha ao sincronizar passagens do Coral.";
    if (raw.startsWith("PERIODO:")) return NextResponse.json({ error: raw.replace(/^PERIODO:\s*/, "") }, { status: 400 });
    return NextResponse.json({ error: raw.replace(/^CONFIG:\s*/, "") }, { status: 502 });
  }
}
