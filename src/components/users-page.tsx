"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export function UsersPage() {
  const { data: session, isPending } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role || "viewer";
  const isAdmin = role === "admin";

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Formulário de Novo Usuário
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "admin">("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [formError, setFormError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/usuarios");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erro ao consultar usuários.");
      }
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao cadastrar usuário.");
      }

      setFormSuccess(`Usuário ${name} criado com sucesso com o perfil ${newRole === "admin" ? "Administrador" : "Visualização"}!`);
      setName("");
      setEmail("");
      setPassword("");
      setNewRole("viewer");
      loadUsers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao cadastrar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isPending) {
    return (
      <main className="shell">
        <p style={{ color: "var(--muted)", padding: "40px 0" }}>Verificando permissões...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="shell">
        <div className="notice error-notice" style={{ marginTop: "24px" }}>
          <strong>Acesso Restrito:</strong> Esta tela é exclusiva para administradores da Foco Aluguel de Carros.
        </div>
        <div style={{ marginTop: "16px" }}>
          <Link href="/" className="button secondary">
            ← Voltar para a Visão Geral
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Segurança & Controle de Acesso</span>
          <h1>Gestão de Usuários</h1>
          <p>
            Cadastre novos analistas ou administradores e gerencie as permissões de acesso ao Módulo de Pedágios.
          </p>
        </div>
      </header>

      {error && <div className="notice error-notice">{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "24px", alignItems: "start" }}>
        {/* Painel de Cadastro */}
        <section className="panel" style={{ padding: "24px" }}>
          <div style={{ marginBottom: "18px" }}>
            <h2 style={{ fontSize: "16px", margin: "0 0 6px" }}>Novo Usuário</h2>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
              Crie credenciais institucionais com o papel desejado.
            </p>
          </div>

          {formError && (
            <div className="notice error-notice" style={{ marginBottom: "16px", fontSize: "12px" }}>
              {formError}
            </div>
          )}
          {formSuccess && (
            <div
              className="notice"
              style={{
                marginBottom: "16px",
                background: "#f0fdf4",
                borderColor: "#86efac",
                color: "#166534",
                fontSize: "12px",
              }}
            >
              ✅ {formSuccess}
            </div>
          )}

          <form onSubmit={handleCreateUser} style={{ display: "grid", gap: "14px" }}>
            <label className="search-field">
              Nome Completo
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Ana Souza"
                required
              />
            </label>

            <label className="search-field">
              E-mail Institucional
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana.souza@focoalugueldecarros.com.br"
                required
              />
            </label>

            <label className="search-field">
              Senha Provisória (mín. 8 caracteres)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            <label className="filter-field">
              Perfil de Acesso
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "viewer" | "admin")}
              >
                <option value="viewer">Visualização (Somente leitura - Dashboards e Lotes)</option>
                <option value="admin">Administrador (Total - Compilação, Sincronização e Baixa)</option>
              </select>
            </label>

            <button
              type="submit"
              className="button primary"
              style={{ width: "100%", marginTop: "6px" }}
              disabled={submitting || !name || !email || !password}
            >
              {submitting ? "Cadastrando..." : "Cadastrar Usuário"}
            </button>
          </form>
        </section>

        {/* Lista de Usuários Ativos */}
        <section className="panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <h2 style={{ fontSize: "16px", margin: "0 0 6px" }}>Usuários Cadastrados</h2>
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
                {users.length} colaborador(es) com acesso liberado ao portal.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={loadUsers}
              style={{ fontSize: "11px", padding: "6px 10px" }}
            >
              🔄 Atualizar
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Data de Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {users.length ? (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="strong">{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <span
                          className="nav-badge"
                          style={{
                            fontSize: "10px",
                            padding: "2px 8px",
                            background: u.role === "admin" ? "var(--foco-red-subtle)" : "#F3F4F6",
                            color: u.role === "admin" ? "var(--foco-red)" : "var(--muted)",
                            border: `1px solid ${u.role === "admin" ? "var(--foco-red-light)" : "var(--line)"}`,
                          }}
                        >
                          {u.role === "admin" ? "ADMINISTRADOR" : "VISUALIZAÇÃO"}
                        </span>
                      </td>
                      <td>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="empty" style={{ textAlign: "center", padding: "30px" }}>
                      {loading ? "Carregando usuários..." : "Nenhum usuário encontrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
