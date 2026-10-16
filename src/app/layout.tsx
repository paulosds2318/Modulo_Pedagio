import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";
export const metadata: Metadata = { title: "Gestão de Pedágios | Foco", description: "Gestão e cobrança de passagens de pedágio" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><AppNav />{children}</body></html>; }
