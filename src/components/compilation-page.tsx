"use client";

import { BackToHome } from "@/components/back-to-home";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";

type Passage = {
  id: number;
  numeroContrato: string;
  cpfCliente: string;
  placa: string;
  praca: string;
  rodovia: string;
  dataHora: string;
  valorCentavos: number;
  lojaRetirada: string;
};
type PageResult = { data: Passage[]; pagination: { page: number; limit: number; total: number; totalPages: number }; totalValorCentavos: number };

const PAGE_SIZE = 50;
const MAX_DIAS_SINCRONIZACAO = 31;
const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

async function fetchPendentes(page: number, search: string, de: string, ate: string): Promise<PageResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search.trim()) params.set("search", search.trim());
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);
  const response = await fetch(`/api/passagens/pendentes?${params}`, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.data)) throw new Error(body?.error || "Não foi possível carregar as passagens pendentes.");
  return body;
}

export function CompilationPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role || "viewer";
  const isViewer = !session?.user || (role !== "admin" && role !== "master");

  const [result, setResult] = useState<PageResult | null>(null);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  // Seleção guarda as passagens inteiras, para funcionar entre páginas.
  const [selected, setSelected] = useState<Record<number, Passage>>({});
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fee, setFee] = useState("0,00");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshNotice, setRefreshNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncDe, setSyncDe] = useState("");
  const [syncAte, setSyncAte] = useState("");

  // Lista: espera a digitação parar (300 ms) antes de consultar o servidor.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchPendentes(page, query, from, to)
        .then((next) => {
          if (!active) return;
          setResult(next);
          if (page > next.pagination.totalPages) setPage(next.pagination.totalPages);
        })
        .catch((e) => active && setNotice(e instanceof Error ? e.message : "Erro ao carregar as passagens."))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, query, from, to, reloadKey]);

  const passages = result?.data ?? [];
  const selectedList = Object.values(selected);
  const contracts = new Set(selectedList.map((p) => `${p.numeroContrato}:${p.cpfCliente}`));
  const total = selectedList.reduce((s, p) => s + p.valorCentavos, 0);
  const feeCentavos = Math.round((Number(fee.replace(",", ".")) || 0) * 100);
  const finalTotal = total + feeCentavos;
  const pageAllSelected = passages.length > 0 && passages.every((p) => selected[p.id]);

  function changeFilter(update: () => void) {
    update();
    setPage(1);
  }

  function refreshPassages() {
    setRefreshError("");
    setRefreshNotice("Passagens pendentes atualizadas.");
    setReloadKey((k) => k + 1);
  }

  async function syncFromCoral() {
    setRefreshError("");
    if (Boolean(syncDe) !== Boolean(syncAte)) return setRefreshError("Para escolher o período, informe as duas datas (De e Até).");
    if (syncDe && syncAte) {
      const dias = (new Date(`${syncAte}T00:00:00Z`).getTime() - new Date(`${syncDe}T00:00:00Z`).getTime()) / 86_400_000;
      if (dias < 0) return setRefreshError("A data inicial precisa ser anterior à final.");
      if (dias > MAX_DIAS_SINCRONIZACAO) return setRefreshError(`O Coral aceita no máximo ${MAX_DIAS_SINCRONIZACAO} dias por consulta.`);
    }
    setSyncing(true);
    setRefreshNotice(syncDe ? `Consultando passagens no Coral de ${syncDe.split("-").reverse().join("/")} a ${syncAte.split("-").reverse().join("/")}...` : "Consultando passagens no Coral (últimos dias)...");
    try {
      const response = await fetch("/api/passagens/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncDe ? { startDate: syncDe, endDate: syncAte } : {}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Falha ao sincronizar com o Coral.");
      setRefreshNotice(
        `Coral (${body.periodo.startDate.split("-").reverse().join("/")} a ${body.periodo.endDate.split("-").reverse().join("/")}): ` +
          `${body.recebidas} recebidas, ${body.importadas} novas, ${body.duplicadas} já existentes, ` +
          `${body.lotesCompilados} lote(s) compilado(s), ${body.rejeitadas} rejeitada(s) por dados inválidos.`
      );
      setReloadKey((k) => k + 1);
    } catch (cause) {
      setRefreshNotice("");
      setRefreshError(cause instanceof Error ? cause.message : "Falha ao sincronizar com o Coral.");
    } finally {
      setSyncing(false);
    }
  }

  async function compile() {
    const feeValue = Number(fee.replace(",", "."));
    if (!selectedList.length || contracts.size !== 1 || !Number.isFinite(feeValue) || feeValue < 0) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/lotes/compilar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passagemIds: selectedList.map((p) => p.id), taxaCentavos: feeCentavos }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Erro ao compilar lote.");
      setNotice(`Lote #${body.id} criado. Confira o histórico para ver os resultados das integrações.`);
      setSelected({});
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao compilar lote.");
    } finally {
      setBusy(false);
    }
  }

  const toggleSelectPage = () => {
    setSelected((current) => {
      const next = { ...current };
      if (pageAllSelected) for (const p of passages) delete next[p.id];
      else for (const p of passages) next[p.id] = p;
      return next;
    });
  };

  const pagination = result?.pagination;

  return (
    <main className="shell">
      <BackToHome />
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Operação · Faturamento</span>
          <h1>Compilar Passagens</h1>
          <p>
            As passagens do Coral são compiladas automaticamente ao chegar. Use esta tela para revisar e compilar manualmente grupos que ficaram pendentes por erro.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="button secondary refresh-icon-button"
            onClick={refreshPassages}
            disabled={loading}
            title={loading ? "Atualizando passagens pendentes" : "Atualizar passagens pendentes"}
            aria-label={loading ? "Atualizando passagens pendentes" : "Atualizar passagens pendentes"}
          >
            <svg className={loading ? "spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link className="button secondary" href="/lotes">
            Ver lotes emitidos &rarr;
          </Link>
        </div>
      </header>

      {notice && (
        <div className={`notice ${notice.includes("Falha") || notice.includes("Erro") ? "error-notice" : ""}`} role="status">
          {notice}
        </div>
      )}
      {refreshError && <div className="notice error-notice" role="alert">{refreshError}</div>}
      {refreshNotice && <div className="notice" role="status">{refreshNotice}</div>}
      {isViewer && (
        <div className="selection-summary" style={{ background: "#F3F4F6", borderColor: "var(--line)", color: "var(--ink-secondary)", marginBottom: "20px" }}>
          <strong>Perfil de visualização:</strong> Compilação de lotes disponível apenas para administradores.
        </div>
      )}

      {!isViewer && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Sincronizar com o Coral</h2>
              <p>
                Sem datas, busca os últimos dias (o mesmo que a rotina automática faz). Para buscar passagens antigas, informe o período, de no máximo {MAX_DIAS_SINCRONIZACAO} dias.
              </p>
            </div>
          </div>
          <div className="filter-bar" style={{ alignItems: "flex-end" }}>
            <label className="filter-field">
              De (opcional)
              <input type="date" value={syncDe} onChange={(e) => setSyncDe(e.target.value)} disabled={syncing} />
            </label>
            <label className="filter-field">
              Até (opcional)
              <input type="date" value={syncAte} onChange={(e) => setSyncAte(e.target.value)} disabled={syncing} />
            </label>
            <button type="button" className="button primary" onClick={() => void syncFromCoral()} disabled={syncing} title="Buscar passagens no Coral">
              {syncing ? "Sincronizando..." : "Sincronizar Coral"}
            </button>
            {(syncDe || syncAte) && !syncing && (
              <button type="button" className="button secondary" onClick={() => { setSyncDe(""); setSyncAte(""); }}>
                Limpar datas
              </button>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            Buscar por contrato, placa, praça ou loja
            <input value={query} onChange={(e) => changeFilter(() => setQuery(e.target.value))} placeholder="Ex: LOC-1234, ABC1D23, Praça 12..." />
          </label>
          <label className="filter-field">
            Data Inicial
            <input type="date" value={from} onChange={(e) => changeFilter(() => setFrom(e.target.value))} />
          </label>
          <label className="filter-field">
            Data Final
            <input type="date" value={to} onChange={(e) => changeFilter(() => setTo(e.target.value))} />
          </label>
          <label className="fee-field">
            Taxa Adm (R$)
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" />
          </label>
          <button
            className="button primary"
            disabled={!selectedList.length || contracts.size !== 1 || busy || isViewer}
            title={isViewer ? "Ação restrita ao perfil Administrador" : undefined}
            onClick={() => void compile()}
          >
            {busy ? "Compilando…" : isViewer ? "Apenas Administrador pode compilar" : `Compilar lote (${selectedList.length})`}
          </button>
        </div>

        {selectedList.length > 0 && (
          <div className="selection-summary">
            Selecionadas: <strong>{selectedList.length}</strong> passagem(ns) · Pedágios: <strong>{money(total)}</strong> · Taxa Administrativa:{" "}
            <strong>{money(feeCentavos)}</strong> · Total do Lote: <strong>{money(finalTotal)}</strong>
            {" · "}
            <button type="button" className="link-button" onClick={() => setSelected({})} style={{ background: "none", border: 0, color: "var(--foco-red)", cursor: "pointer", fontWeight: 600, padding: 0 }}>
              limpar seleção
            </button>
            {contracts.size > 1 && (
              <span style={{ display: "block", marginTop: "4px" }}>
                <strong>Atenção:</strong> Você selecionou passagens de mais de um contrato/cliente. Um lote só pode conter passagens de um único contrato.
              </span>
            )}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "40px" }}>
                  <input type="checkbox" checked={pageAllSelected} aria-label="Selecionar as passagens desta página" onChange={toggleSelectPage} />
                </th>
                <th>Contrato</th>
                <th>Veículo</th>
                <th>Praça / Rodovia</th>
                <th>Loja Retirada</th>
                <th>Data e Hora</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {passages.length ? (
                passages.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[p.id])}
                        aria-label={`Selecionar passagem ${p.id}`}
                        onChange={() =>
                          setSelected((s) => {
                            const next = { ...s };
                            if (next[p.id]) delete next[p.id];
                            else next[p.id] = p;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="strong">{p.numeroContrato}</td>
                    <td>
                      <span className="strong" style={{ fontFamily: "monospace" }}>
                        {p.placa}
                      </span>
                    </td>
                    <td>
                      {p.praca}
                      <span className="subcell">{p.rodovia}</span>
                    </td>
                    <td>{p.lojaRetirada}</td>
                    <td>{new Date(p.dataHora).toLocaleString("pt-BR")}</td>
                    <td className="strong">{money(p.valorCentavos)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">
                    {loading ? "Carregando passagens pendentes..." : "Nenhuma passagem pendente encontrada com os filtros selecionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="audit-pagination">
            <span>
              Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> · {pagination.total} passage{pagination.total === 1 ? "m" : "ns"} pendente
              {pagination.total === 1 ? "" : "s"} · {money(result?.totalValorCentavos ?? 0)}
            </span>
            {pagination.totalPages > 1 && (
              <div>
                <button type="button" className="button secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ← Anterior
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={page >= pagination.totalPages || loading}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  Próxima →
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
