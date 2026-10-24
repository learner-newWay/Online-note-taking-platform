export type OutlineItem = {
  /** 标题层级 1–6 */
  level: number;
  /** 标题文字（去掉 # 和尾部井号） */
  text: string;
};

export type OutlineLine = OutlineItem & {
  /** 标题所在行号（从 1 开始） */
  line: number;
};

// 解析 Markdown 正文里的各级标题，按出现顺序返回，
// 会跳过 ``` 代码块里的井号（例如使用指南里的示例代码）
export function parseOutlineLines(body: string): OutlineLine[] {
  const items: OutlineLine[] = [];
  if (!body) return items;

  const lines = body.split(/\r?\n/);
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!match) continue;

    const text = match[2].replace(/\s+#+\s*$/, "").trim();
    items.push({ level: match[1].length, text, line: i + 1 });
  }

  return items;
}

export function parseOutline(body: string): OutlineItem[] {
  return parseOutlineLines(body).map(({ level, text }) => ({ level, text }));
}
