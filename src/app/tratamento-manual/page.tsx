import { BackToHome } from "@/components/back-to-home";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { formatCpf, formatPhone } from "@/lib/pii";
import { formatDateTime, money, pageParam } from "@/lib/painel";
import { LinkPagination } from "@/components/link-pagination";
import { TratamentoManualTabela } from "@/components/tratamento-manual-tabela";
import { RefreshPageButton } from "@/components/refresh-page-button";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
type Params = Record<string, string | string[] | undefined>;

/** Lotes que passaram por toda a régua sem pagamento (D+7 recusado → cobrança extrajudicial), para tratamento manual. */
export default async function TratamentoManualPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/tratamento-manual");
  const isAdmin = hasRole(session, "admin");
  const params = await searchParams;
  const page = pageParam(params, "p");
  const busca = typeof params.busca === "string" ? params.busca.trim().slice(0, 100) : "";

  const where = {
    status: "INADIMPLENTE",
    ...(busca
      ? {
          OR: [
            { numeroContrato: { contains: busca, mode: "insensitive" as const } },
            { nomeCliente: { contains: busca, mode: "insensitive" as const } },
            { cpfCliente: { contains: busca.replace(/\D/g, "") || busca } },
          ],
        }
      : {}),
  };
  const [lotes, total, soma] = await Promise.all([
    db.loteCobranca.findMany({
      where,
      orderBy: [{ d10TentativaAt: "asc" }, { dataCriacao: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        numeroContrato: true,
        nomeCliente: true,
        cpfCliente: true,
        telefoneContato: true,
        valorFinalCentavos: true,
        valorPagoCentavos: true,
        quantidadePassagens: true,
        dataCriacao: true,
        d10TentativaAt: true,
      },
    }),
    db.loteCobranca.count({ where }),
    db.loteCobranca.aggregate({ where, _sum: { valorFinalCentavos: true } }),
  ]);

  return (
    <main className="shell dashboard-shell">
      <BackToHome />
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Cobrança · Fim da régua</span>
          <h1>Tratamento manual</h1>
          <p>
            Lotes que passaram por todas as etapas sem pagamento e receberam o aviso de cobrança extrajudicial. Gere um novo link de pagamento (um por lote ou vários de uma vez): quando o cliente
            pagar, o lote é baixado sozinho. A baixa manual e o cancelamento continuam disponíveis dentro do lote.
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <RefreshPageButton />
        </div>
      </header>

      <section className="dashboard-metrics dashboard-metrics-auto">
        <div className="dashboard-metric">
          <span>Lotes em tratamento</span>
          <strong>{total}</strong>
          <small>{busca ? "Com a busca aplicada" : "Aguardando ação do time"}</small>
        </div>
        <div className="dashboard-metric">
          <span>Valor em aberto</span>
          <strong>{money(soma._sum.valorFinalCentavos ?? 0)}</strong>
          <small>Soma dos lotes em tratamento manual</small>
        </div>
      </section>

      <section className="panel dashboard-filters">
        <form className="filter-bar" action="/tratamento-manual">
          <label className="search-field">
            Buscar por contrato, cliente ou CPF
            <input name="busca" defaultValue={busca} placeholder="Ex.: CGH000005-26, Maria, 123.456.789-01" />
          </label>
          <button className="button primary" type="submit">
            Buscar
          </button>
          {busca && (
            <Link className="button secondary" href="/tratamento-manual">
              Limpar
            </Link>
          )}
        </form>
      </section>

      <section className="panel dashboard-recent">
        <TratamentoManualTabela
          isAdmin={isAdmin}
          vazio={busca ? "Nenhum lote encontrado com essa busca." : "Nenhum lote em tratamento manual. Toda a régua está em dia."}
          lotes={lotes.map((l) => ({
            id: l.id,
            numeroContrato: l.numeroContrato,
            nome: l.nomeCliente,
            cpf: formatCpf(l.cpfCliente) ?? l.cpfCliente,
            telefone: (l.telefoneContato ? formatPhone(l.telefoneContato) : null) ?? null,
            valorCentavos: l.valorFinalCentavos - l.valorPagoCentavos,
            passagens: l.quantidadePassagens,
            emitidoEm: formatDateTime(l.dataCriacao),
            encerradoEm: l.d10TentativaAt ? formatDateTime(l.d10TentativaAt) : null,
          }))}
        />
        <LinkPagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          href={(p) => `/tratamento-manual?${new URLSearchParams({ ...(busca ? { busca } : {}), ...(p > 1 ? { p: String(p) } : {}) })}`}
        />
      </section>
    </main>
  );
}
