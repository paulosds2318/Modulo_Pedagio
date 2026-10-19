import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getServerSession, hasRole } from "@/lib/auth";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "viewer"]).default("viewer"),
});
async function isAdmin() {
  const session = await getServerSession();
  return Boolean(session && hasRole(session, "admin"));
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  try {
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, banned: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponivel." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalido." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados de usuario invalidos." }, { status: 400 });
  try {
    const email = parsed.data.email.toLowerCase();
    if (await db.user.findUnique({ where: { email } })) {
      return NextResponse.json({ error: "Ja existe usuario com este email." }, { status: 409 });
    }
    const password = await hashPassword(parsed.data.password);
    const now = new Date();
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { id: randomUUID(), name: parsed.data.name, email, emailVerified: true, role: parsed.data.role, createdAt: now, updatedAt: now },
      });
      await tx.account.create({
        data: { id: randomUUID(), accountId: created.id, providerId: "credential", userId: created.id, password, createdAt: now, updatedAt: now },
      });
      return created;
    });
    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe usuario com este email." }, { status: 409 });
    }
    return NextResponse.json({ error: "Falha ao criar usuario." }, { status: 500 });
  }
}
