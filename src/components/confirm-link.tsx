"use client";
import type { ReactNode } from "react";
import { useConfirm } from "@/components/confirm-provider";

/** Link de ação (ex.: download) que pede confirmação no card do sistema antes de abrir. */
export function ConfirmLink({ href, titulo, mensagem, confirmarTexto, className, download, children }: { href: string; titulo: string; mensagem?: string; confirmarTexto?: string; className?: string; download?: boolean; children: ReactNode }) {
  const confirmar = useConfirm();
  return (
    <a
      className={className}
      href={href}
      download={download}
      onClick={async (event) => {
        event.preventDefault();
        if (!(await confirmar({ titulo, mensagem, confirmarTexto }))) return;
        const link = document.createElement("a");
        link.href = href;
        if (download) link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }}
    >
      {children}
    </a>
  );
}
