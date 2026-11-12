/** Executado uma vez quando o servidor Next.js inicia (ver node_modules/next/dist/docs/01-app/02-guides/instrumentation.md). */
export async function register() {
  // Só no servidor Node.js e nunca durante o build.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.AGENDADOR_INTERNO?.trim().toLowerCase() !== "true") return;
  const { iniciarAgendador } = await import("./lib/agendador");
  iniciarAgendador();
}
