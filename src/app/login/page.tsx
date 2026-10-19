"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await signIn.email({
        email,
        password,
      });

      if (res?.error) {
        setError(res.error.message || "E-mail ou senha inválidos.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao efetuar login.");
    } finally {
      setLoading(false);
    }
  }

  function fillProfile(userEmail: string, userPass: string) {
    setEmail(userEmail);
    setPassword(userPass);
    setError("");
  }

  return (
    <main className="shell" style={{ maxWidth: "480px", paddingTop: "60px" }}>
      <div className="panel" style={{ padding: "32px 28px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
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

        {error && (
          <div className="notice error-notice" style={{ marginBottom: "18px" }}>
            {error}
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
            disabled={loading || !email || !password}
          >
            {loading ? "Autenticando…" : "Acessar Plataforma"}
          </button>
        </form>

        <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "12px", textAlign: "center" }}>
            Perfis de Acesso Disponíveis
          </span>

          <div style={{ display: "grid", gap: "10px" }}>
            <button
              type="button"
              className="button secondary"
              style={{
                width: "100%",
                justifyContent: "space-between",
                padding: "10px 14px",
                fontSize: "12px",
              }}
              onClick={() => fillProfile("admin@focoalugueldecarros.com.br", "FocoAdmin2026!")}
            >
              <span>
                <strong>ADMINISTRADOR</strong> (Acesso Total)
              </span>
              <span className="nav-badge" style={{ fontSize: "9px", padding: "2px 6px" }}>
                Admin
              </span>
            </button>

            <button
              type="button"
              className="button secondary"
              style={{
                width: "100%",
                justifyContent: "space-between",
                padding: "10px 14px",
                fontSize: "12px",
              }}
              onClick={() => fillProfile("visualizador@focoalugueldecarros.com.br", "FocoViewer2026!")}
            >
              <span>
                <strong>VISUALIZAÇÃO</strong> (Somente Leitura)
              </span>
              <span
                className="status status-pendente"
                style={{ fontSize: "9px", padding: "2px 6px" }}
              >
                Viewer
              </span>
            </button>
          </div>

          <div style={{ marginTop: "16px", fontSize: "11px", color: "var(--muted)", lineHeight: "1.4" }}>
            <p style={{ margin: "0 0 6px" }}>
              <strong>Perfil Admin:</strong> Permite compilar novos lotes, realizar baixa manual e sincronizar com a ConectCar.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Perfil Visualização:</strong> Permite navegar nos dashboards, consultar lotes e passagens sem permissão de mutação.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

