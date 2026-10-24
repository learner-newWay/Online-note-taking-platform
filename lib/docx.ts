import { inflateRawSync } from "zlib";

// 把 Word (.docx) 转成 Markdown。
// .docx 本质是个 zip，正文在 word/document.xml，编号定义在 word/numbering.xml。
// 这里用 Node 内置 zlib 解压，不引入任何第三方依赖。

type ZipEntry = {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compSize: number;
  localOffset: number;
};

// 从后往前找中央目录结束标记 (EOCD)
function findEOCD(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error("不是有效的 Word 文档（zip 结尾标记缺失）");

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length) break;
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const fnLen = buf.readUInt16LE(offset + 28);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + fnLen);
    entries.push({ name, method, compSize, localOffset });
    offset += 46 + fnLen + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
  return entries;
}

function extractEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const lo = entry.localOffset;
  if (lo + 30 > buf.length) throw new Error("Word 文档结构损坏");
  const fnLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + fnLen + extraLen;
  const end = start + entry.compSize;
  if (end > buf.length) throw new Error("Word 文档结构损坏");
  const raw = buf.subarray(start, end);

  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error("不支持的压缩方式，无法读取 Word 文档");
}

function entryText(buf: Buffer, entries: ZipEntry[], name: string): string | null {
  const entry = entries.find((e) => e.name === name);
  if (!entry) return null;
  return extractEntry(buf, entry).toString("utf8");
}

/* ---------------- XML 小工具 ---------------- */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

// 属性值：取 attr="..." 或 attr='...'
function attr(fragment: string, attrName: string): string | null {
  const m = new RegExp(`${attrName}\\s*=\\s*"([^"]*)"|${attrName}\\s*=\\s*'([^']*)'`).exec(fragment);
  return m ? (m[1] ?? m[2]) : null;
}

// 开标签片段（含属性）后的自闭合/结束判断
function hasEmptyTag(props: string, tag: string): boolean {
  return new RegExp(`<${tag}\\s*/>`).test(props) || new RegExp(`<${tag}\\b`).test(props);
}

function isOn(props: string, tag: string): boolean {
  // <w:b/> 或 <w:b w:val="1"/> 视为开；<w:b w:val="0"/> / "false" 视为关
  const m = new RegExp(`<${tag}(?:\\s+[^>]*)?/?>`).exec(props);
  if (!m) return false;
  const val = attr(m[0], "w:val");
  if (val !== null) return val !== "0" && val !== "false" && val !== "off";
  return true;
}

/* ---------------- numbering.xml：编号格式（项目符号 / 数字） ---------------- */

type Numbering = {
  // numId -> abstractNumId
  numToAbstract: Map<string, string>;
  // `${abstractNumId}:${ilvl}` -> numFmt
  fmt: Map<string, string>;
};

function parseNumbering(xml: string | null): Numbering {
  const numbering: Numbering = { numToAbstract: new Map(), fmt: new Map() };
  if (!xml) return numbering;

  // <w:abstractNum w:abstractNumId="0"> ... <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/>
  const abstractRe = /<w:abstractNum\b[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  let am: RegExpExecArray | null;
  while ((am = abstractRe.exec(xml))) {
    const body = am[1];
    const idMatch = /<w:abstractNum\b[^>]*w:abstractNumId="([^"]*)"/.exec(am[0]);
    const abstractId = idMatch?.[1];
    if (!abstractId) continue;

    const lvlRe = /<w:lvl\b[^>]*w:ilvl="([^"]*)"[^>]*>([\s\S]*?)<\/w:lvl>/g;
    let lm: RegExpExecArray | null;
    while ((lm = lvlRe.exec(body))) {
      const ilvl = lm[1];
      const fmt = /<w:numFmt\b[^>]*w:val="([^"]*)"/.exec(lm[2])?.[1];
      if (fmt) numbering.fmt.set(`${abstractId}:${ilvl}`, fmt);
    }
  }

  // <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  const numRe = /<w:num\b[^>]*w:numId="([^"]*)"[^>]*>[\s\S]*?<w:abstractNumId\b[^>]*w:val="([^"]*)"/g;
  let nm: RegExpExecArray | null;
  while ((nm = numRe.exec(xml))) {
    numbering.numToAbstract.set(nm[1], nm[2]);
  }
  return numbering;
}

const ORDERED_FMT = new Set([
  "decimal",
  "lowerLetter",
  "upperLetter",
  "lowerRoman",
  "upperRoman",
  "decimalEnclosedCircle",
]);

/* ---------------- run（文字片段） ---------------- */

function runText(runBody: string): string {
  let out = "";
  const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(runBody))) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0].startsWith("<w:tab")) out += "\t";
    else out += "\n";
  }
  return out;
}

