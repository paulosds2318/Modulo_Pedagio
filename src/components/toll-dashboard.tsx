"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

export function TollDashboard() {
  const [passages, setPassages] = useState(0);
  const [lots, setLots] = useState<Lot[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Filtros rápidos da Visão Geral
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/passagens/pendentes"), fetch("/api/lotes")])
      .then(async ([p, l]) => {
        if (!p.ok || !l.ok) {
          throw new Error(
            "Não foi possível carregar os dados de pedágio. Verifique a conexão com o banco de dados."
          );
        }
        const lotsData = await l.json();
        setPassages((await p.json()).length);
        setLots(Array.isArray(lotsData) ? lotsData : (lotsData.data || []));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openLots = lots.filter((lot) => lot.status === "EM_REGUA");
  const paidLots = lots.filter((lot) => lot.status === "PAGO");
  const outstanding = lots
    .filter((lot) => lot.status !== "PAGO")
    .reduce((sum, lot) => sum + lot.valorFinalCentavos, 0);

  // Filtragem rápida local dos lotes
  const filteredLots = useMemo(() => {
    return lots.filter((l) => {
      const matchSearch =
        !search.trim() ||
        l.numeroContrato.toLowerCase().includes(search.toLowerCase()) ||
        String(l.id).includes(search);

      const matchStatus = statusFilter === "TODOS" || l.status === statusFilter;

      const matchDate =
        !dateFilter ||
        l.dataCriacao.slice(0, 10) === dateFilter ||
        (l.dataPagamento && l.dataPagamento.slice(0, 10) === dateFilter);

      return matchSearch && matchStatus && matchDate;
    });
  }, [lots, search, statusFilter, dateFilter]);

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">
            Foco Aluguel de Carros · Módulo de Pedágios
          </span>
          <h1>Visão Geral da Operação</h1>
          <p>
            Monitoramento diario de passagens, conciliacao de pagamentos e esteira de cobranca.
          </p>
        </div>
        <Link className="button primary" href="/compilacao">
          + Compilar passagens
        </Link>
      </header>

      {error && <div className="notice error-notice">{error}</div>}

      <section className="summary">
        <article>
          <span>Passagens Pendentes</span>
          <strong>{loading ? "…" : passages}</strong>
          <small>Aguardando compilação de lote</small>
        </article>

        <article>
          <span>Lotes em Cobrança</span>
          <strong>{loading ? "…" : openLots.length}</strong>
          <small>Régua ativa (D+0 a D+10)</small>
        </article>

        <article>
          <span>Valor em Aberto</span>
          <strong>{loading ? "…" : money(outstanding)}</strong>
          <small>
            {paidLots.length} lote{paidLots.length === 1 ? "" : "s"} já liquidado{paidLots.length === 1 ? "" : "s"}
          </small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2>Lotes Gerados na Operação</h2>
            <p>Filtragem rápida e acompanhamento diário com data de emissão e liquidação.</p>
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
              {filteredLots.length ? (
                filteredLots.slice(0, 10).map((l) => (
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
                    {loading
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
      </section>
    </main>
  );
}
