"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OperationPanel } from "@/components/operation-panel";
import { useSession } from "@/lib/auth-client";

type Lot = {
  id: number;
  numeroContrato: string;
  quantidadePassagens: number;
  valorFinalCentavos: number;
  status: string;
  etapaRegua: string;
  dataCriacao: string;
  dataPagamento?: string | null;
};

const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100
  );

const LIST_LIMIT = 10;
type Resumo = { passagensPendentes: number; emRegua: number; pagos: number; abertoCentavos: number };

/** Números da visão geral, já somados no servidor (/api/painel). */
async function fetchResumo(): Promise<Resumo> {
  const response = await fetch("/api/painel", { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.funil) throw new Error(body?.error || "Não foi possível carregar os indicadores.");
  const funil = body.funil as Array<{ chave: string; quantidade: number; valorCentavos: number }>;
  const emRegua = funil.filter((e) => e.chave.startsWith("D")).reduce((s, e) => s + e.quantidade, 0);
  const pagos = funil.find((e) => e.chave === "PAGO")?.quantidade ?? 0;
  const abertoCentavos = funil.filter((e) => e.chave !== "PAGO" && e.chave !== "CANCELADO").reduce((s, e) => s + e.valorCentavos, 0);
  return { passagensPendentes: body.passagensPendentes, emRegua, pagos, abertoCentavos };
}

/** Lotes mais recentes com os filtros aplicados no servidor (/api/lotes). */
async function fetchLotes(search: string, status: string, date: string): Promise<{ lots: Lot[]; total: number }> {
  const params = new URLSearchParams({ page: "1", limit: String(LIST_LIMIT) });
  if (search.trim()) params.set("search", search.trim());
  if (status !== "TODOS") params.set("status", status);
  if (date) {
    params.set("dataInicio", date);
    params.set("dataFim", date);
  }
  const response = await fetch(`/api/lotes?${params}`, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.data)) throw new Error(body?.error || "Não foi possível consultar os lotes.");
  return { lots: body.data, total: Number(body.pagination?.total) || body.data.length };
}

