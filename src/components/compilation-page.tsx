"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100
  );

export function CompilationPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role || "viewer";
  const isViewer = !session?.user || role !== "admin";

  const [all, setAll] = useState<Passage[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fee, setFee] = useState("0,00");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/passagens/pendentes")
      .then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível carregar as passagens pendentes.");
        setAll(await r.json());
      })
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false));
  }, []);

  const passages = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return all.filter((p) => {
      const date = p.dataHora.slice(0, 10);
      return (
        (!q ||
          [p.placa, p.praca, p.rodovia, p.numeroContrato, p.lojaRetirada].some((v) =>
            v.toLocaleLowerCase("pt-BR").includes(q)
          )) &&
        (!from || date >= from) &&
        (!to || date <= to)
      );
    });
  }, [all, query, from, to]);

  const contracts = new Set(
    all
      .filter((p) => selected.includes(p.id))
      .map((p) => `${p.numeroContrato}:${p.cpfCliente}`)
  );

  const total = all
    .filter((p) => selected.includes(p.id))
    .reduce((s, p) => s + p.valorCentavos, 0);

  const feeCentavos = Math.round((Number(fee.replace(",", ".")) || 0) * 100);
  const finalTotal = total + feeCentavos;

  async function syncConectCar() {
    setSyncing(true);
    setNotice("");
    try {
      const r = await fetch("/api/passagens/sincronizar", {
        method: "POST",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Erro na sincronização.");
      setNotice(
        `Sincronização ConectCar concluída: ${body.importadas} importadas, ${body.semContrato} sem contrato, ${body.contratosSobrepostos} com locações sobrepostas e ${body.jaEmLote} já faturadas.`
      );
      const refreshed = await fetch("/api/passagens/pendentes");
      if (refreshed.ok) setAll(await refreshed.json());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao sincronizar com ConectCar.");
    } finally {
      setSyncing(false);
    }
  }

  async function compile() {
    const feeValue = Number(fee.replace(",", "."));
    if (
      !selected.length ||
      contracts.size !== 1 ||
      !Number.isFinite(feeValue) ||
      feeValue < 0
    ) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/lotes/compilar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passagemIds: selected,
          taxaCentavos: feeCentavos,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Erro ao compilar lote.");
      setNotice(
        `Lote #${body.id} criado. Confira o historico para ver os resultados das integracoes.`
      );
      setSelected([]);
      setAll((items) => items.filter((p) => !selected.includes(p.id)));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao compilar lote.");
    } finally {
      setBusy(false);
    }
  }

  const toggleSelectAll = () => {
    if (selected.length === passages.length) {
      setSelected([]);
    } else {
      setSelected(passages.map((p) => p.id));
    }
  };

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Operação · Faturamento</span>
          <h1>Compilar Passagens</h1>
          <p>
            Selecione as passagens do mesmo contrato de locação para formar um lote e iniciar a régua D+0.
          </p>
        </div>
        <Link className="button secondary" href="/lotes">
          Ver lotes emitidos →
        </Link>
      </header>

      {notice && (
        <div
          className={`notice ${notice.includes("Falha") || notice.includes("Erro") ? "error-notice" : ""}`}
          role="status"
        >
          {notice}
        </div>
      )}

      {isViewer && (
        <div
          className="selection-summary"
          style={{
            background: "#F3F4F6",
            borderColor: "var(--line)",
            color: "var(--ink-secondary)",
            marginBottom: "20px",
          }}
        >
          👁️ <strong>Perfil de Visualização:</strong> Você possui acesso em modo somente leitura. A compilação de lotes e a sincronização com a ConectCar são restritas ao perfil <strong>Administrador</strong>.
        </div>
      )}

      <section className="panel sync-panel">
        <div>
          <h2>Sincronização ConectCar</h2>
          <p>
            Importa passagens da concessionária e correlaciona placa, data e hora com o sistema Coral.
          </p>
        </div>
        <div className="sync-controls">
          <button className="button secondary" disabled={syncing || isViewer}
            title={isViewer ? "Acesso restrito a administradores" : undefined}
            onClick={() => void syncConectCar()}>
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            Buscar por contrato, placa, praça ou loja
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: LOC-1234, ABC1D23, Praça 12..."
            />
          </label>
          <label className="filter-field">
            Data Inicial
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="filter-field">
            Data Final
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="fee-field">
            Taxa Adm (R$)
            <input
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <button
            className="button primary"
            disabled={!selected.length || contracts.size !== 1 || busy || isViewer}
            title={isViewer ? "Ação restrita ao perfil Administrador" : undefined}
            onClick={() => void compile()}
          >
            {busy ? "Compilando…" : isViewer ? "Apenas Administrador pode compilar" : `Compilar lote (${selected.length})`}
          </button>
        </div>

        {selected.length > 0 && (
          <div className="selection-summary">
            Selecionadas: <strong>{selected.length}</strong> passagem(ns) · 
            Pedágios: <strong>{money(total)}</strong> · 
            Taxa Administrativa: <strong>{money(feeCentavos)}</strong> · 
            Total do Lote: <strong>{money(finalTotal)}</strong>
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
                  <input
                    type="checkbox"
                    checked={passages.length > 0 && selected.length === passages.length}
                    aria-label="Selecionar todas as passagens"
                    onChange={toggleSelectAll}
                  />
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
                        checked={selected.includes(p.id)}
                        aria-label={`Selecionar passagem ${p.id}`}
                        onChange={() =>
                          setSelected((s) =>
                            s.includes(p.id)
                              ? s.filter((id) => id !== p.id)
                              : [...s, p.id]
                          )
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
                    {loading
                      ? "Carregando passagens pendentes..."
                      : "Nenhuma passagem pendente encontrada com os filtros selecionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
