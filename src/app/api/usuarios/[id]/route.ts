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

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      role?: "admin" | "viewer";
      password?: string;
    };

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

  // Trava de segurança: impede que o próprio administrador se exclua
  if (id === currentUserId) {
    return NextResponse.json(
      { error: "Por segurança, você não pode excluir o seu próprio usuário logado." },
      { status: 400 }
    );
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
