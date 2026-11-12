import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { ACOES_AUDITORIA } from "@/lib/services/auditoria";
import { formatDateTime, pageParam } from "@/lib/painel";
import { LinkPagination } from "@/components/link-pagination";
import { RefreshPageButton } from "@/components/refresh-page-button";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;
const text = (params: Params, key: string) => {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

/** Mostra os detalhes gravados em JSON como texto legível ("chave: valor · ..."). */
function detalhesLegiveis(raw: string | null) {
  if (!raw) return "—";
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return String(data);
    const flat = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" && !Array.isArray(v) ? flat(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}: ${v ?? "—"}`]
      );
    return flat(data as Record<string, unknown>).join(" · ");
  } catch {
    return raw;
  }
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/auditoria");
  if (!hasRole(session, "master")) redirect("/");

  const params = await searchParams;
  const acao = text(params, "acao");
  const usuario = text(params, "usuario");
  const de = text(params, "de");
  const ate = text(params, "ate");
  const page = pageParam(params, "p");

  const where = {
    ...(acao && acao in ACOES_AUDITORIA ? { acao } : {}),
    ...(usuario ? { usuarioEmail: usuario } : {}),
    ...(de && DAY.test(de) || ate && DAY.test(ate)
      ? {
          dataHora: {
            ...(de && DAY.test(de) ? { gte: new Date(`${de}T00:00:00-03:00`) } : {}),
            ...(ate && DAY.test(ate) ? { lt: new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };

  const [registros, total, usuarios] = await Promise.all([
    db.auditoriaUsuario.findMany({ where, orderBy: { dataHora: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditoriaUsuario.count({ where }),
    db.auditoriaUsuario.findMany({ distinct: ["usuarioEmail"], select: { usuarioEmail: true, usuarioNome: true }, orderBy: { usuarioEmail: "asc" } }),
  ]);
  const query = (extra: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ acao, usuario, de, ate, ...extra })) if (v !== undefined && v !== "") q.set(k, String(v));
    return q.toString();
  };
  const filtrado = Boolean(acao || usuario || de || ate);

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Administração · Master</span>
          <h1>Auditoria</h1>
          <p>Quem fez o quê no módulo: compilações manuais, consultas à Adyen, sincronizações, exportações, prazos e usuários.</p>
        </div>
        <div className="dashboard-heading-actions">
          <RefreshPageButton />
        </div>
      </header>

      <section className="panel dashboard-filters" aria-label="Filtros">
        <form className="filter-bar" action="/auditoria">
          <label className="filter-field">
            De
            <input type="date" name="de" defaultValue={de} />
          </label>
          <label className="filter-field">
            Até
            <input type="date" name="ate" defaultValue={ate} />
          </label>
          <label className="filter-field">
            Ação
            <select name="acao" defaultValue={acao ?? ""}>
              <option value="">Todas</option>
              {Object.entries(ACOES_AUDITORIA).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Usuário
            <select name="usuario" defaultValue={usuario ?? ""}>
              <option value="">Todos</option>
              {usuarios
                .filter((u) => u.usuarioEmail)
                .map((u) => (
                  <option key={u.usuarioEmail} value={u.usuarioEmail!}>
                    {u.usuarioNome ? `${u.usuarioNome} (${u.usuarioEmail})` : u.usuarioEmail}
                  </option>
                ))}
            </select>
          </label>
          <button className="button primary" type="submit">
            Filtrar
          </button>
          {filtrado && (
            <Link className="button secondary" href="/auditoria">
              Limpar filtros
            </Link>
          )}
        </form>
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>Registros · {total}</h2>
            <p>Do mais recente para o mais antigo.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Detalhes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.dataHora)}</td>
                  <td className="strong">
                    {r.usuarioNome || r.usuarioEmail || "Sistema"}
                    {r.usuarioNome && r.usuarioEmail && <span className="subcell">{r.usuarioEmail}</span>}
                  </td>
                  <td>
                    <span className="dashboard-status">{ACOES_AUDITORIA[r.acao] ?? r.acao}</span>
                  </td>
                  <td className="dashboard-wrap" style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
                    {detalhesLegiveis(r.detalhes)}
                  </td>
                  <td>{r.entidade === "lote" && r.entidadeId ? <Link href={`/lotes/${r.entidadeId}`}>Lote #{r.entidadeId} →</Link> : ""}</td>
                </tr>
              ))}
              {!registros.length && (
                <tr>
                  <td className="empty" colSpan={5}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <LinkPagination page={page} total={total} pageSize={PAGE_SIZE} href={(p) => `/auditoria?${query({ p: p > 1 ? p : undefined })}`} />
      </section>
    </main>
  );
}
