import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { WELCOME_BODY } from "@/lib/help";

export const dynamic = "force-dynamic";

const SHORTCUT_MARKER = "不用手动记语法";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const db = getDb();
  const now = Date.now();

  const row = db
    .prepare("SELECT id, body FROM notes WHERE title = ? AND owner_id = ?")
    .get("Markdown 使用指南", user.id) as { id: string; body: string } | undefined;

  if (!row) {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO notes (id, title, body, pinned, created_at, updated_at, owner_id) VALUES (?, ?, ?, 1, ?, ?, ?)"
    ).run(id, "Markdown 使用指南", WELCOME_BODY, now, now, user.id);
    return NextResponse.json({ id, url: `/#note-${id}` });
  }

  // 旧版帮助正文缺少新说明：重写正文，让老用户也能看到最新内容
  if (!row.body.includes(SHORTCUT_MARKER)) {
    db.prepare("UPDATE notes SET body = ?, pinned = 1, updated_at = ? WHERE id = ?").run(
      WELCOME_BODY,
      now,
      row.id
    );
  } else {
    db.prepare("UPDATE notes SET pinned = 1 WHERE id = ?").run(row.id);
  }

  return NextResponse.json({ id: row.id, url: `/#note-${row.id}` });
}
