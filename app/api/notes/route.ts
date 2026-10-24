import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createNote, listNotes, listTags } from "@/lib/notes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag");

  const notes = listNotes(user.id, query, tag && tag.trim() ? tag.trim() : null);
  const tags = listTags(user.id);

  return NextResponse.json({ notes, tags });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const note = createNote(user.id);
  return NextResponse.json({ note, tags: listTags(user.id) }, { status: 201 });
}