export function TollDashboard() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin" || role === "master";
  const isMaster = role === "master";
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [totalLots, setTotalLots] = useState(0);
  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [panelKey, setPanelKey] = useState(0);

  // Filtros rápidos da Visão Geral (aplicados no servidor)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    fetchResumo()
      .then(setResumo)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar os indicadores."))
      .finally(() => setLoading(false));
  }, []);

  // Lista: espera a digitação parar (300 ms) antes de consultar.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setListLoading(true);
      fetchLotes(search, statusFilter, dateFilter)
        .then(({ lots: next, total }) => {
          if (!active) return;
          setLots(next);
          setTotalLots(total);
        })
        .catch((e) => active && setError(e instanceof Error ? e.message : "Erro ao consultar os lotes."))
        .finally(() => active && setListLoading(false));
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, statusFilter, dateFilter, panelKey]);

  async function refreshDashboard() {
    setLoading(true);
    setError("");
    setRefreshNotice("");
    try {
      const next = await fetchResumo();
      const hasChanges = JSON.stringify(next) !== JSON.stringify(resumo);
      setResumo(next);
      setPanelKey((k) => k + 1);
      setRefreshNotice(
        hasChanges
          ? "Visão geral atualizada com novos dados."
          : "Nenhuma alteração encontrada. A visão geral já está atualizada."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao atualizar a visão geral.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">
            Foco Aluguel de Carros · Módulo de Pedágios
          </span>
          <h1>Visão Geral da Operação</h1>
          <p>
            Monitoramento diário de passagens, conciliação de pagamentos e esteira de cobrança.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="button secondary refresh-icon-button"
            onClick={() => void refreshDashboard()}
            disabled={loading}
            title={loading ? "Atualizando visão geral" : "Atualizar visão geral"}
            aria-label={loading ? "Atualizando visão geral" : "Atualizar visão geral"}
          >
            <svg className={loading ? "spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link className="button primary" href="/compilacao">
            + Compilar passagens
          </Link>
        </div>
      </header>

      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {refreshNotice && <div className="notice" role="status">{refreshNotice}</div>}

      <section className="summary">
        <article>
          <span>Passagens Pendentes</span>
          <strong>{loading || !resumo ? "…" : resumo.passagensPendentes}</strong>
          <small>Aguardando compilação de lote</small>
        </article>

        <article>
          <span>Lotes em Cobrança</span>
          <strong>{loading || !resumo ? "…" : resumo.emRegua}</strong>
          <small>Régua ativa (D+0 a D+10)</small>
        </article>

        <article>
          <span>Valor em Aberto</span>
          <strong>{loading || !resumo ? "…" : money(resumo.abertoCentavos)}</strong>
          <small>
            {resumo?.pagos ?? 0} lote{resumo?.pagos === 1 ? "" : "s"} já liquidado{resumo?.pagos === 1 ? "" : "s"}
          </small>
        </article>
      </section>

      <OperationPanel refreshKey={panelKey} modo="alertas" />

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2>Lotes Gerados na Operação</h2>
            <p>
              Os {LIST_LIMIT} mais recentes dos filtros abaixo
              {!listLoading && totalLots > lots.length ? ` · mostrando ${lots.length} de ${totalLots}` : ""}. A data filtra pela emissão do lote.
            </p>
          </div>
          <Link href="/lotes" className="button secondary">
            Ver todos com paginação completa →
          </Link>
        </div>

        {/* Barra de Filtros Rápidos na Visão Geral */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            padding: "16px 0 12px",
            borderBottom: "1px solid var(--line)",
            alignItems: "flex-end",
          }}
        >
          <label className="search-field" style={{ minWidth: "180px" }}>
            Buscar Contrato ou Lote
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex: LOC-2026, #1045..."
            />
          </label>

          <label className="filter-field">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="TODOS">Todos os status</option>
              <option value="PAGO">Pago / Liquidado</option>
              <option value="EM_REGUA">Em régua ativa</option>
              <option value="INADIMPLENTE">Inadimplente</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </label>

          <label className="filter-field">
            Data Específica
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </label>

          {(search || statusFilter !== "TODOS" || dateFilter) && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("TODOS");
                  setDateFilter("");
                }}
                style={{ fontSize: "12px", padding: "8px 12px", height: "40px" }}
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        <div className="table-wrap" style={{ marginTop: "12px" }}>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Contrato</th>
                <th>Data de Emissão</th>
                <th>Qtd. Passagens</th>
                <th>Valor Total</th>
                <th>Etapa Régua</th>
                <th>Status</th>
                <th>Data do Pagamento</th>
                <th style={{ textAlign: "right" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {lots.length ? (
                lots.map((l) => (
                  <tr key={l.id}>
                    <td className="strong">#{l.id}</td>
                    <td>
                      <span className="strong">{l.numeroContrato}</span>
                    </td>
                    <td>{new Date(l.dataCriacao).toLocaleDateString("pt-BR")}</td>
                    <td>{l.quantidadePassagens} pedágio(s)</td>
                    <td className="strong">{money(l.valorFinalCentavos)}</td>
                    <td>
                      <span className="nav-badge" style={{ fontSize: "10px", padding: "2px 8px" }}>
                        {l.etapaRegua}
                      </span>
                    </td>
                    <td>
                      <span className={`status status-${l.status.toLowerCase()}`}>
                        {l.status === "PAGO" ? "✓ PAGO" : l.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      {l.dataPagamento ? (
                        <span style={{ color: "var(--foco-green)", fontWeight: 600 }}>
                          {new Date(l.dataPagamento).toLocaleDateString("pt-BR")} às{" "}
                          {new Date(l.dataPagamento).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>Aguardando</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/lotes/${l.id}`} style={{ fontWeight: 700 }}>
                        Ver detalhes →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty" style={{ padding: "32px", textAlign: "center" }}>
                    {listLoading
                      ? "Carregando lotes..."
                      : "Nenhum lote corresponde aos filtros aplicados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="quick-links">
        <Link className="quick-link" href="/compilacao">
          <strong>Compilar Novas Passagens</strong>
          <span>Filtre as passagens importadas e gere um novo lote para faturamento.</span>
        </Link>
        <Link className="quick-link" href="/lotes">
          <strong>Acompanhar Régua de Cobrança</strong>
          <span>Consulte o histórico de envios, links Adyen ativos e baixas manuais auditadas.</span>
        </Link>
        {isAdmin && (
          <Link className="quick-link" href="/usuarios">
            <strong>Gestão de Usuários</strong>
            <span>Cadastre, edite e defina o perfil de acesso de quem usa o módulo.</span>
          </Link>
        )}
        {isMaster && (
          <Link className="quick-link" href="/auditoria">
            <strong>Auditoria</strong>
            <span>Consulte quem compilou lotes, consultou a Adyen, exportou relatórios ou alterou usuários.</span>
          </Link>
        )}
      </section>
    </main>
  );
}
