"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession, signOut } from "@/lib/auth-client";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const user = session?.user;
  const role = (user as { role?: string } | undefined)?.role || "viewer";
  const isAdmin = role === "admin" || role === "master";
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("toll-manager-theme");
    document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  }, []);

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("toll-manager-theme", nextTheme);
  }

  function renderThemeToggle() {
    return (
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Alternar tema claro ou escuro"
        title="Alternar tema claro ou escuro"
      >
        <span aria-hidden="true">◐</span>
        <span className="theme-toggle-label">Tema</span>
      </button>
    );
  }
  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  // Se estiver na tela de login, renderiza versão simplificada
  if (pathname === "/login") {
    return (
      <nav className="app-nav" aria-label="Navegação simplificada">
        <div className="nav-left">
          <Link className="nav-logo-link" href="/" title="Foco Aluguel de Carros">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/foco-logo.png"
              alt="Foco Aluguel de Carros"
              className="nav-logo-img"
            />
          </Link>
          <div className="nav-divider" />
          <span className="nav-badge">
            <span className="nav-badge-dot" />
            Pedágios
          </span>
        </div>
        <div className="nav-right">
          {renderThemeToggle()}
          <span className="coral-tag">
            <span className="coral-tag-dot" />
            Portal de Autenticação
          </span>
        </div>
      </nav>
    );
  }

  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <div className="nav-left">
        <Link className="nav-logo-link" href="/" title="Foco Aluguel de Carros">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foco-logo.png"
            alt="Foco Aluguel de Carros"
            className="nav-logo-img"
          />
        </Link>
        <div className="nav-divider" />
        <span className="nav-badge">
          <span className="nav-badge-dot" />
          Pedágios
        </span>
      </div>

      <div className="nav-links">
        <Link
          href="/"
          className={`nav-link ${pathname === "/" ? "active" : ""}`}
        >
          Visão geral
        </Link>
        <Link
          href="/compilacao"
          className={`nav-link ${pathname.startsWith("/compilacao") ? "active" : ""}`}
        >
          Compilar passagens
        </Link>
        <Link
          href="/lotes"
          className={`nav-link ${pathname.startsWith("/lotes") ? "active" : ""}`}
        >
          Lotes e cobranças
        </Link>
        {isAdmin && (
          <Link
            href="/usuarios"
            className={`nav-link ${pathname.startsWith("/usuarios") ? "active" : ""}`}
            style={{ fontWeight: 700 }}
          >
            👥 Gestão de usuários
          </Link>
        )}
      </div>

      <div className="nav-right" style={{ gap: "10px" }}>
        {renderThemeToggle()}
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>
                {user.name || user.email}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: isAdmin ? "var(--foco-red-subtle)" : "#F3F4F6",
                  color: isAdmin ? "var(--foco-red)" : "var(--muted)",
                  border: `1px solid ${isAdmin ? "var(--foco-red-light)" : "var(--line)"}`,
                }}
              >
                {role === "master" ? "Perfil Master" : isAdmin ? "Perfil Admin" : "Perfil Visualização"}
              </span>
            </div>

            <button
              onClick={handleSignOut}
              className="button secondary"
              style={{ padding: "6px 10px", fontSize: "11px" }}
              title="Encerrar sessão"
            >
              Sair
            </button>
          </div>
        ) : !isPending ? (
          <Link
            href="/login"
            className="button secondary"
            style={{ padding: "7px 12px", fontSize: "12px" }}
          >
            Entrar
          </Link>
        ) : null}

        <span className="coral-tag">
          <span className="coral-tag-dot" />
          Coral Integrado
        </span>
      </div>
    </nav>
  );
}
