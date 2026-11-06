import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { maskCpf, maskName, maskPhone } from "@/lib/pii";
import { consultarNomeCliente } from "@/lib/services/coral-pay-by-link";

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
    // Lotes anteriores ao campo nomeCliente: busca o nome no contrato do Coral uma vez e grava.
    if (lot && !lot.nomeCliente) {
      const nome = await consultarNomeCliente(lot.numeroContrato).catch(() => null);
      if (nome) {
        await db.loteCobranca.update({ where: { id: lot.id }, data: { nomeCliente: nome } });
        lot.nomeCliente = nome;
      }
    }
    const isAdmin = hasRole(session, "admin");
    return lot
      ? NextResponse.json(isAdmin ? lot : {
          ...lot,
          cpfCliente: maskCpf(lot.cpfCliente),
          nomeCliente: maskName(lot.nomeCliente),
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
