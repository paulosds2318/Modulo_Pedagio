"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
type Lot = { id: number; numeroContrato: string; quantidadePassagens: number; valorFinalCentavos: number; status: string; etapaRegua: string; adyenPaymentUrl: string | null; dataCriacao: string; };
const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
export function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]), [filter, setFilter] = useState(""), [status, setStatus] = useState("TODOS"), [error, setError] = useState("");
  useEffect(() => { fetch("/api/lotes").then(async (r) => { if (!r.ok) throw new Error("Falha ao carregar lotes."); setLots(await r.json()); }).catch((e) => setError(e.message)); }, []);
  const shown = useMemo(() => lots.filter((l) => (status === "TODOS" || l.status === status) && (!filter || `${l.numeroContrato} ${l.id}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))), [lots, filter, status]);
  return <main className="shell"><header className="page-heading"><div><span className="eyebrow">COBRANÇA</span><h1>Lotes e cobranças</h1><p>Acompanhe o status, os links e o histórico dos lotes.</p></div><Link className="button primary" href="/compilacao">Novo lote</Link></header>
    {error && <div className="notice error-notice">{error}</div>}
    <section className="panel"><div className="panel-head"><label className="search-field">Buscar por contrato ou número do lote<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Contrato ou #lote" /></label><label className="filter-field">Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>TODOS</option><option>EM_REGUA</option><option>PAGO</option><option>INADIMPLENTE</option><option>PENDENTE</option></select></label></div><div className="table-wrap"><table><thead><tr><th>Lote</th><th>Contrato</th><th>Passagens</th><th>Total</th><th>Etapa</th><th>Status</th><th>Criado em</th><th></th></tr></thead><tbody>{shown.length ? shown.map((l) => <tr key={l.id}><td className="strong">#{l.id}</td><td>{l.numeroContrato}</td><td>{l.quantidadePassagens}</td><td className="strong">{money(l.valorFinalCentavos)}</td><td>{l.etapaRegua}</td><td><span className={`status status-${l.status.toLowerCase()}`}>{l.status.replaceAll("_", " ")}</span></td><td>{new Date(l.dataCriacao).toLocaleDateString("pt-BR")}</td><td><Link href={`/lotes/${l.id}`}>Detalhes →</Link></td></tr>) : <tr><td className="empty" colSpan={8}>Nenhum lote encontrado.</td></tr>}</tbody></table></div></section>
  </main>;
}
