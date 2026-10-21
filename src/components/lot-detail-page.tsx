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
  adyenLinkId: string | null;
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
const maskCpf = (cpf: string) => {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  }
  return cpf;
};
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
  const [queryingAdyen, setQueryingAdyen] = useState(false);
  const [queryMessage, setQueryMessage] = useState("");
  const [loading, setLoading] = useState(true);
  async function reload() {
    const response = await fetch(`/api/lotes/${params.id}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Erro ao carregar detalhes do lote.");
    setLot(data);
  }
  useEffect(() => {
    let cancelled = false;

    async function loadLot() {
      try {
        const response = await fetch(`/api/lotes/${params.id}`);
        let data;
        try {
          data = await response.json();
        } catch {
          throw new Error(`Servidor retornou status ${response.status} (${response.statusText})`);
        }
        if (!response.ok) throw new Error(data?.error || "Erro ao carregar detalhes do lote.");
        if (!cancelled) setLot(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar detalhes do lote.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLot();
    return () => {
      cancelled = true;
    };
  }, [params.id]);
  async function refreshLot() {
    if (!lot) return;
    setQueryingAdyen(true);
    setError("");
    setQueryMessage("Atualizando dados do lote...");
    try {
      const response = await fetch(`/api/lotes/${params.id}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Erro ao atualizar os detalhes do lote.");
      if (!data || typeof data !== "object" || !Array.isArray(data.logs) || !Array.isArray(data.passagens)) {
        throw new Error("O servidor retornou dados inv\u00e1lidos para os detalhes do lote.");
      }

      const hasChanges = JSON.stringify(lot) !== JSON.stringify(data);
      setLot(data);
      setQueryMessage(
        hasChanges
          ? "Os dados do lote foram atualizados."
          : data.adyenLinkId
            ? "Nenhuma altera\u00e7\u00e3o encontrada. Os dados do lote j\u00e1 est\u00e3o atualizados."
            : "Nenhuma altera\u00e7\u00e3o encontrada. Os dados est\u00e3o atualizados; o link Adyen ainda n\u00e3o foi configurado."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao atualizar os detalhes do lote.");
    } finally {
      setQueryingAdyen(false);
    }
  }
  async function queryAdyen() {
    if (!lot) return;
    const previousStatus = lot.status;
    setQueryingAdyen(true);
    setError("");
    setQueryMessage("Consultando o pagamento na Adyen...");
    try {
      const response = await fetch(`/api/lotes/${params.id}/consultar-adyen`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Falha ao consultar a Adyen.");
      if (!data || typeof data.statusLote !== "string" || typeof data.statusAdyen !== "string") {
        throw new Error("A resposta da consulta Adyen veio incompleta. Tente novamente.");
      }
      if (data.statusLote !== previousStatus) {
        setQueryMessage("A Adyen confirmou o pagamento. O lote foi atualizado para Pago.");
      } else {
        setQueryMessage(`Sem atualiza\u00e7\u00f5es: o lote permanece ${data.statusLote.replaceAll("_", " ")}. Status na Adyen: ${data.statusAdyen}.`);
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar a Adyen.");
    } finally {
      setQueryingAdyen(false);
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
  const canQueryAdyen = Boolean(lot.adyenLinkId && lot.status !== "PAGO");
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
        <div className="page-heading-actions">
            <button
              className="button secondary refresh-icon-button"
              type="button"
              aria-label={queryingAdyen ? "Atualizando lote" : canQueryAdyen ? "Consultar status na Adyen" : "Atualizar detalhes do lote"}
              title={queryingAdyen ? "Atualizando lote" : canQueryAdyen ? "Consultar status na Adyen" : "Atualizar detalhes do lote"}
              disabled={queryingAdyen}
              onClick={() => void (canQueryAdyen ? queryAdyen() : refreshLot())}
            >
              <svg className={queryingAdyen ? "spin" : ""} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          <span className={`status status-${lot.status.toLowerCase()}`}>
            {lot.status.replaceAll("_", " ")}
          </span>
        </div>
      </header>

      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {queryMessage && <div className="notice" role="status">{queryMessage}</div>}
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
              Cliente CPF: <span className="strong">{maskCpf(lot.cpfCliente)}</span>
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
    </main>
  );
}
