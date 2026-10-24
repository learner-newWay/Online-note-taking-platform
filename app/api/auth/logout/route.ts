import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, destroySession, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  destroySession(request.cookies.get(SESSION_COOKIE)?.value);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
