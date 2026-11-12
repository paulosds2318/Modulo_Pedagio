"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/lib/auth-client";
import { FORMAS_BAIXA_MANUAL, FORMAS_PAGAMENTO, STATUS_PERMITEM_BAIXA, reaisParaCentavos } from "@/lib/baixa-manual";
import { MOTIVOS_CANCELAMENTO, STATUS_PERMITEM_CANCELAMENTO } from "@/lib/cancelamento";
import { formatCpf, formatPhone } from "@/lib/pii";
import { PRAZOS_PADRAO, rotuloEtapa, type PrazosRegua } from "@/lib/regua-config";
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
  nomeCliente: string | null;
  telefoneContato: string | null;
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
  formaPagamento: string | null;
  valorRecebidoCentavos: number | null;
  baixaManual: boolean;
  baixaObservacao: string | null;
  baixaPor: string | null;
  canceladoEm: string | null;
  cancelamentoMotivo: string | null;
  cancelamentoObservacao: string | null;
  canceladoPor: string | null;
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
/** Etapas da régua com os dias configurados em /configuracoes/regua. */
const buildStages = (prazos: PrazosRegua) => [
  { key: "D0", label: "D+0: Emissão e Link Adyen", desc: "Envio de link Pay-by-link via e-mail e WhatsApp" },
  { key: "D5", label: `${rotuloEtapa("D5", prazos)}: 1ª Tentativa no Cartão`, desc: "Débito automático no cartão tokenizado (Coral)" },
  { key: "D7", label: `${rotuloEtapa("D7", prazos)}: Lembrete Ativo`, desc: "Mensagem de alerta e aviso via WhatsApp" },
  { key: "D10", label: `${rotuloEtapa("D10", prazos)}: 2ª Tentativa no Cartão`, desc: "Última tentativa de débito ou negativação" },
];
export function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin" || role === "master";
  const [baixaAberta, setBaixaAberta] = useState(false);
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);
  const [baixaErro, setBaixaErro] = useState("");
  const [baixa, setBaixa] = useState({ forma: "PIX", dataPagamento: "", valor: "", observacao: "" });
  const [cancelAberto, setCancelAberto] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [cancelErro, setCancelErro] = useState("");
  const [cancelamento, setCancelamento] = useState({ motivo: "CONTESTACAO", observacao: "" });
  const [lot, setLot] = useState<Lot | null>(null);
  const [prazos, setPrazos] = useState<PrazosRegua>(PRAZOS_PADRAO);
  const stages = buildStages(prazos);
  useEffect(() => {
    fetch("/api/configuracoes/regua", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => cfg && setPrazos(cfg))
      .catch(() => undefined);
  }, []);
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
        if (!cancelled) {
          setLot(data);
          // Veio pelo link "Dar baixa →" (#baixa): abre o formulário já preenchido.
          if (window.location.hash === "#baixa" && ["EM_REGUA", "INADIMPLENTE"].includes(data.status)) {
            const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
            setBaixa({ forma: "PIX", dataPagamento: hoje, valor: (data.valorFinalCentavos / 100).toFixed(2).replace(".", ","), observacao: "" });
            setBaixaAberta(true);
          }
        }
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
  function abrirBaixa() {
    if (!lot) return;
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    setBaixa({ forma: "PIX", dataPagamento: hoje, valor: (lot.valorFinalCentavos / 100).toFixed(2).replace(".", ","), observacao: "" });
    setBaixaErro("");
    setCancelAberto(false);
    setBaixaAberta(true);
    window.setTimeout(() => document.getElementById("baixa")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function registrarBaixa(event: FormEvent) {
    event.preventDefault();
    if (!lot) return;
    setBaixaErro("");
    const centavos = reaisParaCentavos(baixa.valor);
    if (centavos === null || centavos <= 0) return setBaixaErro("Informe o valor recebido, por exemplo 13,21.");
    const diferenca = centavos - lot.valorFinalCentavos;
    if (diferenca !== 0 && !window.confirm(`O valor recebido é ${diferenca < 0 ? "menor" : "maior"} que o devido em ${money(Math.abs(diferenca))}. Confirmar a baixa assim mesmo?`)) return;
    setSalvandoBaixa(true);
    try {
      const response = await fetch(`/api/lotes/${params.id}/baixa-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forma: baixa.forma, dataPagamento: baixa.dataPagamento, valorRecebidoCentavos: centavos, observacao: baixa.observacao }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Não foi possível registrar a baixa.");
      await reload();
      setBaixaAberta(false);
      setQueryMessage("Baixa manual registrada. O lote está pago e a régua de cobrança foi encerrada.");
    } catch (cause) {
      setBaixaErro(cause instanceof Error ? cause.message : "Erro ao registrar a baixa.");
    } finally {
      setSalvandoBaixa(false);
    }
  }

  function abrirCancelamento() {
    setCancelamento({ motivo: "CONTESTACAO", observacao: "" });
    setCancelErro("");
    setBaixaAberta(false);
    setCancelAberto(true);
    window.setTimeout(() => document.getElementById("cancelar")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function cancelarLote(event: FormEvent) {
    event.preventDefault();
    if (!lot) return;
    setCancelErro("");
    if (cancelamento.observacao.trim().length < 5) return setCancelErro("Explique o cancelamento na observação.");
    if (!window.confirm(`Cancelar o lote #${lot.id} (${money(lot.valorFinalCentavos)})? A régua de cobrança será encerrada e o lote não poderá ser reativado.`)) return;
    setCancelando(true);
    try {
      const response = await fetch(`/api/lotes/${params.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cancelamento),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Não foi possível cancelar o lote.");
      await reload();
      setCancelAberto(false);
      setQueryMessage("Lote cancelado. A régua de cobrança foi encerrada.");
    } catch (cause) {
      setCancelErro(cause instanceof Error ? cause.message : "Erro ao cancelar o lote.");
    } finally {
      setCancelando(false);
    }
  }

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
  const podeDarBaixa = isAdmin && STATUS_PERMITEM_BAIXA.includes(lot.status);
  const inadimplente = lot.status === "INADIMPLENTE";
  const podeCancelar = isAdmin && STATUS_PERMITEM_CANCELAMENTO.includes(lot.status);
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
            Cliente: <span className="strong">{lot.nomeCliente || "Nome não disponível no Coral"}</span>
            {" · "}CPF: <span className="strong">{formatCpf(lot.cpfCliente)}</span>
            {" · "}Telefone: <span className="strong">{lot.telefoneContato ? formatPhone(lot.telefoneContato) : "não disponível"}</span>
          </p>
          <p>
            Gerado em {new Date(lot.dataCriacao).toLocaleString("pt-BR")} · {lot.quantidadePassagens} passagem(ns) vinculada(s)
            {lot.dataPagamento && ` · Pago em ${new Date(lot.dataPagamento).toLocaleString("pt-BR")}`}
          </p>
          {lot.status === "PAGO" && lot.formaPagamento && (
            <p>
              Pagamento: <span className="strong">{FORMAS_PAGAMENTO[lot.formaPagamento] ?? lot.formaPagamento}</span>
              {lot.baixaManual && " · baixa manual"}
              {lot.valorRecebidoCentavos != null && (
                <>
                  {" · "}Recebido: <span className="strong">{money(lot.valorRecebidoCentavos)}</span>
                  {lot.valorRecebidoCentavos !== lot.valorFinalCentavos &&
                    ` (${lot.valorRecebidoCentavos < lot.valorFinalCentavos ? "desconto" : "acréscimo"} de ${money(Math.abs(lot.valorFinalCentavos - lot.valorRecebidoCentavos))})`}
                </>
              )}
              {lot.baixaPor && ` · por ${lot.baixaPor}`}
            </p>
          )}
          {lot.status === "CANCELADO" && (
            <p>
              Cancelado{lot.canceladoEm && ` em ${new Date(lot.canceladoEm).toLocaleString("pt-BR")}`}
              {lot.canceladoPor && ` por ${lot.canceladoPor}`}
              {lot.cancelamentoMotivo && (
                <>
                  {" · "}Motivo: <span className="strong">{MOTIVOS_CANCELAMENTO[lot.cancelamentoMotivo] ?? lot.cancelamentoMotivo}</span>
                </>
              )}
              {lot.cancelamentoObservacao && ` · ${lot.cancelamentoObservacao}`}
            </p>
          )}
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
          {podeDarBaixa && (
            <button type="button" className={`button ${inadimplente ? "primary" : "secondary"}`} onClick={abrirBaixa}>
              Registrar baixa manual
            </button>
          )}
          {podeCancelar && (
            <button type="button" className="button secondary" onClick={abrirCancelamento}>
              Cancelar lote
            </button>
          )}
          <span className={`status status-${lot.status.toLowerCase()}`}>
            {lot.status.replaceAll("_", " ")}
            {lot.baixaManual ? " (MANUAL)" : ""}
          </span>
        </div>
      </header>

      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {queryMessage && <div className="notice" role="status">{queryMessage}</div>}
      {inadimplente && !baixaAberta && (
        <div className="notice error-notice" role="status">
          Régua encerrada sem pagamento. Se o cliente pagou por outro meio (PIX, depósito, acordo), registre a baixa manual
          {isAdmin ? "." : " (somente administradores)."}
        </div>
      )}
      {baixaAberta && podeDarBaixa && (
        <section className="panel" id="baixa">
          <div className="panel-head">
            <div>
              <h2>Registrar baixa manual</h2>
              <p>
                Use quando o cliente pagou fora do link ou do cartão. O lote vira Pago, a régua para e as tarefas pendentes são canceladas.
                Fica registrado no histórico e na auditoria.
              </p>
            </div>
          </div>
          {baixaErro && <div className="notice error-notice" role="alert">{baixaErro}</div>}
          <form onSubmit={registrarBaixa} className="filter-bar" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="filter-field">
              Forma de pagamento
              <select value={baixa.forma} onChange={(e) => setBaixa((b) => ({ ...b, forma: e.target.value }))} disabled={salvandoBaixa}>
                {Object.entries(FORMAS_BAIXA_MANUAL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              Data do pagamento
              <input type="date" required value={baixa.dataPagamento} onChange={(e) => setBaixa((b) => ({ ...b, dataPagamento: e.target.value }))} disabled={salvandoBaixa} />
            </label>
            <label className="filter-field">
              Valor recebido (R$)
              <input inputMode="decimal" required value={baixa.valor} onChange={(e) => setBaixa((b) => ({ ...b, valor: e.target.value }))} disabled={salvandoBaixa} style={{ width: 120 }} />
            </label>
            <label className="filter-field" style={{ flex: "1 1 320px" }}>
              Observação (comprovante, acordo…)
              <input
                required
                minLength={5}
                maxLength={500}
                placeholder="Ex.: PIX recebido, comprovante E1234…; acordo com desconto aprovado por…"
                value={baixa.observacao}
                onChange={(e) => setBaixa((b) => ({ ...b, observacao: e.target.value }))}
                disabled={salvandoBaixa}
              />
            </label>
            <button className="button primary" type="submit" disabled={salvandoBaixa}>
              {salvandoBaixa ? "Registrando…" : "Confirmar baixa"}
            </button>
            <button className="button secondary" type="button" onClick={() => setBaixaAberta(false)} disabled={salvandoBaixa}>
              Cancelar
            </button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "10px 0 0" }}>
            Valor devido: <span className="strong">{money(lot.valorFinalCentavos)}</span>. Se o valor recebido for diferente (acordo), explique na observação.
          </p>
        </section>
      )}
      {cancelAberto && podeCancelar && (
        <section className="panel" id="cancelar">
          <div className="panel-head">
            <div>
              <h2>Cancelar lote</h2>
              <p>
                Para cobranças geradas por engano, contestadas ou isentas. A régua é encerrada, as tarefas pendentes são canceladas e o lote não entra
                no valor cobrado do painel. Fica registrado no histórico e na auditoria.
              </p>
            </div>
          </div>
          {cancelErro && <div className="notice error-notice" role="alert">{cancelErro}</div>}
          {lot.adyenPaymentUrl && (
            <div className="notice" role="status">
              O link de pagamento já enviado ao cliente continua válido no Coral/Adyen. Se o cliente pagar mesmo assim, o pagamento é registrado normalmente.
            </div>
          )}
          <form onSubmit={cancelarLote} className="filter-bar" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="filter-field">
              Motivo
              <select value={cancelamento.motivo} onChange={(e) => setCancelamento((c) => ({ ...c, motivo: e.target.value }))} disabled={cancelando}>
                {Object.entries(MOTIVOS_CANCELAMENTO).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field" style={{ flex: "1 1 360px" }}>
              Observação
              <input
                required
                minLength={5}
                maxLength={500}
                placeholder="Ex.: cliente comprovou que não passou na praça; protocolo 123…"
                value={cancelamento.observacao}
                onChange={(e) => setCancelamento((c) => ({ ...c, observacao: e.target.value }))}
                disabled={cancelando}
              />
            </label>
            <button className="button primary" type="submit" disabled={cancelando}>
              {cancelando ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button className="button secondary" type="button" onClick={() => setCancelAberto(false)} disabled={cancelando}>
              Voltar
            </button>
          </form>
        </section>
      )}
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
              Cliente: <span className="strong">{lot.nomeCliente || "Nome não disponível"}</span>
              {" · "}CPF: <span className="strong">{formatCpf(lot.cpfCliente)}</span>
              {lot.telefoneContato && (
                <>
                  {" · "}Telefone: <span className="strong">{formatPhone(lot.telefoneContato)}</span>
                </>
              )}
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
