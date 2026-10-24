// 图片上传：把本地图片 POST 到 /api/uploads，返回可直接写进 Markdown 的 URL。

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  // 个别系统/来源下 type 为空，退回到扩展名判断
  return !file.type && IMAGE_EXT_RE.test(file.name);
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name || "image.png");

  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const data: { url?: string; error?: string } = await res.json().catch(() => ({}));

  if (!res.ok || !data.url) {
    throw new Error(data.error || `图片上传失败（${res.status}）`);
  }
  return data.url;
}
