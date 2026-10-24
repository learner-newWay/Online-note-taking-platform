import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  claimLegacyData,
  createSession,
  createUser,
  ensureWelcomeNote,
  findUserByUsername,
  sessionCookieOptions,
  validateCredentials,
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

  const invalid = validateCredentials(username, password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (findUserByUsername(username)) {
    return NextResponse.json({ error: "该用户名已被注册，换一个试试" }, { status: 409 });
  }

  let user;
  try {
    user = createUser(username, password);
  } catch {
    return NextResponse.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }

  // 升级前的老笔记归第一个注册的用户，之后的用户从空库开始（只创建使用指南）
  claimLegacyData(user.id);
  ensureWelcomeNote(user.id);

  const res = NextResponse.json({ user }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, createSession(user.id), sessionCookieOptions);
  return res;
}
