import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { consultarContatoCliente } from "@/lib/services/coral-pay-by-link";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
function parseId(raw: string) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const id = parseId((await context.params).id);
  if (!id) return NextResponse.json({ error: "ID de lote inválido." }, { status: 400 });

  try {
    const lot = await db.loteCobranca.findUnique({
      where: { id },
      include: {
        passagens: { orderBy: { dataHora: "asc" } },
        logs: { orderBy: { dataHora: "desc" } },
      },
    });
    // Lotes sem nome/telefone de contato: busca no contrato do Coral e grava o que faltar.
    if (lot && (!lot.nomeCliente || !lot.telefoneContato)) {
      const contato = await consultarContatoCliente(lot.numeroContrato).catch(() => null);
      const data = {
        ...(!lot.nomeCliente && contato?.nome ? { nomeCliente: contato.nome } : {}),
        ...(!lot.telefoneContato && contato?.telefone ? { telefoneContato: contato.telefone } : {}),
      };
      if (Object.keys(data).length) {
        await db.loteCobranca.update({ where: { id: lot.id }, data });
        Object.assign(lot, data);
      }
    }
    const isAdmin = hasRole(session, "admin");
    return lot
      // Nome, CPF e telefone completos para todos os perfis (os analistas já os veem no Coral);
      // apenas o detalhe técnico das integrações fica restrito a administradores.
      ? NextResponse.json(isAdmin ? lot : {
          ...lot,
          logs: lot.logs.map((log) => ({ ...log, detalhesResposta: "Detalhes disponíveis apenas para administradores." })),
        })
      : NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}
