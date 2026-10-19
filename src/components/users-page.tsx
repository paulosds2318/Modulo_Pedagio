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
  const currentUserId = session?.user?.id;
  const role = (session?.user as { role?: string } | undefined)?.role || "viewer";
  const isAdmin = role === "admin";

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Formulário de Cadastro / Criação
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "admin">("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [formError, setFormError] = useState("");

  // Estado de Edição (Modal ou inline)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"viewer" | "admin">("viewer");
  const [editPassword, setEditPassword] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Estado de Exclusão
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

      setFormSuccess(`Usuário ${name} criado com sucesso!`);
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

  function startEdit(u: UserItem) {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role === "admin" ? "admin" : "viewer");
    setEditPassword("");
    setEditError("");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditSubmitting(true);
    setEditError("");

    try {
      const res = await fetch(`/api/usuarios/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          role: editRole,
          ...(editPassword.trim() ? { password: editPassword } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao atualizar dados.");
      }

      setEditingUser(null);
      loadUsers();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(u: UserItem) {
    if (u.id === currentUserId) {
      alert("Por segurança, você não pode excluir o seu próprio usuário logado.");
      return;
    }

    const confirmDelete = window.confirm(
      `Deseja realmente excluir o acesso do usuário "${u.name}" (${u.email})?\nEsta ação não poderá ser desfeita.`
    );
    if (!confirmDelete) return;

    setDeletingId(u.id);
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao excluir usuário.");
      }

      loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setDeletingId(null);
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
            Cadastre novos analistas, altere perfis, redefina senhas ou remova acessos ao Módulo de Pedágios.
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
              {submitting ? "Cadastrando..." : "+ Cadastrar Usuário"}
            </button>
          </form>
        </section>

        {/* Lista de Usuários Ativos com Ações de Edição e Exclusão */}
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
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.length ? (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <span className="strong">{u.name}</span>
                        {u.id === currentUserId && (
                          <span style={{ fontSize: "10px", color: "var(--foco-green)", marginLeft: "6px", fontWeight: 700 }}>
                            (Você)
                          </span>
                        )}
                      </td>
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
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => startEdit(u)}
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                            title="Editar nome, perfil ou senha"
                          >
                            ✏️ Editar
                          </button>
                          {u.id !== currentUserId && (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => handleDelete(u)}
                              disabled={deletingId === u.id}
                              style={{
                                fontSize: "11px",
                                padding: "4px 8px",
                                color: "#991B1B",
                                borderColor: "#FECACA",
                              }}
                              title="Remover acesso"
                            >
                              {deletingId === u.id ? "Excluindo..." : "🗑️ Excluir"}
                            </button>
                          )}
                        </div>
                      </td>
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

      {/* Modal / Diálogo de Edição de Usuário */}
      {editingUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              maxWidth: "440px",
              width: "100%",
              padding: "28px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "17px", margin: "0 0 4px" }}>Editar Usuário</h3>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>{editingUser.email}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--muted)" }}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="notice error-notice" style={{ marginBottom: "14px", fontSize: "12px" }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} style={{ display: "grid", gap: "14px" }}>
              <label className="search-field">
                Nome do Colaborador
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </label>

              <label className="filter-field">
                Perfil de Permissão
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "viewer" | "admin")}
                >
                  <option value="viewer">Visualização (Somente Leitura)</option>
                  <option value="admin">Administrador (Acesso Total)</option>
                </select>
              </label>

              <label className="search-field">
                Redefinir Senha (opcional)
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Deixe em branco para manter a atual"
                />
              </label>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "10px" }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditingUser(null)}
                  disabled={editSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={editSubmitting || !editName.trim()}
                >
                  {editSubmitting ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
