import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteNote, getNote, listTags, updateNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  const note = getNote(user.id, id);
  if (!note) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return NextResponse.json({ note });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const note = updateNote(user.id, id, payload as Parameters<typeof updateNote>[2]);
  if (!note) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });

  return NextResponse.json({ note, tags: listTags(user.id) });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  const removed = deleteNote(user.id, id);
  if (!removed) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, tags: listTags(user.id) });
}
