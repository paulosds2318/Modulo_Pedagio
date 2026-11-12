import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { isCalendarDate, saoPauloDateRange } from "@/lib/date-range";

export const runtime = "nodejs";

/**
 * Passagens ainda sem lote. Com `page`, responde paginado e filtrado no servidor
 * ({ data, pagination }); sem `page`, mantém a resposta antiga (lista completa).
 * Filtros: `search` (contrato, placa, praça, rodovia ou loja), `de` e `ate` (AAAA-MM-DD, data da passagem).
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const paginado = params.has("page");
  const search = params.get("search")?.trim().slice(0, 100) || "";
  const de = params.get("de")?.trim() || "";
  const ate = params.get("ate")?.trim() || "";
  if ((de && !isCalendarDate(de)) || (ate && !isCalendarDate(ate))) {
    return NextResponse.json({ error: "Informe datas válidas no formato AAAA-MM-DD." }, { status: 400 });
  }

  const where = {
    loteId: null,
    ...(de || ate ? { dataHora: saoPauloDateRange(de || undefined, ate || undefined) } : {}),
    ...(search
      ? {
          OR: ["numeroContrato", "placa", "praca", "rodovia", "lojaRetirada"].map((campo) => ({
            [campo]: { contains: search, mode: "insensitive" as const },
          })),
        }
      : {}),
  };

  try {
    if (!paginado) {
      return NextResponse.json(await db.passagemPedagio.findMany({ where, orderBy: { dataHora: "desc" } }));
    }
    const pageValue = Number.parseInt(params.get("page") || "1", 10);
    const limitValue = Number.parseInt(params.get("limit") || "50", 10);
    const page = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
    const limit = Number.isFinite(limitValue) ? Math.min(200, Math.max(10, limitValue)) : 50;
    const [data, total, soma] = await Promise.all([
      db.passagemPedagio.findMany({ where, orderBy: { dataHora: "desc" }, skip: (page - 1) * limit, take: limit }),
      db.passagemPedagio.count({ where }),
      db.passagemPedagio.aggregate({ where, _sum: { valorCentavos: true } }),
    ]);
    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
      totalValorCentavos: soma._sum.valorCentavos ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}
