import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#F20000",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Gestão de Pedágios | Foco Aluguel de Carros",
  description: "Módulo de Gestão e Régua de Cobrança de Pedágios Integrado ao Coral",
  icons: {
    icon: "/foco-icon.png",
    shortcut: "/foco-icon.png",
    apple: "/foco-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
