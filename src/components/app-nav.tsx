"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNav() {
  const pathname = usePathname();

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
      </div>

      <div className="nav-right">
        <span className="coral-tag">
          <span className="coral-tag-dot" />
          Coral Integrado
        </span>
      </div>
    </nav>
  );
}