function runMarkdown(runBody: string): string {
  const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runBody)?.[1] ?? "";
  const text = runText(runBody);
  if (!text) return "";

  const bold = isOn(rPr, "w:b");
  const italic = isOn(rPr, "w:i");
  const strike = isOn(rPr, "w:strike");

  let out = text;
  if (bold && italic) out = `***${out}***`;
  else if (bold) out = `**${out}**`;
  else if (italic) out = `*${out}*`;
  if (strike) out = `~~${out}~~`;
  return out;
}

/* ---------------- 段落 / 表格 ---------------- */

function paragraphToMarkdown(pOpen: string, pBody: string, numbering: Numbering): string {
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(pBody)?.[1] ?? "";

  // 正文文本（跳过属性片段）
  let text = "";
  const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  let rm: RegExpExecArray | null;
  while ((rm = runRe.exec(pBody))) text += runMarkdown(rm[1]);

  // 标题级别
  const style = attr(pPr.match(/<w:pStyle\b[^>]*\/?>/)?.[0] ?? "", "w:val");
  let heading = 0;
  if (style) {
    const h = /^(?:Heading|heading|a?p?p?)?(\d)$/.exec(style.replace(/[^0-9A-Za-z]/g, ""));
    const hm = /Heading(\d)/.exec(style);
    if (hm) heading = Number(hm[1]);
    else if (/^Title$/i.test(style)) heading = 1;
    else if (h && /Heading/i.test(style)) heading = Number(h[1]);
  }
  if (heading >= 1 && heading <= 6) {
    const body = text.trim();
    if (body) return `${"#".repeat(heading)} ${body}`;
    return "";
  }

  // 列表
  const numPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(pPr)?.[1];
  if (numPr) {
    const ilvl = Number(attr(numPr.match(/<w:ilvl\b[^>]*\/?>/)?.[0] ?? "", "w:val") ?? "0");
    const numId = attr(numPr.match(/<w:numId\b[^>]*\/?>/)?.[0] ?? "", "w:val");
    const indent = "  ".repeat(Math.max(0, Math.min(ilvl, 6)));

    let fmt: string | undefined;
    if (numId !== null) {
      const abstractId = numbering.numToAbstract.get(numId);
      if (abstractId !== undefined) fmt = numbering.fmt.get(`${abstractId}:${ilvl}`);
    }
    const ordered = fmt !== undefined && ORDERED_FMT.has(fmt);
    const marker = ordered ? "1. " : "- ";
    return `${indent}${marker}${text.trim()}`;
  }

  // 引用
  if (/<w:pStyle\b[^>]*w:val="(?:Quote|IntenseQuote)"/.test(pPr)) {
    const body = text.trim();
    if (!body) return "";
    return body
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  return text.replace(/\n+$/, "");
}

function tableToMarkdown(tblBody: string): string {
  const rows: string[][] = [];
  const rowRe = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
  let rm: RegExpExecArray | null;

  while ((rm = rowRe.exec(tblBody))) {
    const cells: string[] = [];
    const cellRe = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) {
      // 单元格内可能有多个段落，取全部文字并用空格连接
      let cell = "";
      const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
      let runm: RegExpExecArray | null;
      while ((runm = runRe.exec(cm[1]))) {
        const t = runText(runm[1]);
        if (t) cell += (cell ? " " : "") + t.trim();
      }
      cells.push(cell.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim());
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const norm = (r: string[]) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  };
  const header = norm(rows[0]);
  const bodyRows = rows.slice(1).map(norm);

  const lines: string[] = [];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const r of bodyRows) lines.push(`| ${r.join(" | ")} |`);
  return lines.join("\n");
}

/* ---------------- 主入口 ---------------- */

export function docxToMarkdown(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const entries = readEntries(buf);

  const docXml = entryText(buf, entries, "word/document.xml");
  if (!docXml) throw new Error("Word 文档缺少正文（word/document.xml）");

  const numbering = parseNumbering(entryText(buf, entries, "word/numbering.xml"));

  const bodyMatch = /<w:body>([\s\S]*)<\/w:body>/.exec(docXml);
  const body = bodyMatch ? bodyMatch[1] : docXml;

  const blocks: string[] = [];
  const blockRe = /<w:tbl(?:\s[^>]*)?>|<w:p(?:\s|>)/;
  let pos = 0;

  while (pos < body.length) {
    const rest = body.slice(pos);
    const m = blockRe.exec(rest);
    if (!m) break;
    const kindStart = pos + m.index;
    const isTable = m[0].startsWith("<w:tbl");

    if (isTable) {
      const close = body.indexOf("</w:tbl>", kindStart);
      if (close < 0) break;
      const contentStart = kindStart + m[0].length;
      const table = tableToMarkdown(body.slice(contentStart, close));
      if (table) blocks.push(table);
      pos = close + "</w:tbl>".length;
    } else {
      const close = body.indexOf("</w:p>", kindStart);
      if (close < 0) break;
      const contentStart = kindStart + m[0].length;
      const line = paragraphToMarkdown(m[0], body.slice(contentStart, close), numbering);
      blocks.push(line);
      pos = close + "</w:p>".length;
    }
  }

  return blocks
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
