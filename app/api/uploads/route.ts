import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_IMAGE_BYTES, resolveExt, saveImage } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function"
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不正确，应为 multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!isFile(file)) {
    return NextResponse.json({ error: "未选择图片" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "图片内容为空" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / 1024 / 1024);
    return NextResponse.json({ error: `图片过大，请压缩到 ${mb}MB 以内` }, { status: 413 });
  }

  const ext = resolveExt(file.name, typeof file.type === "string" ? file.type : "");
  if (!ext) {
    return NextResponse.json(
      { error: "仅支持图片格式（png / jpg / gif / webp / bmp / svg / avif）" },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = saveImage(user.id, bytes, ext);

  return NextResponse.json({ url: `/api/uploads/${name}`, name }, { status: 201 });
}
