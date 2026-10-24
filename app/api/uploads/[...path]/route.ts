import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readImage } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { path: segments } = await context.params;
  const image = readImage(segments, user.id);
  if (!image) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.byteLength),
      // 文件名是 uuid，内容不会变，可长期缓存
      "Cache-Control": "private, max-age=31536000, immutable",
      // 防止 SVG 被当作脚本执行（sandbox 仅在直接打开该资源时生效）
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
