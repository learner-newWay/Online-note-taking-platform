import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

type DB = Database.Database;

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "notes.db");

const globalForDb = globalThis as unknown as { __notesDb?: DB };

function columnsOf(db: DB, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

/**
 * 老库升级到「多用户」结构：
 * 1. notes 增加 owner_id（老数据为 NULL，等第一个注册用户来认领）；
 * 2. tags 从「全局唯一的名字」改成「每个用户下名字唯一」。
 */
function migrate(db: DB) {
  const noteColumns = columnsOf(db, "notes");
  if (!noteColumns.includes("owner_id")) {
    db.exec("ALTER TABLE notes ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  }

  const tagColumns = columnsOf(db, "tags");
  if (!tagColumns.includes("owner_id")) {
    // 重建 tags：先关掉外键检查，避免 DROP TABLE 时级联删掉 note_tags
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE tags_new (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT,
        name     TEXT NOT NULL,
        UNIQUE(owner_id, name)
      );
      INSERT INTO tags_new (id, owner_id, name) SELECT id, NULL, name FROM tags;
      DROP TABLE tags;
      ALTER TABLE tags_new RENAME TO tags;
    `);
    db.pragma("foreign_keys = ON");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
}

function createDb(): DB {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      body       TEXT NOT NULL DEFAULT '',
      pinned     INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT,
      name     TEXT NOT NULL,
      UNIQUE(owner_id, name)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
  `);

  migrate(db);

  return db;
}

export function getDb(): DB {
  if (!globalForDb.__notesDb) globalForDb.__notesDb = createDb();
  return globalForDb.__notesDb;
}
