import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { hashPassword } from "better-auth/crypto";

export const runtime = "nodejs";

// GET /api/usuarios - Lista todos os usuários cadastrados
export async function GET() {
  const session = await getServerSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== "admin") {
    return NextResponse.json(
      { error: "Acesso restrito ao perfil de Administrador." },
      { status: 403 }
    );
  }

  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch {
    // Fallback de demonstração offline
    return NextResponse.json([
      {
        id: "usr_admin_foco",
        name: "Administrador Foco",
        email: "admin@focoalugueldecarros.com.br",
        role: "admin",
        banned: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "usr_viewer_foco",
        name: "Operador de Consulta",
        email: "visualizador@focoalugueldecarros.com.br",
        role: "viewer",
        banned: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  }
}

// POST /api/usuarios - Cria um novo usuário com perfil selecionado pelo Admin
export async function POST(request: Request) {
  const session = await getServerSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== "admin") {
    return NextResponse.json(
      { error: "Acesso restrito ao perfil de Administrador." },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "viewer";
    };

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const userRole = body.role === "admin" ? "admin" : "viewer";

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 8 caracteres." },
        { status: 400 }
      );
    }

    // Verifica se já existe
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail." },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const now = new Date();

    const newUser = await db.user.create({
      data: {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        email,
        emailVerified: true,
        role: userRole,
        createdAt: now,
        updatedAt: now,
      },
    });

    await db.account.create({
      data: {
        id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        accountId: newUser.id,
        providerId: "credential",
        userId: newUser.id,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar usuário." },
      { status: 500 }
    );
  }
}

