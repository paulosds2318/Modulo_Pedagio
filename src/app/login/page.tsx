"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await signIn.email({ email, password });
      if (res?.error) {
        setLoginError("E-mail ou senha inválidos. Verifique suas credenciais.");
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1a0000 0%, #3d0000 40%, #C20000 80%, #F20000 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Círculos decorativos */}
      <div
        style={{
          position: "absolute",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.06)",
          top: "-120px",
          right: "-120px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "350px",
          height: "350px",
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.06)",
          bottom: "-80px",
          left: "-80px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          background: "rgba(242,0,0,0.15)",
          top: "30%",
          left: "10%",
          pointerEvents: "none",
          filter: "blur(40px)",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo e título acima do card */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foco-logo-white.png"
            alt="Foco Aluguel de Carros"
            style={{
              height: "52px",
              margin: "0 auto 16px",
              display: "block",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
            }}
          />
          <h1
            style={{
              color: "#fff",
              fontSize: "22px",
              fontWeight: 700,
              margin: "0 0 6px",
              letterSpacing: "-0.3px",
            }}
          >
            Módulo de Pedágios
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "13px", margin: 0 }}>
            Acesso restrito para colaboradores autorizados
          </p>
        </div>

        {/* Card de Login */}
        <div
          style={{
            background: "#fff",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ padding: "32px 28px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#1a1a1a",
                margin: "0 0 4px",
                textAlign: "center",
              }}
            >
              Identificação do Colaborador
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "#6B7280",
                margin: "0 0 24px",
                textAlign: "center",
              }}
            >
              Entre com suas credenciais corporativas
            </p>

            {loginError && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  marginBottom: "20px",
                  fontSize: "13px",
                }}
              >
                ⚠️ {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: "grid", gap: "18px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#494949",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  E-mail institucional
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@focoalugueldecarros.com.br"
                  required
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    fontSize: "14px",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: "8px",
                    outline: "none",
                    boxSizing: "border-box",
                    color: "#1a1a1a",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#F20000";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E5E7EB";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#494949",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Senha de acesso
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    fontSize: "14px",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: "8px",
                    outline: "none",
                    boxSizing: "border-box",
                    color: "#1a1a1a",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#F20000";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E5E7EB";
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading || !email || !password}
                style={{
                  width: "100%",
                  padding: "13px",
                  background:
                    loginLoading || !email || !password
                      ? "#ccc"
                      : "linear-gradient(135deg, #F20000, #C20000)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor:
                    loginLoading || !email || !password ? "not-allowed" : "pointer",
                  letterSpacing: "0.3px",
                  boxShadow: "0 4px 12px rgba(242,0,0,0.3)",
                  transition: "all 0.2s",
                  marginTop: "4px",
                }}
              >
                {loginLoading ? "Autenticando..." : "Acessar Plataforma →"}
              </button>
            </form>
          </div>

          {/* Rodapé informativo */}
          <div
            style={{
              padding: "14px 28px",
              background: "#F9FAFB",
              borderTop: "1px solid #F3F4F6",
              textAlign: "center",
              fontSize: "11px",
              color: "#6B7280",
            }}
          >
            Novos acessos são criados exclusivamente pela gestão de administradores.
          </div>
        </div>
      </div>
    </div>
  );
}
