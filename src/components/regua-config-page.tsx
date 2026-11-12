"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/lib/auth-client";
import { MAX_DIAS_REGUA, ROTULOS, validarPrazos, type PrazosRegua } from "@/lib/regua-config";

type Config = PrazosRegua & { atualizadoEm: string | null; atualizadoPor: string | null };
const CAMPOS: Array<{ campo: keyof PrazosRegua; descricao: string }> = [
  { campo: "diasPrimeiraTentativa", descricao: "Débito no cartão salvo do cliente, se o lote não foi pago pelo link." },
  { campo: "diasLembrete", descricao: "Mensagem de lembrete com o link de pagamento." },
  { campo: "diasSegundaTentativa", descricao: "Última tentativa no cartão. Se recusar, o lote vai para inadimplência." },
];

export function ReguaConfigPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin" || role === "master";

  const [config, setConfig] = useState<Config | null>(null);
  const [form, setForm] = useState<Record<keyof PrazosRegua, string>>({ diasPrimeiraTentativa: "", diasLembrete: "", diasSegundaTentativa: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/regua", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || "Não foi possível carregar os prazos.");
        setConfig(body);
        setForm({
          diasPrimeiraTentativa: String(body.diasPrimeiraTentativa),
          diasLembrete: String(body.diasLembrete),
          diasSegundaTentativa: String(body.diasSegundaTentativa),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar os prazos."));
  }, []);

  async function salvar(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    const check = validarPrazos(form);
    if (!check.ok) return setError(check.erro);
    setSaving(true);
    try {
      const r = await fetch("/api/configuracoes/regua", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(check.prazos),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error || "Não foi possível salvar os prazos.");
      setConfig(body);
      setNotice("Prazos salvos. Valem a partir da próxima execução diária da régua.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar os prazos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Administração · Régua de cobrança</span>
          <h1>Prazos da Régua</h1>
          <p>Quantos dias depois da emissão do lote cada etapa da cobrança acontece. O link de pagamento é sempre enviado no dia da emissão (D+0).</p>
        </div>
        <Link className="button secondary" href="/">
          ← Voltar
        </Link>
      </header>

      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {!isAdmin && session && (
        <div className="notice" role="status">Perfil de visualização: os prazos podem ser consultados, mas só administradores podem alterá-los.</div>
      )}

      <section className="panel">
        {!config ? (
          <p className="empty">Carregando prazos…</p>
        ) : (
          <form onSubmit={salvar} style={{ display: "grid", gap: 16, maxWidth: 640 }}>
            {CAMPOS.map(({ campo, descricao }) => (
              <label key={campo} className="filter-field" style={{ display: "grid", gap: 6 }}>
                <span className="strong">{ROTULOS[campo]}</span>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{descricao}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  D+
                  <input
                    type="number"
                    min={1}
                    max={MAX_DIAS_REGUA}
                    step={1}
                    required
                    disabled={!isAdmin || saving}
                    value={form[campo]}
                    onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                    style={{ width: 90 }}
                  />
                  dias após a emissão
                </span>
              </label>
            ))}
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
              Os prazos precisam ser crescentes e de no máximo {MAX_DIAS_REGUA} dias. Lotes que já passaram de uma etapa não voltam atrás.
              {config.atualizadoPor && ` Última alteração por ${config.atualizadoPor}${config.atualizadoEm ? ` em ${new Date(config.atualizadoEm).toLocaleString("pt-BR")}` : ""}.`}
            </p>
            {isAdmin && (
              <div>
                <button className="button primary" type="submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar prazos"}
                </button>
              </div>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
