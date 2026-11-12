/**
 * Agendador interno: roda a rotina automática a cada N minutos dentro do próprio servidor.
 * Ligado por AGENDADOR_INTERNO=true (ex.: produção no ECS, com o container sempre ligado).
 * Intervalo em AGENDADOR_INTERVALO_MIN (padrão 60, mínimo 5).
 */
const PRIMEIRA_EXECUCAO_MS = 60_000;
type Estado = { iniciado: boolean; timer?: ReturnType<typeof setInterval> };
const globalForAgendador = globalThis as unknown as { agendadorPedagios?: Estado };

export function agendadorLigado() {
  return process.env.AGENDADOR_INTERNO?.trim().toLowerCase() === "true";
}

export function intervaloAgendadorMin() {
  const valor = Number(process.env.AGENDADOR_INTERVALO_MIN);
  return Number.isFinite(valor) && valor >= 5 ? Math.floor(valor) : 60;
}

async function rodar() {
  try {
    const { executarRotina } = await import("@/lib/services/rotina");
    const resultado = await executarRotina("AGENDADOR");
    console.log(`[agendador] Rotina ${resultado.status === "IGNORADA" ? "ignorada (outra em andamento)" : "concluída"}.`);
  } catch (error) {
    console.error("[agendador] Falha na rotina:", error instanceof Error ? error.message : error);
  }
}

/** Inicia uma única vez por processo (o modo de desenvolvimento recarrega módulos; o estado fica em globalThis). */
export function iniciarAgendador() {
  if (!agendadorLigado()) return;
  const estado = (globalForAgendador.agendadorPedagios ??= { iniciado: false });
  if (estado.iniciado) return;
  estado.iniciado = true;
  const minutos = intervaloAgendadorMin();
  console.log(`[agendador] Ligado: rotina a cada ${minutos} min (primeira execução em 1 min).`);
  setTimeout(() => void rodar(), PRIMEIRA_EXECUCAO_MS).unref?.();
  estado.timer = setInterval(() => void rodar(), minutos * 60_000);
  estado.timer.unref?.();
}
