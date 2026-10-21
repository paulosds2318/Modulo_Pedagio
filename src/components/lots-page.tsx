"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

type Lot = {
  id: number;
  numeroContrato: string;
  cpfCliente: string;
  telefoneCliente: string | null;
  quantidadePassagens: number;
  valorTotalCentavos: number;
  taxaCentavos: number;
  valorFinalCentavos: number;
  status: string;
  etapaRegua: string;
  adyenPaymentUrl: string | null;
  dataCriacao: string;
  dataPagamento: string | null;
};

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100
  );

const maskCpf = (cpf: string) => {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  }
  return cpf;
};

export function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Filtros
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [etapaRegua, setEtapaRegua] = useState("TODAS");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [error, setError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLots = useCallback(
    async (pageToLoad = 1): Promise<boolean | null> => {
      setLoading(true);
      setError("");
      setRefreshNotice("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(pageToLoad));
        params.set("limit", String(pagination.limit));

        if (search.trim()) params.set("search", search.trim());
        if (status !== "TODOS") params.set("status", status);
        if (etapaRegua !== "TODAS") params.set("etapaRegua", etapaRegua);
        if (dataInicio) params.set("dataInicio", dataInicio);
        if (dataFim) params.set("dataFim", dataFim);

        const response = await fetch(`/api/lotes?${params.toString()}`);
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Falha ao carregar a lista de lotes.");
        if (!result || (!Array.isArray(result.data) && !Array.isArray(result))) {
          throw new Error("O servidor retornou uma resposta inv\u00e1lida para a lista de lotes.");
        }

        const nextLots: Lot[] = result.data ?? (Array.isArray(result) ? result : []);
        const nextPagination: PaginationMeta = result.data
          ? result.pagination
          : { page: 1, limit: 10, total: nextLots.length, totalPages: 1 };
        const hasChanges =
          JSON.stringify(lots) !== JSON.stringify(nextLots) ||
          JSON.stringify(pagination) !== JSON.stringify(nextPagination);

        setLots(nextLots);
        setPagination(nextPagination);
        return hasChanges;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Erro inesperado.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [pagination, lots, search, status, etapaRegua, dataInicio, dataFim]
  );

  async function refreshLots() {
    const hasChanges = await fetchLots(pagination.page);
    if (hasChanges === null) return;
    setRefreshNotice(
      hasChanges
        ? "Lista atualizada com novos dados."
        : "Nenhuma alteração encontrada. A lista já está atualizada."
    );
  }
  useEffect(() => {
    let cancelled = false;

    async function loadLots() {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", String(pagination.limit));
      if (search.trim()) params.set("search", search.trim());
      if (status !== "TODOS") params.set("status", status);
      if (etapaRegua !== "TODAS") params.set("etapaRegua", etapaRegua);
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim) params.set("dataFim", dataFim);

      try {
        const response = await fetch(`/api/lotes?${params.toString()}`);
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Falha ao carregar a lista de lotes.");
        if (!result || (!Array.isArray(result.data) && !Array.isArray(result))) {
          throw new Error("O servidor retornou uma resposta inv\u00e1lida para a lista de lotes.");
        }
        if (cancelled) return;

        if (result.data) {
          setLots(result.data);
          setPagination(result.pagination);
        } else if (Array.isArray(result)) {
          setLots(result);
          setPagination({ page: 1, limit: 10, total: result.length, totalPages: 1 });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro inesperado.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLots();
    return () => {
      cancelled = true;
    };
  }, [pagination.limit, search, status, etapaRegua, dataInicio, dataFim]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchLots(1);
  }

  function handleResetFilters() {
    setSearch("");
    setStatus("TODOS");
    setEtapaRegua("TODAS");
    setDataInicio("");
    setDataFim("");
  }

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Gestão Financeira · Cobrança e Conciliação</span>
          <h1>Lotes de Pedágios</h1>
          <p>
            Acompanhe o status diário dos pagamentos, confirmações de recebimento e histórico da régua de cobrança.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="button secondary refresh-icon-button"
            onClick={() => void refreshLots()}
            disabled={loading}
            title={loading ? "Atualizando lista de lotes" : "Atualizar lista de lotes"}
            aria-label={loading ? "Atualizando lista de lotes" : "Atualizar lista de lotes"}
          >
            <svg className={loading ? "spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link className="button primary" href="/compilacao">
            + Compilar novo lote
          </Link>
        </div>
      </header>

      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {refreshNotice && <div className="notice" role="status">{refreshNotice}</div>}

      <section className="panel" style={{ padding: "20px 24px" }}>
        {/* Formulário de Busca e Filtros */}
        <form onSubmit={handleFilterSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px",
              alignItems: "flex-end",
            }}
          >
            <label className="search-field" style={{ minWidth: "220px" }}>
              Buscar Contrato, CPF ou Lote
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ex: LOC-2026, CPF, #1045..."
              />
            </label>

            <label className="filter-field">
              Status da Cobrança
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="TODOS">Todos os status</option>
                <option value="PAGO">Pago / Liquidado</option>
                <option value="EM_REGUA">Em régua ativa</option>
                <option value="INADIMPLENTE">Inadimplente</option>
                <option value="PENDENTE">Pendente</option>
              </select>
            </label>

            <label className="filter-field">
              Etapa da Régua
              <select value={etapaRegua} onChange={(e) => setEtapaRegua(e.target.value)}>
                <option value="TODAS">Todas as etapas</option>
                <option value="D0">D+0 (Emissão / Link Adyen)</option>
                <option value="D5">D+5 (1ª Tentativa Débito)</option>
                <option value="D7">D+7 (Lembrete Ativo)</option>
                <option value="D10">D+10 (2ª Tentativa / Negativação)</option>
              </select>
            </label>

            <label className="filter-field">
              Data de Emissão (De)
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </label>

            <label className="filter-field">
              Data de Emissão (Até)
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "16px",
              paddingTop: "14px",
              borderTop: "1px solid var(--line)",
            }}
          >
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              {loading
                ? "Buscando dados..."
                : `Exibindo ${lots.length} de ${pagination.total} lote(s) encontrado(s)`}
            </span>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="button secondary"
                onClick={handleResetFilters}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                Limpar Filtros
              </button>
              <button
                type="submit"
                className="button primary"
                style={{ fontSize: "12px", padding: "6px 16px" }}
              >
                Filtrar Resultados
              </button>
            </div>
          </div>
        </form>

        {/* Tabela de Lotes */}
        <div className="table-wrap" style={{ marginTop: "18px" }}>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Contrato</th>
                <th>CPF do Cliente</th>
                <th>Passagens</th>
                <th>Valor Cobrado</th>
                <th>Etapa</th>
                <th>Status Atual</th>
                <th>Data de Emissão</th>
                <th>Data do Pagamento</th>
                <th style={{ textAlign: "right" }}>Ações</th>
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
                    <td>{l.cpfCliente ? maskCpf(l.cpfCliente) : "—"}</td>
                    <td>{l.quantidadePassagens} pedágio(s)</td>
                    <td className="strong">{money(l.valorFinalCentavos)}</td>
                    <td>
                      <span
                        className="nav-badge"
                        style={{ fontSize: "10px", padding: "2px 8px" }}
                      >
                        {l.etapaRegua}
                      </span>
                    </td>
                    <td>
                      <span className={`status status-${l.status.toLowerCase()}`}>
                        {l.status === "PAGO" ? "✓ PAGO" : l.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>{new Date(l.dataCriacao).toLocaleDateString("pt-BR")}</td>
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
                        Detalhes →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={10} style={{ padding: "40px", textAlign: "center" }}>
                    {loading
                      ? "Carregando lotes de cobrança..."
                      : "Nenhum lote de pedágio encontrado para os filtros selecionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginação */}
        {pagination.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "20px",
              paddingTop: "14px",
              borderTop: "1px solid var(--line)",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>
              Página <strong>{pagination.page}</strong> de{" "}
              <strong>{pagination.totalPages}</strong> ({pagination.total} registros no total)
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                className="button secondary"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchLots(pagination.page - 1)}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                ← Anterior
              </button>

              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === pagination.totalPages ||
                    Math.abs(p - pagination.page) <= 1
                )
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: "inline-flex", alignItems: "center" }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span style={{ padding: "0 4px", color: "var(--muted)" }}>…</span>
                    )}
                    <button
                      type="button"
                      className={`button ${pagination.page === p ? "primary" : "secondary"}`}
                      onClick={() => fetchLots(p)}
                      style={{
                        minWidth: "32px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: pagination.page === p ? 700 : 500,
                      }}
                    >
                      {p}
                    </button>
                  </span>
                ))}

              <button
                type="button"
                className="button secondary"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchLots(pagination.page + 1)}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
