"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Lot = {
  id: number;
  numeroContrato: string;
  quantidadePassagens: number;
  valorFinalCentavos: number;
  status: string;
  etapaRegua: string;
  dataCriacao: string;
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

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">
            Foco Aluguel de Carros · Módulo de Pedágios
          </span>
          <h1>Visão Geral da Operação</h1>
          <p>
            Monitoramento em tempo real de passagens ConectCar, compilação de lotes e execução da régua.
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
          <small>Disponíveis para formação de lote</small>
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
        <div className="panel-head">
          <div>
            <h2>Últimos Lotes Gerados</h2>
            <p>Acesse o detalhe de cada lote para auditar a timeline e ações da régua.</p>
          </div>
          <Link href="/lotes" className="button secondary">
            Ver todos os lotes →
          </Link>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Contrato</th>
                <th>Qtd. Passagens</th>
                <th>Valor Total</th>
                <th>Etapa Régua</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {lots.slice(0, 8).length ? (
                lots.slice(0, 8).map((l) => (
                  <tr key={l.id}>
                    <td className="strong">#{l.id}</td>
                    <td>
                      <span className="strong">{l.numeroContrato}</span>
                    </td>
                    <td>{l.quantidadePassagens} pedágio(s)</td>
                    <td className="strong">{money(l.valorFinalCentavos)}</td>
                    <td>
                      <span className="nav-badge" style={{ fontSize: "10px", padding: "2px 8px" }}>
                        {l.etapaRegua}
                      </span>
                    </td>
                    <td>
                      <span className={`status status-${l.status.toLowerCase()}`}>
                        {l.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      <Link href={`/lotes/${l.id}`} style={{ fontWeight: 700 }}>
                        Ver detalhes →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">
                    {loading ? "Carregando lotes..." : "Nenhum lote compilado até o momento."}
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
          <span>Filtre as passagens importadas da ConectCar e gere um novo lote para faturamento.</span>
        </Link>
        <Link className="quick-link" href="/lotes">
          <strong>Acompanhar Régua de Cobrança</strong>
          <span>Consulte o histórico de envios, links Adyen ativos e baixas manuais auditadas.</span>
        </Link>
      </section>
    </main>
  );
}
