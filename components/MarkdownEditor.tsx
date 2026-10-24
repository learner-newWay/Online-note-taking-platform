"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "@uiw/codemirror-extensions-basic-setup";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";

export type EditorRange = { from: number; to: number };

export type MarkdownEditorHandle = {
  insertImages: (urls: string[], at?: EditorRange) => void;
  focus: () => void;
  /** 跳到第 index 个标题（下标与 lib/outline.ts 的 parseOutline 结果一致） */
  scrollToHeading: (index: number) => void;
  insertCodeBlock?: (lang?: string, at?: EditorRange) => void;
};

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  onContextMenu?: (x: number, y: number, range: EditorRange) => void;
  onPasteFiles?: (files: File[], range: EditorRange) => void;
};

const PLACEHOLDER = "在这里记录…支持 Markdown 语法（右键可插入图片）";

// 跟随应用的明暗主题（documentElement 上的 .dark 类）
function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Markdown 源码高亮主题：贴近应用的 zinc / emerald 配色
const lightTheme = EditorView.theme({
  "&": { color: "#27272a", backgroundColor: "transparent", height: "100%", fontSize: "14.5px" },
  ".cm-content": { fontFamily: "var(--font-mono)", padding: "1.25rem 1.5rem 30vh", caretColor: "#10b981", lineHeight: "1.85" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
  ".cm-line": { padding: "0 1.5rem" },
  ".cm-placeholder": { color: "#a1a1aa", padding: "0 1.5rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#10b981", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#d4d4d8" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-panels": { backgroundColor: "#fafafa", color: "#27272a", border: "none" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid #e4e4e7" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #e4e4e7" },
  ".cm-searchMatch": { backgroundColor: "#fef08a80", outline: "1px solid #fde04780" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#fde04780" },
  ".cm-selectionMatch": { backgroundColor: "#a1a1aa33" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "#d4d4d880", outline: "none" },
  ".cm-nonmatchingBracket": { backgroundColor: "#fecaca80" },
  ".cm-specialChar": { color: "#f87171" },
}, { dark: false });

const darkTheme = EditorView.theme({
  "&": { color: "#e4e4e7", backgroundColor: "transparent", height: "100%", fontSize: "14.5px" },
  ".cm-content": { fontFamily: "var(--font-mono)", padding: "1.25rem 1.5rem 30vh", caretColor: "#10b981", lineHeight: "1.85" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
  ".cm-line": { padding: "0 1.5rem" },
  ".cm-placeholder": { color: "#71717a", padding: "0 1.5rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#10b981", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#3f3f46" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-panels": { backgroundColor: "#18181b", color: "#e4e4e7", border: "none" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid #3f3f46" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #3f3f46" },
  ".cm-searchMatch": { backgroundColor: "#fde04733", outline: "1px solid #fde04755" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#fde04755" },
  ".cm-selectionMatch": { backgroundColor: "#52525b66" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "#3f3f4680", outline: "none" },
  ".cm-nonmatchingBracket": { backgroundColor: "#7f1d1d80" },
  ".cm-specialChar": { color: "#fca5a5" },
}, { dark: true });

// Markdown 语法高亮：标题、粗体、代码、链接等在编辑时就直接看出格式
const markdownHighlightLight = HighlightStyle.define([
  { tag: t.heading1, color: "#18181b", fontWeight: "700", fontSize: "1.6em" },
  { tag: t.heading2, color: "#18181b", fontWeight: "700", fontSize: "1.35em" },
  { tag: t.heading3, color: "#18181b", fontWeight: "650", fontSize: "1.15em" },
  { tag: t.heading4, color: "#18181b", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#2563eb", textDecoration: "underline" },
  { tag: t.url, color: "#2563eb" },
  { tag: t.monospace, color: "#be185d", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: [t.special(t.heading), t.processingInstruction, t.atom, t.keyword], color: "#a1a1aa" },
  { tag: t.quote, color: "#71717a" },
  { tag: t.list, color: "#a1a1aa" },
  { tag: t.comment, color: "#a1a1aa", fontStyle: "italic" },
  { tag: t.meta, color: "#a1a1aa" },
]);

const markdownHighlightDark = HighlightStyle.define([
  { tag: t.heading1, color: "#fafafa", fontWeight: "700", fontSize: "1.6em" },
  { tag: t.heading2, color: "#fafafa", fontWeight: "700", fontSize: "1.35em" },
  { tag: t.heading3, color: "#fafafa", fontWeight: "650", fontSize: "1.15em" },
  { tag: t.heading4, color: "#fafafa", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#93c5fd", textDecoration: "underline" },
  { tag: t.url, color: "#93c5fd" },
  { tag: t.monospace, color: "#fb7185", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: [t.special(t.heading), t.processingInstruction, t.atom, t.keyword], color: "#71717a" },
  { tag: t.quote, color: "#a1a1aa" },
  { tag: t.list, color: "#71717a" },
  { tag: t.comment, color: "#71717a", fontStyle: "italic" },
  { tag: t.meta, color: "#71717a" },
]);


// 生成把选中文本包裹上 markdown 标记的命令；未选中时插入空标记并把光标放中间
function wrapSelection(view: EditorView, marker: string, placeholder = "") {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const text = `${marker}${selected || placeholder}${marker}`;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + marker.length, head: from + marker.length + (selected || placeholder).length },
  });
}

// 链接：把选中文字包成 [文字](https://)，并选中 https:// 方便直接粘贴地址
function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const url = "https://";
  const text = `[${selected}](${url})`;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + (selected ? selected.length + 3 : 2), head: from + (selected ? selected.length + 3 : 2) + url.length },
  });
}

// 在光标所在行的行首加上 / 去掉前缀（用于标题、引用、列表）
function toggleLinePrefix(view: EditorView, prefix: RegExp, make: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const text = line.text;
  const match = prefix.exec(text);
  if (match) {
    // 已有前缀 → 移除（同级标题再按一次取消）
    view.dispatch({
      changes: { from: line.from, to: line.from + match[0].length, insert: "" },
      selection: { anchor: Math.max(line.from, from - match[0].length) },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, insert: make },
      selection: { anchor: from + make.length },
    });
  }
}

