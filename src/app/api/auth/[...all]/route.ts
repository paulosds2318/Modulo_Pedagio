import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

const betterAuthHandlers = toNextJsHandler(auth);

// Credenciais do Admin padrão quando não há banco conectado
const MOCK_ADMIN_EMAIL = "admin@focoalugueldecarros.com.br";
const MOCK_ADMIN_PASSWORD = "FocoAdmin2026!";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Se for consulta de sessão (`/api/auth/get-session`)
  if (url.pathname.endsWith("/get-session")) {
    const cookieStore = await cookies();
    const mockSession = cookieStore.get("foco_admin_session");

    if (mockSession?.value === "admin_logged_in") {
      return NextResponse.json({
        user: {
          id: "usr_admin_foco",
          name: "Administrador Foco",
          email: MOCK_ADMIN_EMAIL,
          role: "admin",
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        session: {
          id: "sess_admin_foco",
          userId: "usr_admin_foco",
          token: "foco_admin_token",
          expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        },
      });
    }

    try {
      return await betterAuthHandlers.GET(request);
    } catch {
      return NextResponse.json(null);
    }
  }

  try {
    return await betterAuthHandlers.GET(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);

  // Intercepta login por e-mail/senha (`/api/auth/sign-in/email`)
  if (url.pathname.endsWith("/sign-in/email")) {
    try {
      const cloned = request.clone();
      const body = (await cloned.json()) as { email?: string; password?: string };

      if (
        body.email?.toLowerCase().trim() === MOCK_ADMIN_EMAIL.toLowerCase() &&
        body.password === MOCK_ADMIN_PASSWORD
      ) {
        const res = NextResponse.json({
          user: {
            id: "usr_admin_foco",
            name: "Administrador Foco",
            email: MOCK_ADMIN_EMAIL,
            role: "admin",
          },
          token: "foco_admin_token",
        });

        // Configura cookies para o middleware e a sessão
        const cookieOpts = {
          path: "/",
          httpOnly: true,
          sameSite: "lax" as const,
          maxAge: 60 * 60 * 24 * 7,
        };

        res.cookies.set("better-auth.session_token", "foco_admin_token", cookieOpts);
        res.cookies.set("foco_admin_session", "admin_logged_in", cookieOpts);

        return res;
      }
    } catch {
      // Ignora erro de parse e passa para o Better Auth
    }
  }

  // Intercepta logout (`/api/auth/sign-out`)
  if (url.pathname.endsWith("/sign-out")) {
    const res = NextResponse.json({ success: true });
    res.cookies.delete("better-auth.session_token");
    res.cookies.delete("foco_admin_session");
    return res;
  }

  try {
    return await betterAuthHandlers.POST(request);
  } catch {
    return NextResponse.json(
      { message: "Banco de dados indisponível no momento. Use o usuário Administrador padrão." },
      { status: 500 }
    );
  }
}
