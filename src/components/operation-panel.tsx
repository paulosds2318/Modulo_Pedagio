"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useSession } from "@/lib/auth-client";
import { rotuloEtapa, type PrazosRegua } from "@/lib/regua-config";

type Etapa = { chave: string; quantidade: number; valorCentavos: number };
type Integracao = {
  tipo: string;
  concluidas: number;
  emAndamento: number;
  aguardandoConfiguracao: number;
  falhas: number;
  ignoradas: number;
};
type Sincronizacao = {
  id: number;
  origem: string;
  status: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  recebidas: number;
  importadas: number;
  lotesCompilados: number;
  erro: string | null;
};
type Painel = {
  geradoEm: string;
  passagensPendentes: number;
  funil: Etapa[];
  integracoes: Integracao[];
  sincronizacaoCoral: { configurada: boolean; ultima: Sincronizacao | null; ultimaComSucesso: Sincronizacao | null; atrasada: boolean };
  prazos: PrazosRegua;
  rotina: {
    agendadorInterno: boolean;
    intervaloMin: number;
    ultima: { origem: string; status: string; iniciadoEm: string; finalizadoEm: string | null; erro: string | null } | null;
    atrasada: boolean;
  };
  lotesSemLink: { id: number; numeroContrato: string; dataCriacao: string }[];
  alertas: { id: number; loteId: number; etapa: string; acao: string; resultado: string; dataHora: string }[];
};

const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const ETAPAS: Record<string, { rotulo: string; descricao: string; cor: string }> = {
  D0: { rotulo: "D+0", descricao: "Cobrança inicial (link de 48 h)", cor: "var(--foco-teal)" },
  D5: { rotulo: "D+2", descricao: "1ª tentativa no cartão / nova cobrança", cor: "var(--foco-purple)" },
  D7: { rotulo: "D+5", descricao: "Última cobrança com link", cor: "var(--foco-amber)" },
  D10: { rotulo: "D+7", descricao: "2ª tentativa no cartão", cor: "var(--foco-graphite)" },
  INADIMPLENTE: { rotulo: "Tratamento manual", descricao: "Régua encerrada sem pagamento (extrajudicial)", cor: "var(--foco-red)" },
  PAGO: { rotulo: "Pago", descricao: "Liquidados", cor: "var(--foco-green)" },
  CANCELADO: { rotulo: "Cancelado", descricao: "Gerados por engano, contestados ou isentos", cor: "var(--muted-light)" },
};

const INTEGRACOES: Record<string, string> = {
  ADYEN_LINK_D0: "Link de pagamento (Coral)",
  WHATSAPP_D0: "WhatsApp D+0",
};

const ACOES: Record<string, string> = {
  ALERTA_DIVERGENCIA_VALOR: "Pagamento com valor ou moeda divergente",
  ALERTA_DUPLICIDADE_DEBITO: "Possível cobrança em duplicidade",
  ERRO_PROCESSAMENTO: "Erro ao processar a régua",
  COBRAR_CARTAO_BLOQUEADO_LINK_ATIVO: "Débito no cartão bloqueado (link ativo)",
};

function saude(i: Integracao): { rotulo: string; cor: string } {
  if (i.falhas > 0) return { rotulo: "Com falhas", cor: "var(--foco-red)" };
  if (i.aguardandoConfiguracao > 0) return { rotulo: "Aguardando configuração", cor: "var(--foco-amber)" };
  if (i.concluidas + i.emAndamento + i.ignoradas === 0) return { rotulo: "Sem uso ainda", cor: "var(--muted)" };
  return { rotulo: "Funcionando", cor: "var(--foco-green)" };
}

const pill = (cor: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: cor,
  whiteSpace: "nowrap",
});
const dot = (cor: string): CSSProperties => ({ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 });
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 };
const card: CSSProperties = { border: "1px solid var(--line)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--bg)" };
const muted: CSSProperties = { color: "var(--muted)", fontSize: 12 };

/**
 * Situação atual da operação. "completo": funil da régua, saúde das integrações e alertas (página /painel);
 * "alertas": só a lista de alertas (tela inicial).
 */
