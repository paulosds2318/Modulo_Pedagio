import { db } from "@/lib/db";
import { PRAZOS_PADRAO, type PrazosRegua } from "@/lib/regua-config";

/** Prazos atuais da régua; se o registro não existir, usa e grava os padrões (2, 5 e 7 dias; link de 48 h). */
export async function obterPrazosRegua(): Promise<PrazosRegua & { atualizadoEm: Date | null; atualizadoPor: string | null }> {
  const cfg = await db.configuracaoRegua.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...PRAZOS_PADRAO } });
  return {
    diasPrimeiraTentativa: cfg.diasPrimeiraTentativa,
    diasLembrete: cfg.diasLembrete,
    diasSegundaTentativa: cfg.diasSegundaTentativa,
    validadeLinkHoras: cfg.validadeLinkHoras,
    atualizadoEm: cfg.atualizadoEm,
    atualizadoPor: cfg.atualizadoPor,
  };
}

export async function salvarPrazosRegua(prazos: PrazosRegua, atualizadoPor: string) {
  return db.configuracaoRegua.upsert({ where: { id: 1 }, update: { ...prazos, atualizadoPor }, create: { id: 1, ...prazos, atualizadoPor } });
}
