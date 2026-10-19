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

  // Cadastro
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
        setSignupError(res.error.message || "Erro ao criar usuário.");
      } else {
        setSignupSuccess("Usuário criado com sucesso! Faça login para acessar.");
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewPassword2("");
        setTimeout(() => setTab("login"), 2000);
      }
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : "Erro ao criar usuário.");
    } finally {
      setSignupLoading(false);
    }
  }

  const activeTabStyle: React.CSSProperties = {
    borderBottom: "3px solid #F20000",
    color: "#F20000",
    fontWeight: 700,
  };
  const inactiveTabStyle: React.CSSProperties = {
    borderBottom: "3px solid transparent",
    color: "rgba(255,255,255,0.6)",
    fontWeight: 400,
  };

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
      <div style={{
        position: "absolute", width: "500px", height: "500px",
        borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)",
        top: "-120px", right: "-120px", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: "350px", height: "350px",
        borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)",
        bottom: "-80px", left: "-80px", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: "200px", height: "200px",
        borderRadius: "50%", background: "rgba(242,0,0,0.15)",
        top: "30%", left: "10%", pointerEvents: "none", filter: "blur(40px)",
      }} />

      <div style={{
        width: "100%",
        maxWidth: "440px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Logo e título acima do card */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foco-logo-white.png"
            alt="Foco Aluguel de Carros"
            style={{ height: "52px", margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
          />
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.3px" }}>
            Módulo de Pedágios
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "13px", margin: 0 }}>
            Gestão e cobrança de passagens viárias
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#fff",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.2)",
        }}>
          {/* Abas */}
          <div style={{
            display: "flex",
            background: "#1a0000",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            {(["login", "criar"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setLoginError(""); setSignupError(""); setSignupSuccess(""); }}
                style={{
                  flex: 1,
                  padding: "14px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  transition: "all 0.2s",
                  ...(tab === t ? activeTabStyle : inactiveTabStyle),
                }}
              >
                {t === "login" ? "Entrar" : "Criar Usuário"}
              </button>
            ))}
          </div>

          {/* Conteúdo do card */}
          <div style={{ padding: "32px 28px" }}>

            {/* === ABA LOGIN === */}
            {tab === "login" && (
              <>
                {loginError && (
                  <div style={{
                    background: "#FEF2F2", border: "1px solid #FECACA",
                    color: "#991B1B", borderRadius: "8px",
                    padding: "12px 14px", marginBottom: "20px", fontSize: "13px",
                  }}>
                    ⚠️ {loginError}
                  </div>
                )}

                <form onSubmit={handleLogin} style={{ display: "grid", gap: "18px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#494949", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@focoalugueldecarros.com.br"
                      required
                      autoFocus
                      style={{
                        width: "100%", padding: "11px 14px", fontSize: "14px",
                        border: "1.5px solid #E5E7EB", borderRadius: "8px",
                        outline: "none", boxSizing: "border-box", color: "#1a1a1a",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "#F20000"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#494949", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Senha
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{
                        width: "100%", padding: "11px 14px", fontSize: "14px",
                        border: "1.5px solid #E5E7EB", borderRadius: "8px",
                        outline: "none", boxSizing: "border-box", color: "#1a1a1a",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "#F20000"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading || !email || !password}
                    style={{
                      width: "100%", padding: "13px",
                      background: loginLoading || !email || !password ? "#ccc" : "linear-gradient(135deg, #F20000, #C20000)",
                      color: "#fff", border: "none", borderRadius: "8px",
                      fontSize: "14px", fontWeight: 700, cursor: loginLoading || !email || !password ? "not-allowed" : "pointer",
                      letterSpacing: "0.3px", boxShadow: "0 4px 12px rgba(242,0,0,0.3)",
                      transition: "all 0.2s", marginTop: "4px",
                    }}
                  >
                    {loginLoading ? "Autenticando…" : "Acessar Plataforma →"}
                  </button>
                </form>
              </>
            )}

            {/* === ABA CRIAR USUÁRIO === */}
            {tab === "criar" && (
              <>
                <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "20px", lineHeight: "1.6", background: "#F9FAFB", padding: "10px 12px", borderRadius: "8px", borderLeft: "3px solid #F20000" }}>
                  Cria um novo perfil de <strong>Analista</strong> com acesso de leitura ao sistema.
                </p>

                {signupError && (
                  <div style={{
                    background: "#FEF2F2", border: "1px solid #FECACA",
                    color: "#991B1B", borderRadius: "8px",
                    padding: "12px 14px", marginBottom: "18px", fontSize: "13px",
                  }}>
                    ⚠️ {signupError}
                  </div>
                )}
                {signupSuccess && (
                  <div style={{
                    background: "#F0FDF4", border: "1px solid #86EFAC",
                    color: "#166534", borderRadius: "8px",
                    padding: "12px 14px", marginBottom: "18px", fontSize: "13px",
                  }}>
                    ✅ {signupSuccess}
                  </div>
                )}

                <form onSubmit={handleSignup} style={{ display: "grid", gap: "16px" }}>
                  {[
                    { label: "Nome completo", value: newName, setter: setNewName, type: "text", placeholder: "Ex.: João Silva" },
                    { label: "E-mail institucional", value: newEmail, setter: setNewEmail, type: "email", placeholder: "seu.email@focoalugueldecarros.com.br" },
                    { label: "Senha (mín. 8 caracteres)", value: newPassword, setter: setNewPassword, type: "password", placeholder: "••••••••" },
                    { label: "Confirmar senha", value: newPassword2, setter: setNewPassword2, type: "password", placeholder: "••••••••" },
                  ].map(({ label, value, setter, type, placeholder }) => (
                    <div key={label}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#494949", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {label}
                      </label>
                      <input
                        type={type}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={placeholder}
                        required
                        style={{
                          width: "100%", padding: "11px 14px", fontSize: "14px",
                          border: "1.5px solid #E5E7EB", borderRadius: "8px",
                          outline: "none", boxSizing: "border-box", color: "#1a1a1a",
                          transition: "border-color 0.2s",
                        }}
                        onFocus={(e) => { e.target.style.borderColor = "#F20000"; }}
                        onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; }}
                      />
                    </div>
                  ))}

                  <button
                    type="submit"
                    disabled={signupLoading || !newName || !newEmail || !newPassword || !newPassword2}
                    style={{
                      width: "100%", padding: "13px",
                      background: signupLoading || !newName || !newEmail || !newPassword || !newPassword2 ? "#ccc" : "linear-gradient(135deg, #F20000, #C20000)",
                      color: "#fff", border: "none", borderRadius: "8px",
                      fontSize: "14px", fontWeight: 700,
                      cursor: signupLoading || !newName || !newEmail || !newPassword || !newPassword2 ? "not-allowed" : "pointer",
                      letterSpacing: "0.3px", boxShadow: "0 4px 12px rgba(242,0,0,0.3)",
                      transition: "all 0.2s", marginTop: "4px",
                    }}
                  >
                    {signupLoading ? "Criando…" : "Criar Usuário →"}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Rodapé do card */}
          <div style={{
            padding: "14px 28px",
            background: "#F9FAFB",
            borderTop: "1px solid #F3F4F6",
            textAlign: "center",
            fontSize: "11px",
            color: "#9CA3AF",
          }}>
            🔒 Acesso restrito — Foco Aluguel de Carros © {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
}
