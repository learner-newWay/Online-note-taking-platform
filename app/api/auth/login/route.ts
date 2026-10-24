import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSession,
  findUserByUsername,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

type Payload = { username?: unknown; password?: unknown };

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "请填写用户名和密码" }, { status: 400 });
  }

  const user = findUserByUsername(username);
  // 用户名不存在与密码错误返回同样的提示，避免暴露账号是否存在
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });
  }

  const res = NextResponse.json({ user: { id: user.id, username: user.username } });
  res.cookies.set(SESSION_COOKIE, createSession(user.id), sessionCookieOptions);
  return res;
}
