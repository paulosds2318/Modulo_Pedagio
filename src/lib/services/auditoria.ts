import { db } from "@/lib/db";

export const ACOES_AUDITORIA: Record<string, string> = {
  COMPILAR_LOTE: "Compilou lote manualmente",
  CONSULTAR_ADYEN: "Consultou status na Adyen",
  SINCRONIZAR_CORAL: "Sincronizou passagens com o Coral",
  EXPORTAR_RELATORIO: "Exportou relatório do painel",
  ALTERAR_PRAZOS_REGUA: "Alterou os prazos da régua",
  CRIAR_USUARIO: "Criou usuário",
  EDITAR_USUARIO: "Editou usuário",
  EXCLUIR_USUARIO: "Excluiu usuário",
};

type SessaoLike = { user?: { id?: string; email?: string; name?: string } } | null | undefined;

/**
 * Registra uma ação de usuário. Nunca lança erro: falha ao auditar não pode impedir a operação.
 * Não grave senhas, tokens nem dados de pagamento em `detalhes`.
 */
export async function registrarAuditoria(
  sessao: SessaoLike,
  request: Request | null,
  acao: string,
  extra: { entidade?: string; entidadeId?: string | number; detalhes?: unknown } = {}
) {
  try {
    const ip = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || null;
    const detalhes = extra.detalhes === undefined ? null : typeof extra.detalhes === "string" ? extra.detalhes : JSON.stringify(extra.detalhes);
    await db.auditoriaUsuario.create({
      data: {
        usuarioId: sessao?.user?.id ?? null,
        usuarioEmail: sessao?.user?.email ?? null,
        usuarioNome: sessao?.user?.name ?? null,
        acao,
        entidade: extra.entidade ?? null,
        entidadeId: extra.entidadeId === undefined ? null : String(extra.entidadeId),
        detalhes: detalhes?.slice(0, 2000) ?? null,
        ip: ip?.slice(0, 100) ?? null,
      },
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria:", error instanceof Error ? error.message : error);
  }
}
