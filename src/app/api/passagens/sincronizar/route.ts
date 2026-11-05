import { NextResponse } from "next/server";
import { getServerSession, hasBearerSecret, hasRole } from "@/lib/auth";
import { sincronizarPassagensCoral, tollDataUrl } from "@/lib/services/coral-toll-data";

export const runtime = "nodejs";

/** Busca passagens ConectCar no Coral (toll-data). Aceita sessão admin ou Bearer CRON_SECRET. */
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    if (!hasRole(session, "admin")) {
      return NextResponse.json({ error: "Apenas administradores podem sincronizar passagens." }, { status: 403 });
    }
  }
  if (!tollDataUrl()) {
    return NextResponse.json({ error: "Sincronização com o Coral não configurada (CORAL_TOLL_DATA_URL)." }, { status: 503 });
  }

  try {
    return NextResponse.json(await sincronizarPassagensCoral());
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^CONFIG:\s*/, "") : "Falha ao sincronizar passagens do Coral.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