// Markdown 快捷键，与 lib/shortcuts.ts 的展示保持一致
const markdownKeymap = keymap.of([
  { key: "Mod-b", run: (v) => (wrapSelection(v, "**"), true) },
  { key: "Mod-i", run: (v) => (wrapSelection(v, "*"), true) },
  { key: "Mod-e", run: (v) => (wrapSelection(v, "`"), true) },
  { key: "Mod-Shift-x", run: (v) => (wrapSelection(v, "~~"), true) },
  { key: "Mod-k", run: (v) => (insertLink(v), true) },
  { key: "Mod-Alt-1", run: (v) => (toggleLinePrefix(v, /^#{1,6} /, "# "), true) },
  { key: "Mod-Alt-2", run: (v) => (toggleLinePrefix(v, /^#{1,6} /, "## "), true) },
  { key: "Mod-Alt-3", run: (v) => (toggleLinePrefix(v, /^#{1,6} /, "### "), true) },
  { key: "Mod-Shift-7", run: (v) => (toggleLinePrefix(v, /^\d+\. /, "1. "), true) },
  { key: "Mod-Shift-8", run: (v) => (toggleLinePrefix(v, /^[-*+] /, "- "), true) },
  { key: "Mod-Shift-9", run: (v) => (toggleLinePrefix(v, /^> /, "> "), true) },
  {
    key: "Mod-Shift-k",
    run: (v) => {
      const { from, to } = v.state.selection.main;
      const selected = v.state.sliceDoc(from, to);
      if (selected) {
        const text = `\`\`\`markdown\n${selected}\n\`\`\``;
        v.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + 3, head: from + 3 + "markdown".length },
        });
        return true;
      }
      const text = `\`\`\`markdown\n\n\`\`\``;
      v.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + 3, head: from + 3 + "markdown".length },
      });
      return true;
    },
  },
  {
    key: "Mod-Alt-t",
    run: (v) => {
      const { from } = v.state.selection.main;
      const before = v.state.sliceDoc(0, from);
      const pad = before === "" || before.endsWith("\n") ? "" : "\n";
      const table = `${pad}| 列一 | 列二 |\n| --- | --- |\n|  |  |`;
      v.dispatch({ changes: { from, insert: table }, selection: { anchor: from + pad.length + 2 } });
      return true;
    },
  },
]);

const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, onChange, onContextMenu, onPasteFiles },
  ref
) {
  const editorViewRef = useRef<EditorView | null>(null);
  const dark = useDarkMode();

  // 主题与语法高亮跟随明暗模式切换
  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(dark ? markdownHighlightDark : markdownHighlightLight),
      dark ? darkTheme : lightTheme,
      markdownKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        contextmenu: (event, view) => {
          event.preventDefault();
          const range = {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
          };
          onContextMenu?.(event.clientX, event.clientY, range);
          return true;
        },
        paste: (event, view) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          const files: File[] = [];
          for (const item of items) {
            if (item.kind === "file") {
              const file = item.getAsFile();
              if (file && file.type.startsWith("image/")) files.push(file);
            }
          }
          if (files.length === 0) return false;
          event.preventDefault();
          const range = {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
          };
          onPasteFiles?.(files, range);
          return true;
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark, onContextMenu, onPasteFiles]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertImages: (urls, at) => {
        const view = editorViewRef.current;
        if (!view || urls.length === 0) return;
        const state = view.state;
        const docLength = state.doc.length;
        // 上传是异步的，期间用户可能继续输入导致位置失效，这里做一次夹取
        const from = Math.min(at?.from ?? state.selection.main.from, docLength);
        const to = Math.min(at?.to ?? state.selection.main.to, docLength);
        const text = urls
          .map((url, i) => (i > 0 ? "\n\n" : "") + `![图片说明](${url})`)
          .join("");
        const anchor = from + text.length;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor },
          scrollIntoView: true,
        });
        view.focus();
      },
      insertCodeBlock: (lang = "markdown", at) => {
        const view = editorViewRef.current;
        if (!view) return;
        const state = view.state;
        const docLength = state.doc.length;
        const from = Math.min(at?.from ?? state.selection.main.from, docLength);
        const to = Math.min(at?.to ?? state.selection.main.to, docLength);
        const selected = state.sliceDoc(from, to);
        const language = lang.trim() || "markdown";
        const text = selected ? `\`\`\`${language}\n${selected}\n\`\`\`` : `\`\`\`${language}\n\n\`\`\``;
        const anchor = from + 3 + language.length;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor, head: anchor },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus: () => {
        editorViewRef.current?.focus();
      },
      scrollToHeading: (index) => {
        const view = editorViewRef.current;
        if (!view) return;

        const body = view.state.doc.toString();
        const lines = body.split(/\r?\n/);
        let inFence = false;
        let headingCount = 0;

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (/^(```|~~~)/.test(trimmed)) {
            inFence = !inFence;
            continue;
          }
          if (inFence) continue;

          if (/^(#{1,6})\s+/.test(lines[i])) {
            if (headingCount === index) {
              const lineStart = view.state.doc.line(i + 1).from;
              view.dispatch({
                selection: { anchor: lineStart, head: lineStart },
                effects: EditorView.scrollIntoView(lineStart, { y: "start", yMargin: 80 }),
              });
              view.focus();
              return;
            }
            headingCount += 1;
          }
        }
      },
    }),
    []
  );

  return (
    <div className="h-full min-h-0 flex-1 overflow-hidden">
      <CodeMirror
        value={value}
        onChange={onChange}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          searchKeymap: true,
        }}
        extensions={extensions}
        onCreateEditor={(view) => {
          editorViewRef.current = view;
        }}
        placeholder={PLACEHOLDER}
        height="100%"
        className="h-full"
      />
    </div>
  );
});

export default MarkdownEditor;
