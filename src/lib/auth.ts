import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { admin } from "better-auth/plugins";
import { db } from "./db.ts";
import { timingSafeEqual } from "node:crypto";

const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: authSecret || "local-development-secret-only-do-not-deploy",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [admin({ defaultRole: "viewer", adminRoles: ["admin", "master"] })],
});

export type UserRole = "master" | "admin" | "viewer";
export const MASTER_ADMIN_EMAIL = (process.env.MASTER_ADMIN_EMAIL || "paulo.marrocos@aluguefoco.com.br").trim().toLowerCase();
export function isMasterEmail(email: string) {
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

export async function getServerSession() {
  try {
    if (process.env.NODE_ENV === "production" && !authSecret) return null;
    const { headers } = await import("next/headers");
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}

export function hasRole(session: unknown, role: UserRole): boolean {
  if (!session || typeof session !== "object" || !("user" in session)) return false;
  const user = (session as { user?: unknown }).user;
  if (!user || typeof user !== "object") return false;
  const userRole = "role" in user ? (user as { role?: unknown }).role : undefined;
  const email = "email" in user && typeof (user as { email?: unknown }).email === "string"
    ? (user as { email: string }).email.toLowerCase()
    : "";
  if (role === "master") return userRole === "master" || email === MASTER_ADMIN_EMAIL;
  if (role === "admin") return userRole === "admin" || userRole === "master" || email === MASTER_ADMIN_EMAIL;
  return userRole === role;
}

export function hasBearerSecret(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}
