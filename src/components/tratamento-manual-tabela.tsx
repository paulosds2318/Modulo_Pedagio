"use client";
import Link from "next/link";
import { useState } from "react";

export type LoteManual = {
  id: number;
  numeroContrato: string;
  nome: string | null;
  cpf: string;
  telefone: string | null;
  valorCentavos: number;
  passagens: number;
  emitidoEm: string;
  encerradoEm: string | null;
};

type Resultado = { loteId: number; ok: boolean; linkId?: number; url?: string; valorCentavos?: number; erro?: string };

const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/** Lotes em tratamento manual: gera links de pagamento por lote ou em lote (somente administradores). */
export function TratamentoManualTabela({ lotes, isAdmin, vazio }: { lotes: LoteManual[]; isAdmin: boolean; vazio: string }) {
  const [marcados, setMarcados] = useState<number[]>([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [copiado, setCopiado] = useState<number | null>(null);

  const todos = lotes.length > 0 && lotes.every((l) => marcados.includes(l.id));

  async function gerar(ids: number[]) {
    if (!ids.length) return;
    const total = lotes.filter((l) => ids.includes(l.id)).reduce((soma, l) => soma + l.valorCentavos, 0);
    const texto = ids.length === 1 ? `Gerar o link de pagamento do lote #${ids[0]} (${money(total)})?` : `Gerar ${ids.length} links de pagamento, um por lote, no total de ${money(total)}?`;
    if (!window.confirm(texto)) return;
    setGerando(true);
    setErro("");
    try {
      const response = await fetch("/api/links/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loteIds: ids }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Não foi possível gerar os links.");
      setResultados(data.resultados as Resultado[]);
      setMarcados([]);
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : "Erro ao gerar os links.");
    } finally {
      setGerando(false);
    }
  }

  async function copiar(r: Resultado) {
    if (!r.url) return;
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiado(r.loteId);
      window.setTimeout(() => setCopiado((atual) => (atual === r.loteId ? null : atual)), 2000);
    } catch {
      setErro("Não foi possível copiar. Abra o link e copie o endereço pelo navegador.");
    }
  }

  return (
    <>
      {isAdmin && lotes.length > 0 && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "0 0 12px" }}>
          <button type="button" className="button primary" disabled={gerando || marcados.length === 0} onClick={() => void gerar(marcados)}>
            {gerando ? "Gerando…" : `Gerar links dos selecionados (${marcados.length})`}
          </button>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            Cada lote recebe um link com todas as passagens em aberto. Para escolher só algumas passagens, abra o lote.
          </span>
        </div>
      )}
      {erro && <div className="notice error-notice" role="alert">{erro}</div>}

      {resultados.length > 0 && (
        <div className="notice" role="status" style={{ marginBottom: 12 }}>
          <strong>
            {resultados.filter((r) => r.ok).length} de {resultados.length} link(s) gerado(s).
          </strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {resultados.map((r) => (
              <li key={r.loteId}>
                <Link href={`/lotes/${r.loteId}#links`}>Lote #{r.loteId}</Link>
                {r.ok ? (
                  <>
                    {" · "}
                    {money(r.valorCentavos ?? 0)}
                    {" · "}
                    <button type="button" className="button secondary" onClick={() => void copiar(r)}>
                      {copiado === r.loteId ? "Copiado!" : "Copiar link"}
                    </button>{" "}
                    <a href={r.url} target="_blank" rel="noreferrer">
                      Abrir ↗
                    </a>
                  </>
                ) : (
                  <span style={{ color: "var(--foco-red)" }}> · {r.erro}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              {isAdmin && (
                <th>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os lotes da página"
                    checked={todos}
                    onChange={(e) => setMarcados(e.target.checked ? lotes.map((l) => l.id) : [])}
                  />
                </th>
              )}
              <th>Lote</th>
              <th>Cliente</th>
              <th>Contato</th>
              <th>Passagens</th>
              <th>Valor</th>
              <th>Emitido em</th>
              <th>Régua encerrada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id}>
                {isAdmin && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar o lote ${l.id}`}
                      checked={marcados.includes(l.id)}
                      onChange={(e) => setMarcados((atual) => (e.target.checked ? [...atual, l.id] : atual.filter((i) => i !== l.id)))}
                    />
                  </td>
                )}
                <td className="strong">
                  #{l.id}
                  <span className="subcell">{l.numeroContrato}</span>
                </td>
                <td>
                  {l.nome || "—"}
                  <span className="subcell">CPF {l.cpf}</span>
                </td>
                <td>{l.telefone || "—"}</td>
                <td>{l.passagens}</td>
                <td className="strong">{money(l.valorCentavos)}</td>
                <td>{l.emitidoEm}</td>
                <td>{l.encerradoEm ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {isAdmin && (
                    <button type="button" className="button secondary" disabled={gerando} onClick={() => void gerar([l.id])}>
                      Gerar link
                    </button>
                  )}{" "}
                  <Link href={`/lotes/${l.id}`}>Abrir →</Link>
                </td>
              </tr>
            ))}
            {!lotes.length && (
              <tr>
                <td className="empty" colSpan={isAdmin ? 9 : 8}>
                  {vazio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
