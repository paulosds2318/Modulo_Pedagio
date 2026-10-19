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
        background: "radial-gradient(ellipse at 50% -20%, #FAFBFB 0%, #EEF2F4 60%, #E2E8F0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
      }}
    >
      {/* Barra superior de acento com a cor institucional Foco */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #F20000 0%, #C20000 100%)",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo Foco Institucional */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foco-logo.png"
            alt="Foco Aluguel de Carros"
            style={{
              height: "46px",
              margin: "0 auto 14px",
              display: "block",
            }}
          />
          <h1
            style={{
              color: "#1C2024",
              fontSize: "20px",
              fontWeight: 800,
              margin: "0 0 4px",
              letterSpacing: "-0.4px",
            }}
          >
            Módulo de Pedágios
          </h1>
          <p style={{ color: "#5F6B76", fontSize: "13px", margin: 0 }}>
            Portal Seguro de Gestão e Cobrança
          </p>
        </div>

        {/* Card Branco Clean & Corporativo */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "14px",
            padding: "32px 28px",
            boxShadow:
              "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 25px -5px rgba(0, 0, 0, 0.08)",
            border: "1px solid #E5E9EC",
          }}
        >
          <div style={{ marginBottom: "22px" }}>
            <h2
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#1C2024",
                margin: "0 0 4px",
              }}
            >
              Acessar sua conta
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "#5F6B76",
                margin: 0,
              }}
            >
              Insira suas credenciais corporativas
            </p>
          </div>

          {loginError && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                borderRadius: "8px",
                padding: "11px 13px",
                marginBottom: "18px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>⚠️</span>
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: "grid", gap: "16px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#3B424A",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                E-mail Corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome.sobrenome@focoalugueldecarros.com.br"
                required
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 13px",
                  fontSize: "13px",
                  border: "1.5px solid #E5E9EC",
                  borderRadius: "8px",
                  outline: "none",
                  boxSizing: "border-box",
                  color: "#1C2024",
                  background: "#FAFBFB",
                  transition: "all 0.15s ease",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#F20000";
                  e.target.style.background = "#FFFFFF";
                  e.target.style.boxShadow = "0 0 0 3px rgba(242, 0, 0, 0.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#E5E9EC";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#3B424A",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: "100%",
                  padding: "10px 13px",
                  fontSize: "13px",
                  border: "1.5px solid #E5E9EC",
                  borderRadius: "8px",
                  outline: "none",
                  boxSizing: "border-box",
                  color: "#1C2024",
                  background: "#FAFBFB",
                  transition: "all 0.15s ease",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#F20000";
                  e.target.style.background = "#FFFFFF";
                  e.target.style.boxShadow = "0 0 0 3px rgba(242, 0, 0, 0.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#E5E9EC";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading || !email || !password}
              style={{
                width: "100%",
                padding: "11px 14px",
                background:
                  loginLoading || !email || !password
                    ? "#CBD5E1"
                    : "#F20000",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                cursor:
                  loginLoading || !email || !password ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                marginTop: "4px",
                boxShadow:
                  loginLoading || !email || !password
                    ? "none"
                    : "0 2px 6px rgba(242, 0, 0, 0.25)",
              }}
              onMouseEnter={(e) => {
                if (!loginLoading && email && password) {
                  (e.target as HTMLElement).style.background = "#D90000";
                }
              }}
              onMouseLeave={(e) => {
                if (!loginLoading && email && password) {
                  (e.target as HTMLElement).style.background = "#F20000";
                }
              }}
            >
              {loginLoading ? "Entrando..." : "Entrar na Plataforma"}
            </button>
          </form>

          <div
            style={{
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "1px solid #EEF2F4",
              textAlign: "center",
              fontSize: "11px",
              color: "#8B98A5",
            }}
          >
            🔒 Gestão centralizada · Acessos criados por administradores Foco
          </div>
        </div>
      </div>
    </div>
  );
}
