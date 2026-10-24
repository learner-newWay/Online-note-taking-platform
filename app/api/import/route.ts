import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createNote, listTags } from "@/lib/notes";
import { docxToMarkdown } from "@/lib/docx";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 单个文件 10MB

const TEXT_EXTS = new Set(["md", "markdown", "mdown", "txt", "text"]);

function isFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function"
  );
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// 用文件名（去掉扩展名）作为标题
function titleFromName(name: string): string {
  const i = name.lastIndexOf(".");
  const base = i === -1 ? name : name.slice(0, i);
  return base.trim().replace(/^#+\s*/, "").slice(0, 200);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "请求格式不正确，应为 multipart/form-data" },
      { status: 400 }
    );
  }

  const files = form.getAll("files").filter(isFile);

  if (files.length === 0) {
    return NextResponse.json({ error: "未选择文件" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `一次最多导入 ${MAX_FILES} 个文件` }, { status: 400 });
  }

  const notes: Note[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}：文件过大（超过 10MB）`);
      continue;
    }

    const ext = extOf(file.name);
    try {
      let body: string;

      if (TEXT_EXTS.has(ext)) {
        body = stripBom(Buffer.from(await file.arrayBuffer()).toString("utf8"));
      } else if (ext === "docx") {
        body = docxToMarkdown(new Uint8Array(await file.arrayBuffer()));
      } else {
        errors.push(`${file.name}：不支持的格式（支持 .md / .txt / .docx）`);
        continue;
      }

      const note = createNote(user.id, { title: titleFromName(file.name), body });
      notes.push(note);
    } catch (e) {
      errors.push(`${file.name}：${e instanceof Error ? e.message : "解析失败"}`);
    }
  }

  if (notes.length === 0) {
    return NextResponse.json({ error: errors[0] || "导入失败" }, { status: 400 });
  }

  return NextResponse.json({ notes, tags: listTags(user.id), errors }, { status: 201 });
}
