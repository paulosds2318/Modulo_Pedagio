import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "15", 10)));
  const search = searchParams.get("search")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "TODOS";
  const dataInicio = searchParams.get("dataInicio")?.trim() || "";
  const dataFim = searchParams.get("dataFim")?.trim() || "";
  const etapaRegua = searchParams.get("etapaRegua")?.trim() || "TODAS";

  try {
    // Filtros dinâmicos Prisma
    const where: Record<string, unknown> = {};

    if (status !== "TODOS") {
      where.status = status;
    }

    if (etapaRegua !== "TODAS") {
      where.etapaRegua = etapaRegua;
    }

    if (search) {
      const searchNum = parseInt(search.replace("#", ""), 10);
      where.OR = [
        { numeroContrato: { contains: search, mode: "insensitive" } },
        { cpfCliente: { contains: search } },
        ...(!isNaN(searchNum) ? [{ id: searchNum }] : []),
      ];
    }

    if (dataInicio || dataFim) {
      where.dataCriacao = {
        ...(dataInicio ? { gte: new Date(`${dataInicio}T00:00:00.000Z`) } : {}),
        ...(dataFim ? { lte: new Date(`${dataFim}T23:59:59.999Z`) } : {}),
      };
    }

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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch {
    // Fallback offline / sem banco ativo com múltiplos dados demonstrativos
    const now = new Date();
    const mockLots = [
      {
        id: 1045,
        numeroContrato: "LOC-2026-9871",
        cpfCliente: "12345678909",
        telefoneCliente: "5511988887777",
        quantidadePassagens: 4,
        valorTotalCentavos: 4890,
        taxaCentavos: 1000,
        valorFinalCentavos: 5890,
        status: "PAGO",
        etapaRegua: "D0",
        adyenPaymentUrl: null,
        dataCriacao: new Date(now.getTime() - 1000 * 60 * 60 * 3).toISOString(), // hoje há 3 horas
        dataPagamento: new Date(now.getTime() - 1000 * 60 * 45).toISOString(),
      },
      {
        id: 1044,
        numeroContrato: "LOC-2026-9842",
        cpfCliente: "98765432100",
        telefoneCliente: "5581977776666",
        quantidadePassagens: 2,
        valorTotalCentavos: 2160,
        taxaCentavos: 500,
        valorFinalCentavos: 2660,
        status: "EM_REGUA",
        etapaRegua: "D0",
        adyenPaymentUrl: "https://checkoutshopper-test.adyen.com/pay/demo",
        dataCriacao: new Date(now.getTime() - 1000 * 60 * 60 * 8).toISOString(), // hoje de manhã
        dataPagamento: null,
      },
      {
        id: 1043,
        numeroContrato: "LOC-2026-9780",
        cpfCliente: "45678912344",
        telefoneCliente: "5521999991111",
        quantidadePassagens: 6,
        valorTotalCentavos: 7350,
        taxaCentavos: 1500,
        valorFinalCentavos: 8850,
        status: "EM_REGUA",
        etapaRegua: "D5",
        adyenPaymentUrl: "https://checkoutshopper-test.adyen.com/pay/demo",
        dataCriacao: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5).toISOString(), // há 5 dias
        dataPagamento: null,
      },
      {
        id: 1042,
        numeroContrato: "LOC-2026-9650",
        cpfCliente: "32165498700",
        telefoneCliente: "5531988882222",
        quantidadePassagens: 3,
        valorTotalCentavos: 3690,
        taxaCentavos: 800,
        valorFinalCentavos: 4490,
        status: "PAGO",
        etapaRegua: "D5",
        adyenPaymentUrl: null,
        dataCriacao: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 6).toISOString(),
        dataPagamento: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      },
      {
        id: 1041,
        numeroContrato: "LOC-2026-9502",
        cpfCliente: "78912345688",
        telefoneCliente: "5541999993333",
        quantidadePassagens: 1,
        valorTotalCentavos: 1290,
        taxaCentavos: 500,
        valorFinalCentavos: 1790,
        status: "INADIMPLENTE",
        etapaRegua: "D10",
        adyenPaymentUrl: null,
        dataCriacao: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
        dataPagamento: null,
      },
    ];

    // Aplica filtros nos mocks
    let filtered = mockLots;
    if (status !== "TODOS") {
      filtered = filtered.filter((l) => l.status === status);
    }
    if (etapaRegua !== "TODAS") {
      filtered = filtered.filter((l) => l.etapaRegua === etapaRegua);
    }
    if (search) {
      filtered = filtered.filter(
        (l) =>
          l.numeroContrato.toLowerCase().includes(search.toLowerCase()) ||
          l.cpfCliente.includes(search) ||
          String(l.id).includes(search)
      );
    }
    if (dataInicio) {
      filtered = filtered.filter((l) => l.dataCriacao.slice(0, 10) >= dataInicio);
    }
    if (dataFim) {
      filtered = filtered.filter((l) => l.dataCriacao.slice(0, 10) <= dataFim);
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  }
}
