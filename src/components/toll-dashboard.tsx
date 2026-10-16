"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Lot = { id: number; numeroContrato: string; quantidadePassagens: number; valorFinalCentavos: number; status: string; etapaRegua: string; dataCriacao: string; };
const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
export function TollDashboard() {
  const [passages, setPassages] = useState(0), [lots, setLots] = useState<Lot[]>([]), [error, setError] = useState("");
  useEffect(() => { Promise.all([fetch("/api/passagens/pendentes"), fetch("/api/lotes")]).then(async ([p, l]) => { if (!p.ok || !l.ok) throw new Error("Não foi possível carregar os indicadores. Confira o banco de dados."); setPassages((await p.json()).length); setLots(await l.json()); }).catch((e) => setError(e.message)); }, []);
  const open = lots.filter((lot) => lot.status === "EM_REGUA");
  const outstanding = lots.filter((lot) => lot.status !== "PAGO").reduce((sum, lot) => sum + lot.valorFinalCentavos, 0);
  return <main className="shell"><header className="page-heading"><div><span className="eyebrow">FOCO ALUGUEL DE CARROS</span><h1>Gestão de pedágios</h1><p>Resumo de passagens, lotes e cobranças.</p></div><Link className="button primary" href="/compilacao">Compilar passagens</Link></header>
    {error && <div className="notice error-notice">{error}</div>}
    <section className="summary"><article><span>Passagens pendentes</span><strong>{passages}</strong><small>Aguardando compilação</small></article><article><span>Lotes em cobrança</span><strong>{open.length}</strong><small>Na régua ativa</small></article><article><span>Valor em aberto</span><strong>{money(outstanding)}</strong><small>Não inclui lotes pagos</small></article></section>
    <section className="panel"><div className="panel-head"><div><h2>Últimos lotes</h2><p>Abra um lote para consultar passagens e eventos da régua.</p></div><Link href="/lotes">Ver todos →</Link></div><div className="table-wrap"><table><thead><tr><th>Lote</th><th>Contrato</th><th>Quantidade</th><th>Valor final</th><th>Etapa</th><th>Status</th><th></th></tr></thead><tbody>{lots.slice(0, 8).length ? lots.slice(0, 8).map((l) => <tr key={l.id}><td className="strong">#{l.id}</td><td>{l.numeroContrato}</td><td>{l.quantidadePassagens}</td><td className="strong">{money(l.valorFinalCentavos)}</td><td>{l.etapaRegua}</td><td><span className={`status status-${l.status.toLowerCase()}`}>{l.status.replaceAll("_", " ")}</span></td><td><Link href={`/lotes/${l.id}`}>Detalhes →</Link></td></tr>) : <tr><td colSpan={7} className="empty">Nenhum lote foi compilado.</td></tr>}</tbody></table></div></section>
    <section className="quick-links"><Link className="quick-link" href="/compilacao"><strong>Compilar passagens</strong><span>Filtre, selecione e forme um lote.</span></Link><Link className="quick-link" href="/lotes"><strong>Régua de cobrança</strong><span>Consulte status, links e histórico.</span></Link></section>
  </main>;
}
