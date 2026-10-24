import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// 上传的图片存放在 data/uploads/<用户 id>/<文件名>，与 notes.db 同级，
// 通过 /api/uploads/<用户 id>/<文件名> 访问，只有登录用户能读取自己的图片。
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 单张图片上限 8MB

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function isAllowedExt(ext: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_BY_EXT, ext);
}

// 综合扩展名与 MIME 推断一个安全的扩展名，无法识别时返回 null
export function resolveExt(name: string, mime: string): string | null {
  const ext = extFromName(name);
  if (isAllowedExt(ext)) return ext;
  const byMime = EXT_BY_MIME[mime.toLowerCase()];
  return byMime ?? null;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 保存图片，返回相对于 data/uploads 的路径，形如 <用户 id>/<文件名> */
export function saveImage(userId: string, bytes: Uint8Array, ext: string): string {
  const safeExt = isAllowedExt(ext) ? ext : "png";
  const filename = `${randomUUID()}.${safeExt}`;
  const dir = path.join(UPLOAD_DIR, userId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), bytes);
  return `${userId}/${filename}`;
}

// 文件名固定为 uuid + 一个受控扩展名，杜绝路径穿越
const NAME_RE = /^[a-f0-9-]{36}\.[a-z0-9]{1,5}$/;
// 用户 id 也是 uuid（见 lib/auth.ts 的 randomUUID）
const USER_RE = /^[a-f0-9-]{36}$/;

export function isSafeName(name: string): boolean {
  return NAME_RE.test(name);
}

/**
 * 读取图片。
 * - 新结构：/<用户 id>/<文件名>，只能读自己目录下的文件；
 * - 老结构：/<文件名>，是升级前的平铺文件，任何登录用户都可以读。
 */
export function readImage(
  segments: string[] | undefined,
  userId: string
): { data: Buffer; contentType: string } | null {
  const parts = segments ?? [];
  let dir: string;
  let file: string;

  if (parts.length === 2) {
    const [owner, name] = parts;
    if (owner !== userId || !USER_RE.test(owner)) return null;
    dir = path.join(UPLOAD_DIR, owner);
    file = name;
  } else if (parts.length === 1) {
    dir = UPLOAD_DIR;
    file = parts[0];
  } else {
    return null;
  }

  if (!isSafeName(file)) return null;
  const contentType = MIME_BY_EXT[extFromName(file)];
  if (!contentType) return null;

  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return null;
  return { data: fs.readFileSync(full), contentType };
}

/**
 * 把升级前平铺在 data/uploads 根目录的图片搬进指定用户目录，
 * 返回「旧文件名 -> 新相对路径」的映射。
 */
export function migrateLegacyUploads(userId: string): Map<string, string> {
  const moved = new Map<string, string>();
  if (!fs.existsSync(UPLOAD_DIR)) return moved;

  const dir = path.join(UPLOAD_DIR, userId);
  for (const entry of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !isSafeName(entry.name)) continue;
    ensureDir(dir);
    fs.renameSync(path.join(UPLOAD_DIR, entry.name), path.join(dir, entry.name));
    moved.set(entry.name, `${userId}/${entry.name}`);
  }

  return moved;
}
