import { db } from "@/lib/db";
import { PRAZOS_PADRAO, type PrazosRegua } from "@/lib/regua-config";

/** Prazos atuais da régua; se o registro não existir, usa e grava os padrões (5, 7 e 10 dias). */
export async function obterPrazosRegua(): Promise<PrazosRegua & { atualizadoEm: Date | null; atualizadoPor: string | null }> {
  const cfg = await db.configuracaoRegua.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...PRAZOS_PADRAO } });
  return {
    diasPrimeiraTentativa: cfg.diasPrimeiraTentativa,
    diasLembrete: cfg.diasLembrete,
    diasSegundaTentativa: cfg.diasSegundaTentativa,
    atualizadoEm: cfg.atualizadoEm,
    atualizadoPor: cfg.atualizadoPor,
  };
}

export async function salvarPrazosRegua(prazos: PrazosRegua, atualizadoPor: string) {
  return db.configuracaoRegua.upsert({ where: { id: 1 }, update: { ...prazos, atualizadoPor }, create: { id: 1, ...prazos, atualizadoPor } });
}
