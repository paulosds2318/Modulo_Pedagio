"use client";
import type { ReactNode } from "react";

/** Link de ação (ex.: download) que pede confirmação antes de abrir. */
export function ConfirmLink({ href, mensagem, className, download, children }: { href: string; mensagem: string; className?: string; download?: boolean; children: ReactNode }) {
  return (
    <a
      className={className}
      href={href}
      download={download}
      onClick={(event) => {
        if (!window.confirm(mensagem)) event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
