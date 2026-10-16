"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Entry = {
  id: number;
  etapa: string;
  acao: string;
  canal: string;
  resultado: string;
  detalhesResposta: string | null;
  dataHora: string;
};

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
  passagens: {
    id: number;
    placa: string;
    praca: string;
    rodovia: string;
    dataHora: string;
    valorCentavos: number;
  }[];
  logs: Entry[];
};

const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100
  );

const stages = [
  { key: "D0", label: "D+0: Emissão e Link Adyen", desc: "Envio de link Pay-by-link via e-mail e WhatsApp" },
  { key: "D5", label: "D+5: 1ª Tentativa no Cartão", desc: "Débito automático no cartão tokenizado (Coral)" },
  { key: "D7", label: "D+7: Lembrete Ativo", desc: "Mensagem de alerta e aviso via WhatsApp" },
  { key: "D10", label: "D+10: 2ª Tentativa no Cartão", desc: "Última tentativa de débito ou negativação" },
];

export function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const [lot, setLot] = useState<Lot | null>(null);
  const [error, setError] = useState("");
  const [opsToken, setOpsToken] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const r = await fetch(`/api/lotes/${params.id}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Erro ao carregar detalhes do lote.");
    setLot(data);
  }

  useEffect(() => {
    void reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function settle(status: "PAGO" | "INADIMPLENTE") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/lotes/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-ops-token": opsToken,
        },
        body: JSON.stringify({ status, nota: note }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao liquidar lote.");
      setNote("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar lote.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !lot) {
    return (
      <main className="shell">
        <p style={{ color: "var(--muted)", padding: "40px 0" }}>Carregando dados do lote #{params.id}…</p>
      </main>
    );
  }

  if (!lot) {
    return (
      <main className="shell">
        <div className="notice error-notice">
          {error || `Lote #${params.id} não foi encontrado.`}
        </div>
        <Link href="/lotes" className="button secondary">
          ← Voltar para a lista de lotes
        </Link>
      </main>
    );
  }

  const logStages = new Set(lot.logs.map((x) => x.etapa));

  return (
    <main className="shell">
      <div className="backline">
        <Link href="/lotes">← Voltar para Lotes</Link>
        <span>/</span>
        <span>Lote #{lot.id}</span>
      </div>

      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Contrato Coral: {lot.numeroContrato}</span>
          <h1>Lote #{lot.id} de Pedágios</h1>
          <p>
            Gerado em {new Date(lot.dataCriacao).toLocaleString("pt-BR")} · {lot.quantidadePassagens} passagem(ns) vinculada(s)
            {lot.dataPagamento && ` · Pago em ${new Date(lot.dataPagamento).toLocaleString("pt-BR")}`}
          </p>
        </div>
        <span className={`status status-${lot.status.toLowerCase()}`}>
          {lot.status.replaceAll("_", " ")}
        </span>
      </header>

      {error && <div className="notice error-notice">{error}</div>}

      <section className="summary">
        <article>
          <span>Soma dos Pedágios</span>
          <strong>{money(lot.valorTotalCentavos)}</strong>
          <small>{lot.quantidadePassagens} passagem(ns)</small>
        </article>

        <article>
          <span>Taxa Administrativa</span>
          <strong>{money(lot.taxaCentavos)}</strong>
          <small>Processamento operacional</small>
        </article>

        <article>
          <span>Total da Cobrança</span>
          <strong>{money(lot.valorFinalCentavos)}</strong>
          <small>Valor final faturado</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Régua de Cobrança Automatizada</h2>
            <p>Acompanhamento das etapas D+0 a D+10 executadas pelo motor de cobrança.</p>
          </div>
          {lot.adyenPaymentUrl && lot.status !== "PAGO" && (
            <a
              className="button primary"
              href={lot.adyenPaymentUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir Link Adyen (Pay-by-Link) ↗
            </a>
          )}
        </div>

        <div className="timeline">
          {stages.map((stg) => {
            const isDone = logStages.has(stg.key) || lot.etapaRegua === stg.key;
            return (
              <div
                className={`timeline-step ${isDone ? "done" : ""}`}
                key={stg.key}
              >
                <span className="timeline-dot" />
                <strong>{stg.label}</strong>
                <small>{stg.desc}</small>
              </div>
            );
          })}
        </div>

        <div className="event-list">
          <h3 style={{ fontSize: "14px", margin: "16px 0 12px" }}>
            Histórico de Eventos e Auditoria
          </h3>
          {lot.logs.length ? (
            lot.logs.map((entry) => (
              <article className="event" key={entry.id}>
                <div>
                  <strong>{entry.acao.replaceAll("_", " ")}</strong>
                  <span>
                    Etapa: <strong>{entry.etapa}</strong> · Canal: {entry.canal} · Resultado: <strong>{entry.resultado}</strong>
                  </span>
                  {entry.detalhesResposta && (
                    <small>{entry.detalhesResposta}</small>
                  )}
                </div>
                <time>{new Date(entry.dataHora).toLocaleString("pt-BR")}</time>
              </article>
            ))
          ) : (
            <p className="empty">Nenhum evento registrado até o momento.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Passagens Vinculadas ao Lote</h2>
            <p>
              Cliente CPF: <span className="strong">{lot.cpfCliente}</span>
              {lot.telefoneCliente && ` · Telefone: ${lot.telefoneCliente}`}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data e Hora</th>
                <th>Veículo (Placa)</th>
                <th>Praça</th>
                <th>Rodovia</th>
                <th>Valor do Pedágio</th>
              </tr>
            </thead>
            <tbody>
              {lot.passagens.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.dataHora).toLocaleString("pt-BR")}</td>
                  <td>
                    <span className="strong" style={{ fontFamily: "monospace" }}>
                      {p.placa}
                    </span>
                  </td>
                  <td className="strong">{p.praca}</td>
                  <td>{p.rodovia}</td>
                  <td className="strong">{money(p.valorCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Baixa Manual e Encerramento de Cobrança</h2>
            <p className="muted">
              Permite a baixa administrativa do lote (ex: pagamento efetuado diretamente na loja ou negociação direta).
            </p>
          </div>
        </div>

        <p className="muted" style={{ marginBottom: "12px", fontSize: "12px" }}>
          Esta ação exige o token operacional configurado em <code>OPERATIONS_API_TOKEN</code> e justificativa obrigatória registrada em auditoria.
        </p>

        <div className="manual-form">
          <input
            type="password"
            value={opsToken}
            onChange={(e) => setOpsToken(e.target.value)}
            placeholder="Token operacional de autorização"
            autoComplete="off"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Justificativa da baixa manual (mínimo 3 caracteres)"
            maxLength={500}
          />
          <button
            className="button primary"
            disabled={busy || !opsToken || note.trim().length < 3 || lot.status === "PAGO"}
            onClick={() => void settle("PAGO")}
          >
            {busy ? "Processando…" : "Registrar como Pago"}
          </button>
          <button
            className="button secondary"
            disabled={busy || !opsToken || note.trim().length < 3 || lot.status === "INADIMPLENTE"}
            onClick={() => void settle("INADIMPLENTE")}
          >
            {busy ? "Processando…" : "Encerrar como Inadimplente"}
          </button>
        </div>
      </section>
    </main>
  );
}