export function OperationPanel({ refreshKey = 0, modo = "completo" }: { refreshKey?: number; modo?: "completo" | "alertas" }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin" || role === "master";
  const [data, setData] = useState<Painel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/painel", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || "Não foi possível carregar o painel de acompanhamento.");
        if (active) { setData(body); setError(""); }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "Erro ao carregar o painel."));
    return () => { active = false; };
  }, [refreshKey]);

  if (error) return <div className="notice error-notice" role="alert">{error}</div>;
  if (!data) return <section className="panel"><p className="empty">Carregando painel de acompanhamento…</p></section>;

  const maxQtd = Math.max(1, ...data.funil.map((e) => e.quantidade));
  const totalLotes = data.funil.reduce((s, e) => s + e.quantidade, 0);
  const sync = data.sincronizacaoCoral;
  const alertaSync = sync.configurada && (sync.atrasada || sync.ultima?.status === "FALHA");
  // Selo do cartão "Passagens do Coral": vermelho na falha, âmbar se parada ou sem configuração, verde se em dia.
  const seloSync = !sync.configurada
    ? { rotulo: "Busca não configurada", cor: "var(--foco-amber)" }
    : sync.ultima?.status === "FALHA"
      ? { rotulo: "Última sincronização falhou", cor: "var(--foco-red)" }
      : sync.atrasada
        ? { rotulo: "Sincronização parada", cor: "var(--foco-red)" }
        : sync.ultima?.status === "EM_ANDAMENTO"
          ? { rotulo: "Sincronizando…", cor: "var(--foco-amber)" }
          : { rotulo: "Sincronização em dia", cor: "var(--foco-green)" };
  const rotina = data.rotina;
  const alertaRotina = rotina.atrasada || rotina.ultima?.status === "FALHA";
  const alertasTotal = data.lotesSemLink.length + data.alertas.length + (alertaSync ? 1 : 0) + (alertaRotina ? 1 : 0);
  const seloRotina = rotina.ultima?.status === "FALHA"
    ? { rotulo: "Última execução falhou", cor: "var(--foco-red)" }
    : rotina.atrasada
      ? { rotulo: rotina.ultima ? "Parada" : "Ainda não executou", cor: rotina.agendadorInterno ? "var(--foco-red)" : "var(--foco-amber)" }
      : rotina.ultima?.status === "EM_ANDAMENTO"
        ? { rotulo: "Executando…", cor: "var(--foco-amber)" }
        : { rotulo: "Em dia", cor: "var(--foco-green)" };
  const listaAlertas = (
    <>
        {alertasTotal === 0 ? (
        <p style={{ ...pill("var(--foco-green)"), fontSize: 13 }}><span style={dot("var(--foco-green)")} />Nenhum alerta nos últimos 30 dias.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {alertaRotina && (
            <li style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={pill("var(--foco-red)")}>
                <span style={dot("var(--foco-red)")} />
                {rotina.ultima?.status === "FALHA" ? "Rotina automática falhou" : "Rotina automática não está rodando"}
              </span>
              <span style={{ fontSize: 13 }}>
                {rotina.ultima?.status === "FALHA" && rotina.ultima.erro ? `${rotina.ultima.erro} · ` : ""}
                {rotina.ultima ? `última execução em ${dateTime(rotina.ultima.iniciadoEm)}` : "nenhuma execução registrada"}
                {!rotina.agendadorInterno ? " · agendador interno desligado (AGENDADOR_INTERNO)" : ""}
              </span>
            </li>
          )}
          {alertaSync && (
            <li style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={pill("var(--foco-red)")}>
                <span style={dot("var(--foco-red)")} />
                {sync.ultima?.status === "FALHA" ? "Última sincronização com o Coral falhou" : "Sincronização com o Coral parada"}
              </span>
              <span style={{ fontSize: 13 }}>
                {sync.ultima?.status === "FALHA" && sync.ultima.erro ? `${sync.ultima.erro} · ` : ""}
                {sync.ultimaComSucesso ? `último sucesso em ${dateTime(sync.ultimaComSucesso.iniciadoEm)}` : "nenhuma sincronização com sucesso registrada"}
              </span>
            </li>
          )}
          {data.lotesSemLink.map((l) => (
            <li key={`sem-link-${l.id}`} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={pill("var(--foco-amber)")}><span style={dot("var(--foco-amber)")} />Lote sem link de pagamento</span>
              <span style={{ fontSize: 13 }}>
                <Link href={`/lotes/${l.id}`} className="strong">Lote #{l.id}</Link> · {l.numeroContrato} · criado em {dateTime(l.dataCriacao)}
              </span>
            </li>
          ))}
          {data.alertas.map((a) => (
            <li key={`alerta-${a.id}`} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={pill("var(--foco-red)")}><span style={dot("var(--foco-red)")} />{ACOES[a.acao] ?? `${a.acao} (${a.resultado})`}</span>
              <span style={{ fontSize: 13 }}>
                <Link href={`/lotes/${a.loteId}`} className="strong">Lote #{a.loteId}</Link> · etapa {a.etapa} · {dateTime(a.dataHora)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (modo === "alertas") {
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Alertas {alertasTotal > 0 ? `(${alertasTotal})` : ""}</h2>
            <p>O que precisa de ação manual agora · atualizado em {dateTime(data.geradoEm)}</p>
          </div>
          <Link href="/painel" className="button secondary">
            Painel de acompanhamento →
          </Link>
        </div>
        {listaAlertas}
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Funil da régua · agora</h2>
            <p>Todos os lotes, em qualquer data, pela etapa em que estão hoje · {totalLotes} lote{totalLotes === 1 ? "" : "s"} no total</p>
          </div>
          <span style={{ ...muted, fontSize: 13, whiteSpace: "nowrap" }}>
            Prazos atuais: {rotuloEtapa("D5", data.prazos)}, {rotuloEtapa("D7", data.prazos)} e {rotuloEtapa("D10", data.prazos)}
            {isAdmin && (
              <>
                {" · "}
                <Link href="/configuracoes/regua" style={{ color: "var(--foco-red)", fontWeight: 600 }}>
                  alterar
                </Link>
              </>
            )}
          </span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {data.funil.map((e) => {
            const meta = { ...ETAPAS[e.chave], rotulo: e.chave in ETAPAS && e.chave.startsWith("D") ? rotuloEtapa(e.chave, data.prazos) : ETAPAS[e.chave].rotulo };
            return (
              <div key={e.chave} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr auto", gap: 12, alignItems: "center" }}>
                <div>
                  <div className="strong" style={{ fontSize: 14 }}>{meta.rotulo}</div>
                  <div style={muted}>{meta.descricao}</div>
                </div>
                <div style={{ background: "var(--line-subtle)", borderRadius: "var(--radius-full)", height: 10, overflow: "hidden" }}>
                  <div
                    style={{ width: `${(e.quantidade / maxQtd) * 100}%`, minWidth: e.quantidade ? 6 : 0, height: "100%", background: meta.cor, borderRadius: "var(--radius-full)" }}
                    aria-hidden="true"
                  />
                </div>
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <div className="strong" style={{ fontSize: 14 }}>{e.quantidade} lote{e.quantidade === 1 ? "" : "s"}</div>
                  <div style={muted}>{money(e.valorCentavos)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Saúde das integrações · agora</h2>
            <p>Situação das tarefas automáticas · atualizado em {dateTime(data.geradoEm)}</p>
          </div>
        </div>
        <div style={grid}>
          {data.integracoes.map((i) => {
            const s = saude(i);
            return (
              <article key={i.tipo} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <span className="strong">{INTEGRACOES[i.tipo] ?? i.tipo}</span>
                  <span style={pill(s.cor)}><span style={dot(s.cor)} />{s.rotulo}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, fontSize: 13 }}>
                  <span>Concluídas: <span className="strong">{i.concluidas}</span></span>
                  <span>Em andamento: <span className="strong">{i.emAndamento}</span></span>
                  <span>Aguardando config.: <span className="strong">{i.aguardandoConfiguracao}</span></span>
                  <span>Falhas: <span className="strong">{i.falhas}</span></span>
                  <span>Ignoradas: <span className="strong">{i.ignoradas}</span></span>
                </div>
              </article>
            );
          })}
          <article style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <span className="strong">Passagens do Coral</span>
              <span style={pill(seloSync.cor)}><span style={dot(seloSync.cor)} />{seloSync.rotulo}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              Pendentes de compilação: <span className="strong">{data.passagensPendentes}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Última sincronização:{" "}
              {sync.ultima ? (
                <span className="strong">
                  {dateTime(sync.ultima.iniciadoEm)} · {sync.ultima.status === "OK" ? `${sync.ultima.recebidas} recebida${sync.ultima.recebidas === 1 ? "" : "s"}, ${sync.ultima.importadas} nova${sync.ultima.importadas === 1 ? "" : "s"}` : sync.ultima.status === "FALHA" ? "falhou" : "em andamento"}
                  {` (${sync.ultima.origem === "MANUAL" ? "manual" : "automática"})`}
                </span>
              ) : (
                <span className="strong">nenhuma registrada</span>
              )}
            </div>
            <div style={{ ...muted, marginTop: 6 }}>Recebidas por envio do Coral e pela sincronização diária.</div>
          </article>
          <article style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <span className="strong">Rotina automática</span>
              <span style={pill(seloRotina.cor)}><span style={dot(seloRotina.cor)} />{seloRotina.rotulo}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              {rotina.agendadorInterno ? (
                <>Agendador interno: <span className="strong">a cada {rotina.intervaloMin} min</span></>
              ) : (
                <>Agendador interno: <span className="strong">desligado</span> (depende de chamada externa)</>
              )}
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Última execução:{" "}
              <span className="strong">
                {rotina.ultima
                  ? `${dateTime(rotina.ultima.iniciadoEm)} · ${rotina.ultima.origem === "AGENDADOR" ? "agendador" : "chamada externa"}`
                  : "nenhuma registrada"}
              </span>
            </div>
            <div style={{ ...muted, marginTop: 6 }}>Busca passagens no Coral, avança a régua e repete integrações com falha.</div>
          </article>
        </div>

        <h3 style={{ margin: "20px 0 10px", fontSize: 15 }}>
          Alertas {alertasTotal > 0 ? `(${alertasTotal})` : ""}
        </h3>
        {listaAlertas}
      </section>
    </>
  );
}
