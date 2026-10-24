"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { fullTime } from "@/lib/format";
import { isImageFile, uploadImage } from "@/lib/imageUpload";
import {
  AlertIcon,
  CheckIcon,
  EyeIcon,
  ImageIcon,
  MenuIcon,
  PenIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import MarkdownEditor, { type EditorRange, type MarkdownEditorHandle } from "./MarkdownEditor";
import MarkdownPreview from "./MarkdownPreview";
import ShortcutPanel from "./ShortcutPanel";
import EditorContextMenu, { type MenuEntry } from "./EditorContextMenu";

type ViewMode = "edit" | "preview";
type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  note: Note;
  status: SaveStatus;
  dirty: boolean;
  onChange: (patch: Partial<Pick<Note, "title" | "body" | "tags" | "pinned">>) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onOpenSidebar: () => void;
  onGotoHeading?: (index: number) => void;
};

const NoteEditor = forwardRef<MarkdownEditorHandle, Props>(function NoteEditor(
  { note, status, dirty, onChange, onDelete, onTogglePin, onOpenSidebar, onGotoHeading },
  ref
) {
  const [view, setView] = useState<ViewMode>("edit");
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // 图片插入：右键菜单位置；null 表示不显示
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  // 右键时记录的插入点；上传是异步的，完成时编辑器光标可能已经移走
  const savedRange = useRef<EditorRange | null>(null);
  // 打开文件选择框时记录插入点；null 表示使用当前光标
  const pendingFileRange = useRef<EditorRange | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setTagInput("");
  }, [note.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!uploading) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 超过一定时间仍未完成才提示，避免一闪而过
    timer = setTimeout(() => setToast("正在上传图片…"), 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [uploading]);

  /* ---------------- 图片插入 ---------------- */

  // 把图片文件上传后插入到指定位置（不传 at 时插到当前光标）
  async function insertImages(files: File[], at?: EditorRange) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadImage(file));
      }
      editorRef.current?.insertImages(urls, at);
      // 成功后清掉可能残留的「正在上传图片…」提示
      setToast(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  }

  // 右键菜单项：插入剪贴板里的图片，落在右键位置
  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.read) {
        setToast("当前浏览器不支持读取剪贴板，请直接用 Ctrl/⌘+V 粘贴");
        return;
      }
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            files.push(new File([blob], "clipboard.png", { type }));
          }
        }
      }
      if (files.length === 0) {
        setToast("剪贴板里没有图片");
        return;
      }
      await insertImages(files, savedRange.current ?? undefined);
    } catch {
      setToast("无法读取剪贴板，请改用 Ctrl/⌘+V 粘贴");
    }
  }

  function openFilePicker(at?: EditorRange) {
    // 记录插入位置，供上传完成后的插入使用（上传是异步的）
    pendingFileRange.current = at ?? null;
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // 清空 value，允许再次选择同一个文件
    event.target.value = "";
    const at = pendingFileRange.current ?? undefined;
    pendingFileRange.current = null;
    void insertImages(files, at);
  }

  function insertCodeBlock(lang = "markdown") {
    const range = savedRange.current ?? undefined;
    editorRef.current?.insertCodeBlock?.(lang, range);
    setMenu(null);
  }

  const menuEntries: MenuEntry[] = [
    { label: "插入图片（本地文件）", icon: <ImageIcon size={15} />, onSelect: () => openFilePicker(savedRange.current ?? undefined) },
    { label: "粘贴剪贴板图片", shortcut: "Ctrl+V", onSelect: () => void pasteFromClipboard() },
    { label: "插入代码块", icon: <PlusIcon size={15} />, onSelect: () => insertCodeBlock() },
    { label: "插入代码块（Shell）", onSelect: () => insertCodeBlock("bash") },
    { label: "插入代码块（Python）", onSelect: () => insertCodeBlock("python") },
    { label: "插入代码块（Java）", onSelect: () => insertCodeBlock("java") },
    { label: "插入代码块（JavaScript）", onSelect: () => insertCodeBlock("javascript") },
    { label: "插入代码块（TypeScript）", onSelect: () => insertCodeBlock("typescript") },
    { label: "插入代码块（JSON）", onSelect: () => insertCodeBlock("json") },
    { label: "插入代码块（HTML）", onSelect: () => insertCodeBlock("html") },
    { label: "插入代码块（CSS）", onSelect: () => insertCodeBlock("css") },
  ];

  /* ---------------- 标签 ---------------- */

  function addTag() {
    const name = tagInput.trim().replace(/^#/, "");
    if (!name) return;
    if (!note.tags.includes(name)) {
      onChange({ tags: [...note.tags, name].slice(0, 12) });
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    onChange({ tags: note.tags.filter((item) => item !== tag) });
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    } else if (event.key === "Backspace" && !tagInput && note.tags.length > 0) {
      removeTag(note.tags[note.tags.length - 1]);
    }
  }

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      titleRef.current?.blur();
      editorRef.current?.focus();
    }
  }

  function autoGrowTitle(event: React.FormEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  useImperativeHandle(
    ref,
    () => ({
      insertImages: (urls, at) => editorRef.current?.insertImages(urls, at),
      focus: () => editorRef.current?.focus(),
      scrollToHeading: (index) => editorRef.current?.scrollToHeading(index),
      insertCodeBlock: (lang, at) => editorRef.current?.insertCodeBlock?.(lang, at),
    }),
    []
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-zinc-950">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="打开侧边栏"
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:hidden"
        >
          <MenuIcon size={18} />
        </button>

        <ViewSwitcher view={view} onChange={setView} />

        <div className="ml-auto flex items-center gap-1">
          <SaveIndicator status={status} dirty={dirty} />
          <ShortcutPanel open={showShortcuts} onToggle={() => setShowShortcuts((v) => !v)} />
          <button
            type="button"
            onClick={() => openFilePicker()}
            title="插入图片（也可右键正文，或 Ctrl/⌘+V 粘贴）"
            aria-label="插入图片"
            disabled={uploading}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-60 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <ImageIcon size={17} />
          </button>
          <button
            type="button"
            onClick={onTogglePin}
            title={note.pinned ? "取消置顶" : "置顶笔记"}
            aria-label={note.pinned ? "取消置顶" : "置顶笔记"}
            className={`rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              note.pinned
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            }`}
          >
            <PinIcon size={17} />
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="删除笔记"
              aria-label="删除笔记"
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <TrashIcon size={17} />
            </button>
          )}
        </div>
      </div>

      {/* 标题 */}
      <div className="border-b border-zinc-100 px-6 pt-5 pb-3 dark:border-zinc-900">
        <textarea
          ref={titleRef}
          rows={1}
          value={note.title}
          placeholder="无标题笔记"
          onInput={autoGrowTitle}
          onKeyDown={handleTitleKeyDown}
          onChange={(event) => {
            onChange({ title: event.target.value.replace(/\n/g, "") });
            autoGrowTitle(event);
          }}
          className="w-full resize-none bg-transparent text-2xl font-bold outline-none dark:text-zinc-50"
        />

        {/* 标签 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="group flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`移除标签 ${tag}`}
                className="text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-100"
              >
                <XIcon size={11} />
              </button>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <PlusIcon size={12} className="text-zinc-400" />
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              placeholder="添加标签"
              className="w-20 bg-transparent text-xs text-zinc-600 outline-none dark:text-zinc-300"
            />
          </span>
        </div>
      </div>

      {/* 正文：编辑态即所见即所得，预览态用只读渲染 */}
      <div className="flex min-h-0 flex-1">
        {/* 编辑器始终保持挂载（预览时隐藏），避免切换视图丢失编辑状态 */}
        <div className={`min-h-0 flex-1 ${view === "preview" ? "hidden" : ""}`}>
          <MarkdownEditor
            key={note.id}
            ref={editorRef}
            value={note.body}
            onChange={(body) => onChange({ body })}
            onContextMenu={(x, y, range) => {
              savedRange.current = range;
              setMenu({ x, y });
            }}
            onPasteFiles={(files, range) => void insertImages(files, range)}
          />
        </div>
        {view === "preview" ? (
          <div className="h-full min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <MarkdownPreview content={note.body} />
          </div>
        ) : null}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center gap-3 border-t border-zinc-200 px-6 py-2 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        <span>更新于 {fullTime(note.updatedAt)}</span>
        <span className="hidden md:inline">
          Markdown 快捷键（无需选中，光标即可生效）：Ctrl/⌘+B 粗体 · Ctrl/⌘+Shift+7/8 列表 · 点键盘图标查看全部
        </span>
        <span className="ml-auto">{note.body.length} 字符</span>
      </div>

      {/* 插入图片的隐藏文件选择框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 右键菜单 */}
      {menu ? (
        <EditorContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuEntries}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {/* 上传状态 / 错误提示 */}
      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-700">
          {toast}
        </div>
      ) : null}
    </div>
  );
});

export default NoteEditor;

function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "edit", label: "编辑", icon: <PenIcon size={14} /> },
    { key: "preview", label: "预览", icon: <EyeIcon size={14} /> },
  ];

  return (
    <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
            view === item.key
              ? "bg-white font-medium text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          {item.icon}
          <span className="hidden sm:inline">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function SaveIndicator({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-red-500">
        <AlertIcon size={13} />
        保存失败
      </span>
    );
  }
  if (status === "saving") {
    return <span className="text-xs text-zinc-400">保存中…</span>;
  }
  if (dirty) {
    return <span className="text-xs text-amber-500">未保存</span>;
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckIcon size={13} />
        已保存
      </span>
    );
  }
  return <span className="text-xs text-zinc-400 dark:text-zinc-500">已同步</span>;
}
