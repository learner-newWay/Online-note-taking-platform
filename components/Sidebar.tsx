"use client";

import { useState } from "react";
import type { AuthUser, Note, TagCount } from "@/lib/types";
import { snippet } from "@/lib/format";
import { parseOutlineLines } from "@/lib/outline";
import { BookIcon, HelpIcon, ListTreeIcon, LogOutIcon, PlusIcon, SearchIcon, XIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";
import ImportButton from "./ImportButton";

type Props = {
  notes: Note[];
  tags: TagCount[];
  selectedId: string | null;
  selectedNote: Note | null;
  user: AuthUser;
  query: string;
  activeTag: string | null;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onTagChange: (tag: string | null) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onHelpOpen: (id: string) => void;
  onImported: (notes: Note[]) => void;
  onGotoHeading: (index: number) => void;
  onLogout: () => void;
};

/** 侧边栏的两个面板：大纲 / 笔记列表 */
type PanelId = "outline" | "notes";

/**
 * 大纲条目按标题层级递进排版：
 * 一级标题字号最大、字重最重，往下逐级缩小变淡。
 */
const OUTLINE_LEVEL_CLASS: Record<number, string> = {
  1: "text-sm font-semibold text-zinc-800 dark:text-zinc-100",
  2: "text-[13px] font-medium text-zinc-700 dark:text-zinc-200",
  3: "text-[12.5px] font-medium text-zinc-600 dark:text-zinc-300",
  4: "text-xs text-zinc-500 dark:text-zinc-400",
  5: "text-[11.5px] text-zinc-500 dark:text-zinc-400",
  6: "text-[11px] text-zinc-400 dark:text-zinc-500",
};

/** 取层级对应的样式；越界的层级按 3 级处理 */
function outlineLevelClass(level: number): string {
  return OUTLINE_LEVEL_CLASS[level] ?? OUTLINE_LEVEL_CLASS[3];
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function Sidebar({
  notes,
  tags,
  selectedId,
  selectedNote,
  user,
  query,
  activeTag,
  loading,
  onQueryChange,
  onTagChange,
  onSelect,
  onCreate,
  onHelpOpen,
  onImported,
  onGotoHeading,
  onLogout,
}: Props) {
  // 默认显示大纲
  const [panel, setPanel] = useState<PanelId>("outline");
  const outline = selectedNote ? parseOutlineLines(selectedNote.body) : [];

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500">
          <BookIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold leading-tight">云笺</h1>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">在线笔记</p>
        </div>
        <HelpButton onOpen={onHelpOpen} />
        <ThemeToggle />
        <ImportButton onImported={onImported} />
      </div>

      <div className="space-y-2.5 px-3 pb-3">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <PlusIcon size={16} />
          新建笔记
        </button>

        {/* 大纲 / 笔记 切换 */}
        <div className="flex rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-800/80">
          <PanelTab
            label="大纲"
            active={panel === "outline"}
            onClick={() => setPanel("outline")}
            icon={<ListTreeIcon size={13} />}
          />
          <PanelTab
            label="笔记"
            active={panel === "notes"}
            onClick={() => setPanel("notes")}
            icon={<BookIcon size={13} />}
          />
        </div>
      </div>

      {panel === "outline" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {loading ? (
            <div className="space-y-2 px-1 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
              ))}
            </div>
          ) : !selectedNote ? (
            <EmptyPanel text="还没有笔记" hint="切到「笔记」面板新建一篇" />
          ) : outline.length === 0 ? (
            <EmptyPanel text="这篇笔记还没有标题" hint="在正文里用 # 写标题，大纲会自动出现" />
          ) : (
            <>
              <div
                className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
                title={selectedNote.title.trim() || "无标题笔记"}
              >
                <ListTreeIcon size={12} />
                <span className="min-w-0 truncate">
                  {selectedNote.title.trim() || "无标题笔记"}
                </span>
              </div>
              <nav className="p-1.5">
                <ul className="space-y-0.5">
                  {outline.map((item, index) => (
                    <li
                      key={`${item.line}-${index}`}
                      // 一级标题单独成段，与下级标题拉开距离
                      className={item.level === 1 ? "mt-2 first:mt-0" : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => onGotoHeading(index)}
                        className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        // 按标题层级缩进，层级越深越靠右
                        style={{ paddingLeft: `${(item.level - 1) * 14 + 8}px` }}
                        title={item.text}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${outlineLevelClass(item.level)} group-hover:text-emerald-700 dark:group-hover:text-emerald-300`}
                        >
                          {item.text || "（无标题）"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2.5 px-3 pb-3">
            <div className="relative">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="搜索标题或内容…"
                className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pr-8 pl-9 text-sm outline-none transition-colors focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/70 dark:focus:border-emerald-500"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label="清空搜索"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>

            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <TagChip label="全部" active={activeTag === null} onClick={() => onTagChange(null)} />
                {tags.map((tag) => (
                  <TagChip
                    key={tag.name}
                    label={`${tag.name} ${tag.count}`}
                    active={activeTag === tag.name}
                    onClick={() => onTagChange(activeTag === tag.name ? null : tag.name)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {loading ? (
              <div className="space-y-2 px-2 pt-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="px-5 pt-10 text-center">
                <BookIcon size={30} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {query || activeTag ? "没有匹配的笔记" : "还没有笔记"}
                </p>
                {!query && !activeTag ? (
                  <button
                    type="button"
                    onClick={onCreate}
                    className="mt-3 text-sm text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    创建第一篇笔记
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-1 px-1">
                {notes.map((note) => {
                  const selected = note.id === selectedId;
                  return (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(note.id)}
                        className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? "bg-white shadow-sm ring-1 ring-emerald-500/40 dark:bg-zinc-800 dark:ring-emerald-500/40"
                            : "hover:bg-white/80 dark:hover:bg-zinc-800/60"
                        }`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                            {note.title.trim() || "无标题笔记"}
                          </span>
                          {note.pinned ? (
                            <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400">
                              置顶
                            </span>
                          ) : null}
                          <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                            {formatDate(note.updatedAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {snippet(note.body)}
                        </p>
                        {note.tags.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {note.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-zinc-100 px-1.5 py-px text-[10.5px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              >
                                {tag}
                              </span>
                            ))}
                            {note.tags.length > 3 ? (
                              <span className="text-[10.5px] text-zinc-400">
                                +{note.tags.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-medium text-white">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300">
            {user.username}
          </span>
          <button
            type="button"
            onClick={onLogout}
            title="退出登录"
            aria-label="退出登录"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <LogOutIcon size={14} />
          </button>
        </div>
        <div className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          共 {notes.length} 篇笔记
        </div>
      </div>
    </aside>
  );
}

function PanelTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/60 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600"
          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyPanel({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="px-4 pt-12 text-center">
      <ListTreeIcon size={28} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>
    </div>
  );
}

function TagChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-[11.5px] transition-colors ${
        active
          ? "bg-emerald-600 text-white dark:bg-emerald-600"
          : "bg-zinc-200/70 text-zinc-600 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

function HelpButton({ onOpen }: { onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function openHelp() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/help");
      if (!res.ok) return;
      const data: { id?: string } = await res.json();
      if (!data.id) return;
      onOpen(data.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openHelp}
      disabled={busy}
      title="Markdown 用法指南"
      aria-label="Markdown 用法指南"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <HelpIcon size={17} />
    </button>
  );
}
