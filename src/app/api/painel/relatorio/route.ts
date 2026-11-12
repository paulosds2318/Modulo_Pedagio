import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { linhaDoTempo, loadLotes, porLoja, totalizar, type Totais } from "@/lib/server/painel-data";
import { safeText, styleHeader } from "@/lib/server/spreadsheet";
import {
  ETAPAS,
  SITUACOES,
  UNIT_LABELS,
  formatDateTime,
  formatDuration,
  parsePainelFilters,
  percent,
  periodLabel,
  previousFilters,
  variation,
} from "@/lib/painel";

export const runtime = "nodejs";

const reais = (cents: number) => Math.round(cents) / 100;
const MOEDA = '"R$" #,##0.00';

/** Relatório do painel em Excel, com os mesmos filtros da tela. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parsePainelFilters(params);
  const previous = previousFilters(filters);
  try {
    const [lotes, anteriores] = await Promise.all([loadLotes(filters), previous ? loadLotes(previous) : null]);
    const totals = totalizar(lotes);
    const before: Totais | null = anteriores ? totalizar(anteriores) : null;
    const timeline = linhaDoTempo(lotes, filters);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Módulo de Pedágios · Foco Aluguel de Carros";

    const resumo = workbook.addWorksheet("Resumo");
    resumo.columns = [
      { header: "Indicador", key: "nome", width: 34 },
      { header: "Período", key: "atual", width: 20 },
      { header: "Período anterior", key: "anterior", width: 20 },
      { header: "Variação", key: "variacao", width: 16 },
    ];
    const linha = (nome: string, atual: number | string, anterior?: number | string | null, varAtual?: number | null, varAnterior?: number | null) =>
      resumo.addRow({
        nome,
        atual,
        anterior: anterior ?? "",
        variacao: varAtual != null && varAnterior != null ? (variation(varAtual, varAnterior) ?? "") : "",
      });
    linha("Lotes emitidos", totals.lotes, before?.lotes, totals.lotes, before?.lotes);
    linha("Passagens", totals.passagens, before?.passagens, totals.passagens, before?.passagens);
    const valores = [
      ["Valor cobrado", "cobradoCentavos"],
      ["Valor recebido", "recebidoCentavos"],
      ["Em aberto", "abertoCentavos"],
    ] as const;
    for (const [nome, key] of valores) {
      const row = linha(nome, reais(totals[key]), before ? reais(before[key]) : null, totals[key], before?.[key]);
      row.getCell("atual").numFmt = MOEDA;
      row.getCell("anterior").numFmt = MOEDA;
    }
    linha("% recuperado", percent(totals.recebidoCentavos, totals.cobradoCentavos), before ? percent(before.recebidoCentavos, before.cobradoCentavos) : null);
    linha("Lotes pagos", totals.pagos, before?.pagos, totals.pagos, before?.pagos);
    linha("Lotes inadimplentes", totals.inadimplentes, before?.inadimplentes, totals.inadimplentes, before?.inadimplentes);
    linha("Tempo até o pagamento (mediana)", formatDuration(totals.tempoPagamentoSeg), before ? formatDuration(before.tempoPagamentoSeg) : null);
    styleHeader(resumo);
    resumo.addRow([]);
    resumo.addRow(["Período", periodLabel(filters)]);
    resumo.addRow(["Loja", filters.loja ? safeText(filters.loja) : "Todas"]);
    resumo.addRow(["Situação", filters.situacao ? SITUACOES[filters.situacao] : "Todas"]);
    resumo.addRow(["Etapa da régua", filters.etapa ? ETAPAS[filters.etapa] : "Todas"]);
    resumo.addRow(["Gerado em", formatDateTime(new Date())]);

    const lojas = workbook.addWorksheet("Por loja");
    lojas.columns = [
      { header: "Loja", key: "loja", width: 30 },
      { header: "Lotes", key: "lotes", width: 10 },
      { header: "Passagens", key: "passagens", width: 12 },
      { header: "Valor cobrado", key: "cobrado", width: 16, style: { numFmt: MOEDA } },
      { header: "Recebido", key: "recebido", width: 16, style: { numFmt: MOEDA } },
      { header: "Em aberto", key: "aberto", width: 16, style: { numFmt: MOEDA } },
      { header: "% recuperado", key: "recuperado", width: 14 },
      { header: "Inadimplentes", key: "inadimplentes", width: 14 },
    ];
    const lojaRow = (loja: string, t: Totais) => ({
      loja: safeText(loja),
      lotes: t.lotes,
      passagens: t.passagens,
      cobrado: reais(t.cobradoCentavos),
      recebido: reais(t.recebidoCentavos),
      aberto: reais(t.abertoCentavos),
      recuperado: percent(t.recebidoCentavos, t.cobradoCentavos),
      inadimplentes: t.inadimplentes,
    });
    for (const item of porLoja(lotes)) lojas.addRow(lojaRow(item.loja, item));
    lojas.addRow(lojaRow("Total", totals)).font = { bold: true };
    styleHeader(lojas);

    const unidade = UNIT_LABELS[timeline.unit];
    const evolucao = workbook.addWorksheet("Evolução");
    evolucao.columns = [
      { header: unidade[0].toUpperCase() + unidade.slice(1), key: "label", width: 22 },
      { header: "Lotes emitidos", key: "value", width: 16 },
    ];
    for (const point of timeline.points) evolucao.addRow({ label: point.label, value: point.value });
    styleHeader(evolucao);

    const lista = workbook.addWorksheet("Lotes");
    lista.columns = [
      { header: "Lote", key: "id", width: 8 },
      { header: "Contrato", key: "contrato", width: 18 },
      { header: "Cliente", key: "cliente", width: 32 },
      { header: "Loja", key: "loja", width: 28 },
      { header: "Passagens", key: "passagens", width: 11 },
      { header: "Valor", key: "valor", width: 14, style: { numFmt: MOEDA } },
      { header: "Situação", key: "situacao", width: 14 },
      { header: "Etapa", key: "etapa", width: 8 },
      { header: "Emitido em", key: "emitido", width: 18 },
      { header: "Pago em", key: "pago", width: 18 },
    ];
    for (const l of lotes) {
      lista.addRow({
        id: l.id,
        contrato: safeText(l.numeroContrato),
        cliente: safeText(l.nomeCliente ?? ""),
        loja: safeText(l.loja),
        passagens: l.quantidadePassagens,
        valor: reais(l.valorFinalCentavos),
        situacao: SITUACOES[l.status] ?? safeText(l.status),
        etapa: ETAPAS[l.etapaRegua] ?? safeText(l.etapaRegua),
        emitido: formatDateTime(l.dataCriacao),
        pago: l.dataPagamento ? formatDateTime(l.dataPagamento) : "",
      });
    }
    styleHeader(lista);

    const bytes = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="painel-pedagios-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar o relatório." }, { status: 503 });
  }
}
