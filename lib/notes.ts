import { randomUUID } from "crypto";
import { getDb } from "./db";
import type { Note, TagCount } from "./types";

type NoteRow = {
  id: string;
  title: string;
  body: string;
  pinned: number;
  created_at: number;
  updated_at: number;
};

const MAX_TITLE = 200;
const MAX_BODY = 200_000;
const MAX_TAGS = 12;
const MAX_TAG_LEN = 24;

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function tagsFor(ownerId: string, noteIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (noteIds.length === 0) return map;

  const db = getDb();
  const placeholders = noteIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT nt.note_id AS noteId, t.name AS name
       FROM note_tags nt
       JOIN tags t ON t.id = nt.tag_id AND t.owner_id = ?
       WHERE nt.note_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(ownerId, ...noteIds) as { noteId: string; name: string }[];

  for (const row of rows) {
    const list = map.get(row.noteId);
    if (list) list.push(row.name);
    else map.set(row.noteId, [row.name]);
  }
  return map;
}

function toNote(row: NoteRow, tags: string[]): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned === 1,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 列出某个用户的笔记（可按关键词 / 标签过滤） */
export function listNotes(ownerId: string, query: string, tag: string | null): Note[] {
  const db = getDb();
  const params: (string | number)[] = [ownerId];
  const where: string[] = ["n.owner_id = ?"];
  let sql = "SELECT n.* FROM notes n";

  if (tag) {
    sql += " JOIN note_tags nt ON nt.note_id = n.id JOIN tags t ON t.id = nt.tag_id AND t.owner_id = ?";
    where.push("t.name = ?");
    params.push(ownerId, tag);
  }

  const q = query.trim();
  if (q) {
    where.push("(n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(q)}%`;
    params.push(like, like);
  }

  sql += ` WHERE ${where.join(" AND ")}`;
  sql += " GROUP BY n.id ORDER BY n.pinned DESC, n.updated_at DESC";

  const rows = db.prepare(sql).all(...params) as NoteRow[];
  const tagMap = tagsFor(ownerId, rows.map((r) => r.id));
  return rows.map((row) => toNote(row, tagMap.get(row.id) ?? []));
}

export function getNote(ownerId: string, id: string): Note | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM notes WHERE id = ? AND owner_id = ?")
    .get(id, ownerId) as NoteRow | undefined;
  if (!row) return null;
  return toNote(row, tagsFor(ownerId, [id]).get(id) ?? []);
}

export function listTags(ownerId: string): TagCount[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.name AS name, COUNT(nt.note_id) AS count
       FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       WHERE t.owner_id = ?
       GROUP BY t.id
       HAVING count > 0
       ORDER BY count DESC, t.name ASC`
    )
    .all(ownerId) as { name: string; count: number }[];
  return rows;
}

function replaceTags(ownerId: string, noteId: string, tags: string[]) {
  const db = getDb();
  db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);

  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (owner_id, name) VALUES (?, ?)");
  const findTag = db.prepare("SELECT id FROM tags WHERE owner_id = ? AND name = ?");
  const linkTag = db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)");

  for (const name of tags) {
    insertTag.run(ownerId, name);
    const row = findTag.get(ownerId, name) as { id: number } | undefined;
    if (row) linkTag.run(noteId, row.id);
  }
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().replace(/^#/, "").slice(0, MAX_TAG_LEN);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

export function createNote(
  ownerId: string,
  patch?: { title?: string; body?: string; tags?: string[] }
): Note {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const title =
    typeof patch?.title === "string" ? patch.title.replace(/\r\n/g, "\n").slice(0, MAX_TITLE) : "";
  const body =
    typeof patch?.body === "string" ? patch.body.replace(/\r\n/g, "\n").slice(0, MAX_BODY) : "";

  db.prepare(
    "INSERT INTO notes (id, title, body, pinned, created_at, updated_at, owner_id) VALUES (?, ?, ?, 0, ?, ?, ?)"
  ).run(id, title, body, now, now, ownerId);

  if (patch?.tags !== undefined) replaceTags(ownerId, id, normalizeTags(patch.tags));

  return getNote(ownerId, id)!;
}

export type NoteUpdate = {
  title?: string;
  body?: string;
  tags?: string[];
  pinned?: boolean;
};

export function updateNote(ownerId: string, id: string, patch: NoteUpdate): Note | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM notes WHERE id = ? AND owner_id = ?")
    .get(id, ownerId) as NoteRow | undefined;
  if (!existing) return null;

  const title =
    typeof patch.title === "string" ? patch.title.replace(/\r\n/g, "\n").slice(0, MAX_TITLE) : existing.title;
  const body =
    typeof patch.body === "string" ? patch.body.replace(/\r\n/g, "\n").slice(0, MAX_BODY) : existing.body;
  const pinned = typeof patch.pinned === "boolean" ? (patch.pinned ? 1 : 0) : existing.pinned;
  const now = Date.now();

  const apply = db.transaction(() => {
    db.prepare(
      "UPDATE notes SET title = ?, body = ?, pinned = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    ).run(title, body, pinned, now, id, ownerId);
    if (patch.tags !== undefined) replaceTags(ownerId, id, normalizeTags(patch.tags));
  });
  apply();

  return getNote(ownerId, id);
}

export function deleteNote(ownerId: string, id: string): boolean {
  const db = getDb();
  const info = db.prepare("DELETE FROM notes WHERE id = ? AND owner_id = ?").run(id, ownerId);

  // 清理不再被任何笔记引用的标签
  db.prepare("DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)").run();
  db.prepare("DELETE FROM note_tags WHERE note_id NOT IN (SELECT id FROM notes)").run();

  return info.changes > 0;
}
