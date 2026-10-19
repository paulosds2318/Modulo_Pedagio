import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);
function missingSecret() {
  return process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET?.trim();
}
export async function GET(request: Request) {
  if (missingSecret()) return NextResponse.json({ error: "BETTER_AUTH_SECRET is required." }, { status: 503 });
  return handlers.GET(request);
}
export async function POST(request: Request) {
  if (missingSecret()) return NextResponse.json({ error: "BETTER_AUTH_SECRET is required." }, { status: 503 });
  return handlers.POST(request);
}
