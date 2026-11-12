import { NextResponse } from "next/server";
import { getServerSession, hasRole } from "@/lib/auth";
import { validarPrazos } from "@/lib/regua-config";
import { obterPrazosRegua, salvarPrazosRegua } from "@/lib/services/config-regua";
import { registrarAuditoria } from "@/lib/services/auditoria";

export const runtime = "nodejs";

/** Prazos atuais da régua (qualquer usuário logado). */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  try {
    return NextResponse.json(await obterPrazosRegua());
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}

/** Altera os prazos (somente administradores); fica registrado na auditoria. */
export async function PUT(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasRole(session, "admin")) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = validarPrazos(body ?? {});
  if (!result.ok) return NextResponse.json({ error: result.erro }, { status: 400 });

  try {
    const antes = await obterPrazosRegua();
    await salvarPrazosRegua(result.prazos, session.user.email);
    await registrarAuditoria(session, request, "ALTERAR_PRAZOS_REGUA", {
      entidade: "configuracao_regua",
      entidadeId: 1,
      detalhes: {
        antes: { diasPrimeiraTentativa: antes.diasPrimeiraTentativa, diasLembrete: antes.diasLembrete, diasSegundaTentativa: antes.diasSegundaTentativa },
        depois: result.prazos,
      },
    });
    return NextResponse.json(await obterPrazosRegua());
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar os prazos." }, { status: 503 });
  }
}
