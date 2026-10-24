import { cookies } from "next/headers";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { getDb } from "./db";
import { migrateLegacyUploads } from "./uploads";
import { WELCOME_BODY } from "./help";
import type { AuthUser } from "./types";

export const SESSION_COOKIE = "yj_session";
/** 会话有效期 30 天 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

const USERNAME_RE = /^[A-Za-z0-9_一-龥.-]{2,20}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72;

/* ---------------- 密码 ---------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN, SCRYPT).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length, SCRYPT);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ---------------- 用户 ---------------- */

export function validateCredentials(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "用户名需为 2–20 位字母、数字、下划线、连字符或中文";
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return `密码至少 ${MIN_PASSWORD} 位`;
  }
  if (password.length > MAX_PASSWORD) return "密码过长";
  return null;
}

export function findUserByUsername(username: string): (AuthUser & { passwordHash: string }) | null {
  const row = getDb()
    .prepare("SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ?")
    .get(username) as (AuthUser & { passwordHash: string }) | undefined;
  return row ?? null;
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  return row.c;
}

export function createUser(username: string, password: string): AuthUser {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(id, username, hashPassword(password), now);
  return { id, username };
}

/**
 * 老数据认领：升级前创建的笔记属于「无主」状态，
 * 由第一个注册的用户继承，之后注册的用户从空库开始。
 */
/**
 * 为新注册用户创建「使用指南」笔记。
 * 只有在尚无笔记时才创建，避免重复。
 */
export function ensureWelcomeNote(userId: string): void {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS c FROM notes WHERE owner_id = ?").get(userId) as { c: number };
  if (row.c > 0) return;

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO notes (id, title, body, pinned, created_at, updated_at, owner_id) VALUES (?, ?, ?, 1, ?, ?, ?)"
  ).run(id, "Markdown 使用指南", WELCOME_BODY, now, now, userId);
}

/**
 * 老数据认领：升级前创建的笔记属于「无主」状态，
 * 由第一个注册的用户继承，之后注册的用户从空库开始。
 */
export function claimLegacyData(userId: string): void {
  const db = getDb();
  if (countUsers() > 1) return;

  const notes = db.prepare("SELECT id, body FROM notes WHERE owner_id IS NULL").all() as {
    id: string;
    body: string;
  }[];
  if (notes.length === 0) return;

  const claim = db.transaction(() => {
    db.prepare("UPDATE notes SET owner_id = ? WHERE owner_id IS NULL").run(userId);
    db.prepare("UPDATE tags SET owner_id = ? WHERE owner_id IS NULL").run(userId);
  });
  claim();

  // 老图片平铺在 data/uploads 根目录，搬进用户目录并改写正文里的链接
  let moved: Map<string, string>;
  try {
    moved = migrateLegacyUploads(userId);
  } catch (error) {
    console.error("迁移老图片失败：", error);
    return;
  }
  if (moved.size === 0) return;

  const update = db.prepare("UPDATE notes SET body = ? WHERE id = ?");
  for (const note of notes) {
    let body = note.body;
    for (const [oldName, newPath] of moved) {
      body = body.split(`/api/uploads/${oldName}`).join(`/api/uploads/${newPath}`);
    }
    if (body !== note.body) update.run(body, note.id);
  }
}

/* ---------------- 会话 ---------------- */

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  getDb()
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash(token), userId, now, now + SESSION_TTL_MS);
  return token;
}

export function getUserByToken(token: string | undefined | null): AuthUser | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id AS id, u.username AS username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash(token), Date.now()) as AuthUser | undefined;
  return row ?? null;
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function purgeExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}

/* ---------------- Cookie ---------------- */

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
  secure: process.env.NODE_ENV === "production",
};

/** 读取当前登录用户（服务端组件 / 路由处理器里使用） */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  return getUserByToken(store.get(SESSION_COOKIE)?.value);
}
