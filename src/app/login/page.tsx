"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

type Tab = "login" | "criar";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Cadastro analista
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await signIn.email({ email, password });
      if (res?.error) {
        setLoginError(res.error.message || "E-mail ou senha inválidos.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Erro ao efetuar login.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setSignupError("");
    setSignupSuccess("");
    if (newPassword !== newPassword2) {
      setSignupError("As senhas não coincidem.");
      return;
    }
    if (newPassword.length < 8) {
      setSignupError("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    setSignupLoading(true);
    try {
      const res = await signUp.email({
        name: newName,
        email: newEmail,
        password: newPassword,
      });
      if (res?.error) {
        setSignupError(res.error.message || "Erro ao criar analista.");
      } else {
        setSignupSuccess("Analista criado com sucesso! Aguardando aprovação do administrador.");
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewPassword2("");
      }
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : "Erro ao criar analista.");
    } finally {
      setSignupLoading(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: "480px", paddingTop: "60px" }}>
      <div className="panel" style={{ padding: "32px 28px" }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foco-logo.png"
            alt="Foco Aluguel de Carros"
            style={{ height: "48px", margin: "0 auto 12px", display: "block" }}
          />
          <h1 style={{ fontSize: "20px", marginBottom: "6px" }}>Módulo de Pedágios</h1>
          <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
            Acesso autenticado ao sistema de gestão e cobrança
          </p>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: "0", marginBottom: "24px", borderBottom: "2px solid var(--line)" }}>
          <button
            type="button"
            onClick={() => { setTab("login"); setLoginError(""); }}
            style={{
              flex: 1,
              padding: "10px 0",
              background: "none",
              border: "none",
              borderBottom: tab === "login" ? "2px solid var(--brand)" : "2px solid transparent",
              marginBottom: "-2px",
              cursor: "pointer",
              fontWeight: tab === "login" ? 700 : 400,
              color: tab === "login" ? "var(--brand)" : "var(--muted)",
              fontSize: "13px",
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setTab("criar"); setSignupError(""); setSignupSuccess(""); }}
            style={{
              flex: 1,
              padding: "10px 0",
              background: "none",
              border: "none",
              borderBottom: tab === "criar" ? "2px solid var(--brand)" : "2px solid transparent",
              marginBottom: "-2px",
              cursor: "pointer",
              fontWeight: tab === "criar" ? 700 : 400,
              color: tab === "criar" ? "var(--brand)" : "var(--muted)",
              fontSize: "13px",
            }}
          >
            Criar Analista
          </button>
        </div>

        {/* === ABA LOGIN === */}
        {tab === "login" && (
          <>
            {loginError && (
              <div className="notice error-notice" style={{ marginBottom: "18px" }}>
                {loginError}
              </div>
            )}
            <form onSubmit={handleLogin} style={{ display: "grid", gap: "16px" }}>
              <label className="search-field">
                E-mail institucional
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.nome@focoalugueldecarros.com.br"
                  required
                  autoFocus
                />
              </label>

              <label className="search-field">
                Senha
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>

              <button
                type="submit"
                className="button primary"
                style={{ width: "100%", marginTop: "6px" }}
                disabled={loginLoading || !email || !password}
              >
                {loginLoading ? "Autenticando…" : "Acessar Plataforma"}
              </button>
            </form>
          </>
        )}

        {/* === ABA CRIAR ANALISTA === */}
        {tab === "criar" && (
          <>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px", lineHeight: "1.5" }}>
              Cria um novo perfil de <strong>Analista</strong> (somente leitura). O acesso será validado pelo administrador.
            </p>

            {signupError && (
              <div className="notice error-notice" style={{ marginBottom: "18px" }}>
                {signupError}
              </div>
            )}
            {signupSuccess && (
              <div className="notice" style={{ marginBottom: "18px", background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}>
                ✅ {signupSuccess}
              </div>
            )}

            <form onSubmit={handleSignup} style={{ display: "grid", gap: "14px" }}>
              <label className="search-field">
                Nome completo
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: João Silva"
                  required
                />
              </label>

              <label className="search-field">
                E-mail institucional
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="seu.nome@focoalugueldecarros.com.br"
                  required
                />
              </label>

              <label className="search-field">
                Senha (mín. 8 caracteres)
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>

              <label className="search-field">
                Confirmar senha
                <input
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>

              <button
                type="submit"
                className="button primary"
                style={{ width: "100%", marginTop: "4px" }}
                disabled={signupLoading || !newName || !newEmail || !newPassword || !newPassword2}
              >
                {signupLoading ? "Criando…" : "Criar Analista"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
