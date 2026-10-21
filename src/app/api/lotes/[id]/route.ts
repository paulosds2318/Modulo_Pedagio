import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { maskCpf, maskPhone } from "@/lib/pii";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
function parseId(raw: string) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Autenticacao necessaria." }, { status: 401 });
  const id = parseId((await context.params).id);
  if (!id) return NextResponse.json({ error: "ID de lote invalido." }, { status: 400 });

  try {
    const lot = await db.loteCobranca.findUnique({
      where: { id },
      include: {
        passagens: { orderBy: { dataHora: "asc" } },
        logs: { orderBy: { dataHora: "desc" } },
      },
    });
    const isAdmin = hasRole(session, "admin");
    return lot
      ? NextResponse.json(isAdmin ? lot : {
          ...lot,
          cpfCliente: maskCpf(lot.cpfCliente),
          telefoneCliente: maskPhone(lot.telefoneCliente),
          passagens: lot.passagens.map((passage) => ({
            ...passage,
            cpfCliente: maskCpf(passage.cpfCliente),
            telefoneCliente: maskPhone(passage.telefoneCliente),
          })),
          logs: lot.logs.map((log) => ({ ...log, detalhesResposta: "Detalhes disponíveis apenas para administradores." })),
        })
      : NextResponse.json({ error: "Lote nao encontrado." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponivel." }, { status: 503 });
  }
}
