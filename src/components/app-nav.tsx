import Link from "next/link";
export function AppNav() { return <nav className="app-nav" aria-label="Navegação principal"><Link className="nav-brand" href="/">FOCO <span>· Pedágios</span></Link><div><Link href="/">Visão geral</Link><Link href="/compilacao">Compilar passagens</Link><Link href="/lotes">Lotes e cobranças</Link></div></nav>; }
