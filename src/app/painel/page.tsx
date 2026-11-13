import { BackToHome } from "@/components/back-to-home";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { LOJA_NAO_IDENTIFICADA, linhaDoTempo, listarInadimplentes, listarLojas, loadLotes, porLoja, totalizar, type Totais } from "@/lib/server/painel-data";
import { FORMAS_PAGAMENTO } from "@/lib/baixa-manual";
import {
  ETAPAS,
  PERIODS,
  SITUACOES,
  UNIT_LABELS,
  formatDateTime,
  formatDuration,
  money,
  pageParam,
  painelQuery,
  parsePainelFilters,
  percent,
  periodLabel,
  previousFilters,
  variation,
  type Period,
} from "@/lib/painel";
import { RefreshPageButton } from "@/components/refresh-page-button";
import { LinkPagination } from "@/components/link-pagination";
import { TimelineChart } from "@/components/timeline-chart";
import { OperationPanel } from "@/components/operation-panel";
import { obterPrazosRegua } from "@/lib/services/config-regua";
import { rotuloEtapa } from "@/lib/regua-config";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function PainelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/painel");
  const params = await searchParams;
  const filters = parsePainelFilters(params);
  const page = pageParam(params, "p");
  const previous = previousFilters(filters);

  const [lotes, lotesAnteriores, lojas, prazos, inadimplentes] = await Promise.all([
    loadLotes(filters),
    previous ? loadLotes(previous) : null,
    listarLojas(),
    obterPrazosRegua(),
    listarInadimplentes(),
  ]);
  const totals = totalizar(lotes);
  const before: Totais | null = lotesAnteriores ? totalizar(lotesAnteriores) : null;
  const lojasResumo = porLoja(lotes);
  const timeline = linhaDoTempo(lotes, filters);
  const label = periodLabel(filters);
  const hasScope = Boolean(filters.loja || filters.situacao || filters.etapa);
  const pagina = lotes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /** Variação do indicador contra o período anterior, com o valor anterior para referência. */
  const change = (current: number | null, prior: number | null | undefined, format: (value: number) => string = String) => {
    if (!previous || prior == null) return undefined;
    const text = variation(current, prior);
    if (text === "sem variação") return `Igual ao período anterior (${format(prior)})`;
    if (text === "sem base anterior") return `Período anterior: ${format(prior)}`;
    return text ? `${text} vs. período anterior (${format(prior)})` : undefined;
  };
  const recuperacao = (t: Totais) => (t.cobradoCentavos ? Math.round((t.recebidoCentavos / t.cobradoCentavos) * 100) : null);

  const metrics = [
    {
      label: "Lotes emitidos",
      value: String(totals.lotes),
      detail:
        `${totals.passagens} passage${totals.passagens === 1 ? "m" : "ns"} de pedágio no período` +
        (totals.cancelados ? ` · ${totals.cancelados} cancelado${totals.cancelados === 1 ? "" : "s"} (${money(totals.canceladoCentavos)})` : ""),
      change: change(totals.lotes, before?.lotes),
    },
    {
      label: "Valor cobrado",
      value: money(totals.cobradoCentavos),
      detail: "Soma dos lotes emitidos no período",
      change: change(totals.cobradoCentavos, before?.cobradoCentavos, money),
    },
    {
      label: "Valor recebido",
      value: money(totals.recebidoCentavos),
      detail:
        `${totals.pagos} lote${totals.pagos === 1 ? "" : "s"} pago${totals.pagos === 1 ? "" : "s"} · ${percent(totals.recebidoCentavos, totals.cobradoCentavos)} recuperado` +
        (totals.baixasManuais ? ` · ${totals.baixasManuais} por baixa manual` : "") +
        (totals.descontoCentavos ? ` · ${money(totals.descontoCentavos)} em descontos` : ""),
      change: change(recuperacao(totals), before ? recuperacao(before) : undefined, (v) => `${v}%`),
    },
    {
      label: "Em aberto",
      value: money(totals.abertoCentavos),
      detail: `${totals.emRegua} em régua · ${totals.inadimplentes} inadimplente${totals.inadimplentes === 1 ? "" : "s"}`,
      change: change(totals.abertoCentavos, before?.abertoCentavos, money),
    },
    {
      label: "Tempo até o pagamento",
      value: formatDuration(totals.tempoPagamentoSeg),
      detail: totals.pagos ? `Mediana entre a emissão e o pagamento · ${totals.pagos} pagamento${totals.pagos === 1 ? "" : "s"}` : "Nenhum lote pago no período",
      change: totals.pagos ? change(totals.tempoPagamentoSeg, before?.tempoPagamentoSeg, formatDuration) : undefined,
    },
  ];

  return (
    <main className="shell dashboard-shell">
      <BackToHome />
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Gestão · Pedágios</span>
          <h1>Painel de acompanhamento</h1>
          <p>Lotes emitidos, valores cobrados e recebidos, desempenho por loja e situação da régua de cobrança.</p>
        </div>
        <div className="dashboard-heading-actions">
          <RefreshPageButton />
          <a className="button primary" href={`/api/painel/relatorio?${painelQuery(filters)}`} download>
            Exportar relatório
          </a>
        </div>
      </header>

      <section className="panel dashboard-filters" aria-label="Filtros">
        <nav className="admin-request-tabs period-tabs" aria-label="Período">
          {(Object.keys(PERIODS) as Period[]).map((key) => (
            <Link
              key={key}
              href={`/painel?${painelQuery({ ...filters, period: key, de: undefined, ate: undefined })}`}
              className={`button ${key === filters.period ? "primary" : "secondary"}`}
              aria-current={key === filters.period ? "page" : undefined}
            >
              {PERIODS[key]}
            </Link>
          ))}
        </nav>
        <form className="filter-bar" action="/painel">
          {filters.period !== "personalizado" && <input type="hidden" name="periodo" value={filters.period} />}
          <label className="filter-field">
            De
            <input type="date" name="de" defaultValue={filters.de} />
          </label>
          <label className="filter-field">
            Até
            <input type="date" name="ate" defaultValue={filters.ate} />
          </label>
          <label className="filter-field">
            Loja
            <select name="loja" defaultValue={filters.loja ?? ""}>
              <option value="">Todas</option>
              {lojas.map((loja) => (
                <option key={loja} value={loja}>
                  {loja}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Situação
            <select name="situacao" defaultValue={filters.situacao ?? ""}>
              <option value="">Todas</option>
              {Object.entries(SITUACOES).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Etapa da régua
            <select name="etapa" defaultValue={filters.etapa ?? ""}>
              <option value="">Todas</option>
              {Object.keys(ETAPAS).map((value) => (
                <option key={value} value={value}>
                  {rotuloEtapa(value, prazos)}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" type="submit">
            Filtrar
          </button>
          {(filters.period === "personalizado" || hasScope) && (
            <Link className="button secondary" href="/painel">
              Limpar filtros
            </Link>
          )}
        </form>
      </section>

      <section className="dashboard-metrics dashboard-metrics-auto" aria-label={`Resumo · ${label}`}>
        {metrics.map((metric) => (
          <div className="dashboard-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
            {metric.change && <small className="metric-change">{metric.change}</small>}
          </div>
        ))}
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>
              Lotes emitidos por {UNIT_LABELS[timeline.unit]} · {label}
            </h2>
            <p>Passe o mouse sobre uma barra para ver o total.</p>
          </div>
        </div>
        <TimelineChart points={timeline.points} unitLabel={UNIT_LABELS[timeline.unit]} singular="lote" plural="lotes" seriesLabel="Lotes emitidos" />
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>Por loja · {label}</h2>
            <p>Lotes emitidos no período, pela loja de retirada do contrato. Clique na loja para filtrar o painel.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table dashboard-numbers">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Lotes</th>
                <th>Passagens</th>
                <th>Valor cobrado</th>
                <th>Recebido</th>
                <th>Em aberto</th>
                <th>% recuperado</th>
                <th>Inadimplentes</th>
              </tr>
            </thead>
            <tbody>
              {lojasResumo.map((item) => (
                <tr key={item.loja}>
                  <td className="strong">
                    {item.loja === filters.loja || item.loja === LOJA_NAO_IDENTIFICADA ? item.loja : <Link href={`/painel?${painelQuery({ ...filters, loja: item.loja })}`}>{item.loja}</Link>}
                  </td>
                  <td>{item.lotes}</td>
                  <td>{item.passagens}</td>
                  <td>{money(item.cobradoCentavos)}</td>
                  <td>{money(item.recebidoCentavos)}</td>
                  <td>{money(item.abertoCentavos)}</td>
                  <td>{percent(item.recebidoCentavos, item.cobradoCentavos)}</td>
                  <td>{item.inadimplentes}</td>
                </tr>
              ))}
              {!lojasResumo.length && (
                <tr>
                  <td className="empty" colSpan={8}>
                    Nenhum lote emitido no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel dashboard-recent" id="inadimplentes">
        <div className="panel-head">
          <div>
            <h2>Tratamento manual · {inadimplentes.total}</h2>
            <p>Régua encerrada sem pagamento (cobrança extrajudicial), de qualquer data. Depois de negociar com o cliente, registre a baixa manual no lote.</p>
          </div>
          <Link href="/tratamento-manual" className="button secondary">
            Ver todos →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Cliente</th>
                <th>Valor devido</th>
                <th>Emitido em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inadimplentes.itens.map((lote) => (
                <tr key={lote.id}>
                  <td className="strong">
                    #{lote.id}
                    <span className="subcell">{lote.numeroContrato}</span>
                  </td>
                  <td>{lote.nomeCliente || "—"}</td>
                  <td>{money(lote.valorFinalCentavos)}</td>
                  <td>{formatDateTime(lote.dataCriacao)}</td>
                  <td>
                    <Link href={`/lotes/${lote.id}#baixa`}>Dar baixa →</Link>
                  </td>
                </tr>
              ))}
              {!inadimplentes.itens.length && (
                <tr>
                  <td className="empty" colSpan={5}>
                    Nenhum lote inadimplente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {inadimplentes.total > inadimplentes.itens.length && (
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "10px 0 0" }}>
            Mostrando os {inadimplentes.itens.length} mais antigos de {inadimplentes.total}. Use o filtro de situação Inadimplente para ver por período.
          </p>
        )}
      </section>

      <section className="panel dashboard-recent" id="lotes">
        <div className="panel-head">
          <div>
            <h2>Lotes do período · {totals.lotes}</h2>
            <p>Todos os lotes dos filtros acima, dos mais recentes para os mais antigos.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Cliente</th>
                <th>Loja</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Emitido em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagina.map((lote) => (
                <tr key={lote.id}>
                  <td className="strong">
                    #{lote.id}
                    <span className="subcell">{lote.numeroContrato}</span>
                  </td>
                  <td>{lote.nomeCliente || "—"}</td>
                  <td>{lote.loja}</td>
                  <td>{money(lote.valorFinalCentavos)}</td>
                  <td>
                    <span className="dashboard-status">{SITUACOES[lote.status] ?? lote.status}</span>
                    {lote.status === "EM_REGUA" && <span className="subcell">Etapa {rotuloEtapa(lote.etapaRegua, prazos)}</span>}
                    {lote.status === "PAGO" && lote.formaPagamento && (
                      <span className="subcell">
                        {FORMAS_PAGAMENTO[lote.formaPagamento] ?? lote.formaPagamento}
                        {lote.baixaManual ? " (manual)" : ""}
                      </span>
                    )}
                  </td>
                  <td>{formatDateTime(lote.dataCriacao)}</td>
                  <td>
                    <Link href={`/lotes/${lote.id}`}>Abrir →</Link>
                  </td>
                </tr>
              ))}
              {!pagina.length && (
                <tr>
                  <td className="empty" colSpan={7}>
                    Nenhum lote nesta página.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <LinkPagination page={page} total={totals.lotes} pageSize={PAGE_SIZE} href={(p) => `/painel?${painelQuery(filters, { p: p > 1 ? p : undefined })}#lotes`} />
      </section>

      <OperationPanel />
    </main>
  );
}
