import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autentica??o necess?ria." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pageValue = Number.parseInt(searchParams.get("page") || "1", 10);
  const limitValue = Number.parseInt(searchParams.get("limit") || "15", 10);
  const page = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
  const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(5, limitValue)) : 15;
  const search = searchParams.get("search")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "TODOS";
  const dataInicio = searchParams.get("dataInicio")?.trim() || "";
  const dataFim = searchParams.get("dataFim")?.trim() || "";
  const etapaRegua = searchParams.get("etapaRegua")?.trim() || "TODAS";
  const where: Record<string, unknown> = {};

  if (status !== "TODOS") where.status = status;
  if (etapaRegua !== "TODAS") where.etapaRegua = etapaRegua;
  if (search) {
    const searchNum = Number.parseInt(search.replace("#", ""), 10);
    where.OR = [
      { numeroContrato: { contains: search, mode: "insensitive" } },
      { cpfCliente: { contains: search } },
      ...(Number.isFinite(searchNum) ? [{ id: searchNum }] : []),
    ];
  }
  if (dataInicio || dataFim) {
    where.dataCriacao = {
      ...(dataInicio ? { gte: new Date(`${dataInicio}T00:00:00.000Z`) } : {}),
      ...(dataFim ? { lte: new Date(`${dataFim}T23:59:59.999Z`) } : {}),
    };
  }

  try {
    const [total, lots] = await Promise.all([
      db.loteCobranca.count({ where }),
      db.loteCobranca.findMany({
        where,
        orderBy: { dataCriacao: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return NextResponse.json({
      data: lots,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch {
    return NextResponse.json({ error: "Banco de dados indispon?vel." }, { status: 503 });
  }
}
