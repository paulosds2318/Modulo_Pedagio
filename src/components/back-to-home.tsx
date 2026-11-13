import Link from "next/link";

/** Atalho para a tela inicial, no topo das telas internas. */
export function BackToHome() {
  return (
    <div className="backline">
      <Link href="/">← Voltar para a tela inicial</Link>
    </div>
  );
}
