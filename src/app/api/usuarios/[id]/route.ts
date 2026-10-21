import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { hashPassword } from "better-auth/crypto";

export const runtime = "nodejs";

// PUT /api/usuarios/[id] - Atualiza dados do usuário (Nome, Perfil, Senha opcional)
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session || !hasRole(session, "admin")) {
    return NextResponse.json(
      { error: "Acesso restrito ao perfil de Administrador." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Por segurança, não é permitido editar o próprio usuário." }, { status: 403 });
  }

  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  const isMaster = hasRole(session, "master");
  if (target.role === "master") {
    return NextResponse.json({ error: "A conta master não pode ser editada." }, { status: 403 });
  }
  if (target.role === "admin" && !isMaster) {
    return NextResponse.json({ error: "Somente o administrador master pode editar outros administradores." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      role?: "admin" | "viewer";
      password?: string;
    };

    if (body.role === "admin" && !isMaster) {
      return NextResponse.json({ error: "Somente o administrador master pode atribuir o perfil de administrador." }, { status: 403 });
    }
    const name = body.name?.trim();
    const newRole = body.role === "admin" ? "admin" : "viewer";
    const password = body.password?.trim();

    if (!name) {
      return NextResponse.json(
        { error: "O nome do usuário é obrigatório." },
        { status: 400 }
      );
    }

    if (password && password.length < 8) {
      return NextResponse.json({ error: "A nova senha deve ter pelo menos 8 caracteres." }, { status: 400 });
    }

    const hashedPassword = password ? await hashPassword(password) : null;
    const updatedUser = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name, role: newRole, updatedAt: new Date() },
      });
      if (hashedPassword) {
        const result = await tx.account.updateMany({
          where: { userId: id, providerId: "credential" },
          data: { password: hashedPassword, updatedAt: new Date() },
        });
        if (!result.count) throw new Error("Credential account not found.");
      }
      return updated;
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar usuário." },
      { status: 500 }
    );
  }
}

// DELETE /api/usuarios/[id] - Exclui um usuário do sistema
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  const currentUserId = session?.user.id;

  if (!session || !hasRole(session, "admin")) {
    return NextResponse.json(
      { error: "Acesso restrito ao perfil de Administrador." },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  if (id === currentUserId) {
    return NextResponse.json({ error: "Por segurança, não é permitido excluir o próprio usuário." }, { status: 403 });
  }

  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.role === "master") return NextResponse.json({ error: "A conta master não pode ser excluída." }, { status: 403 });
  if (target.role === "admin" && !hasRole(session, "master")) {
    return NextResponse.json({ error: "Somente o administrador master pode excluir outros administradores." }, { status: 403 });
  }
  try {
    // Cascade exclui contas e sessões
    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Usuário removido com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao excluir usuário." },
      { status: 500 }
    );
  }
}
