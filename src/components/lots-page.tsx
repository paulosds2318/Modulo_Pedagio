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
  adyenPaymentUrl: string | null;
  dataCriacao: string;
};

const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100
  );

export function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/lotes")
      .then(async (r) => {
        if (!r.ok) throw new Error("Falha ao carregar a lista de lotes.");
        setLots(await r.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () =>
      lots.filter(
        (l) =>
          (status === "TODOS" || l.status === status) &&
          (!filter ||
            `${l.numeroContrato} ${l.id}`
              .toLocaleLowerCase()
              .includes(filter.toLocaleLowerCase()))
      ),
    [lots, filter, status]
  );

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Gestão Financeira · Cobrança</span>
          <h1>Lotes de Pedágios</h1>
          <p>
            Acompanhe o status dos pagamentos, links Pay-by-Link da Adyen e evolução da régua de cobrança.
          </p>
        </div>
        <Link className="button primary" href="/compilacao">
          + Compilar novo lote
        </Link>
      </header>

      {error && <div className="notice error-notice">{error}</div>}

      <section className="panel">
        <div className="panel-head" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <div className="filter-bar" style={{ width: "100%", marginBottom: 0 }}>
            <label className="search-field">
              Buscar contrato ou número do lote
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Ex: LOC-1234, #12..."
              />
            </label>
            <label className="filter-field">
              Status da Cobrança
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="TODOS">Todos os status</option>
                <option value="EM_REGUA">Em régua ativa</option>
                <option value="PAGO">Pago / Liquidado</option>
                <option value="INADIMPLENTE">Inadimplente</option>
                <option value="PENDENTE">Pendente</option>
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: "16px" }}>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Contrato</th>
                <th>Passagens</th>
                <th>Total do Lote</th>
                <th>Etapa da Régua</th>
                <th>Status</th>
                <th>Data de Emissão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map((l) => (
                  <tr key={l.id}>
                    <td className="strong">#{l.id}</td>
                    <td>
                      <span className="strong">{l.numeroContrato}</span>
                    </td>
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
                        {l.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>{new Date(l.dataCriacao).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <Link href={`/lotes/${l.id}`} style={{ fontWeight: 700 }}>
                        Detalhes da cobrança →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={8}>
                    {loading
                      ? "Carregando lotes..."
                      : "Nenhum lote encontrado com os critérios de busca."}
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
