"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser, Note, TagCount } from "@/lib/types";
import Sidebar from "./Sidebar";
import NoteEditor from "./NoteEditor";
import type { MarkdownEditorHandle } from "./MarkdownEditor";
import { BookIcon, PlusIcon } from "./icons";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY = 700;
const SEARCH_DELAY = 300;

// 与 SQL 的 `ORDER BY n.pinned DESC, n.updated_at DESC` 保持一致
const sortNotes = (list: Note[]): Note[] =>
  [...list].sort((a, b) =>
    a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.updatedAt - a.updatedAt
  );

// 会话失效（未登录 / 已退出）时回到登录页
function redirectToLogin() {
  if (typeof window !== "undefined") window.location.href = "/login";
}

export default function NotesApp({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 用 ref 保存最新的笔记草稿，避免自动保存闭包拿到旧值
  const draftRef = useRef<Note | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // 每次本地改动 +1，用于判断“请求在途时是否又产生了新编辑”
  const editVersion = useRef(0);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);

  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  draftRef.current = selectedNote;

  /* ---------------- 加载列表 ---------------- */
  // 「Markdown 使用指南」的 id：后端保证它存在，首次进入时默认打开它
  const helpIdRef = useRef<string | null>(null);

  const loadNotes = useCallback(async (q: string, tag: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const res = await fetch(`/api/notes?${params.toString()}`, { cache: "no-store" });
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    if (!res.ok) return;
    const data: { notes: Note[]; tags: TagCount[] } = await res.json();
    setNotes(data.notes);
    setTags(data.tags);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 先确保「使用指南」存在（后端会在缺失时创建），拿到它的 id 作为默认笔记
      try {
        const res = await fetch("/api/help");
        if (res.ok) {
          const data: { id?: string } = await res.json();
          if (data.id) helpIdRef.current = data.id;
        }
      } catch (error) {
        console.error(error);
      }
      await loadNotes("", null);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadNotes]);

  // 搜索与标签筛选（防抖，首次由上面的挂载逻辑负责）
  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void loadNotes(query, activeTag);
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [query, activeTag, loadNotes]);

  /* ---------------- 自动保存 ---------------- */
  const setSaveState = useCallback((next: SaveStatus) => {
    setSaveStatus(next);
  }, []);

  const setDirtyState = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  }, []);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const draft = draftRef.current;
    if (!draft || !dirtyRef.current) return;

    const sentVersion = editVersion.current;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/notes/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          tags: draft.tags,
          pinned: draft.pinned,
        }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok) throw new Error(`保存失败：${res.status}`);
      const data: { note: Note; tags: TagCount[] } = await res.json();
      // 请求在途时又产生了新的编辑：不能用服务端的旧快照覆盖本地，也不能清 dirty，
      // 否则已排定的那次自动保存会因为 dirty=false 被跳过，导致这段输入丢失。
      if (editVersion.current !== sentVersion) {
        setSaveState("idle");
        return;
      }

      setNotes((prev) => sortNotes(prev.map((item) => (item.id === data.note.id ? data.note : item))));
      setTags(data.tags);
      setSaveState("saved");
      setDirtyState(false);
    } catch (error) {
      console.error(error);
      setSaveState("error");
    }
  }, [setDirtyState, setSaveState]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushSave();
    }, AUTOSAVE_DELAY);
  }, [flushSave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /* ---------------- 快捷键 ---------------- */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "s") {
        event.preventDefault();
        void flushSave();
      } else if (event.key === "n") {
        event.preventDefault();
        createButtonRef.current?.click();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flushSave]);

  /* ---------------- 操作 ---------------- */
  const handleSelect = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      await flushSave();
      setSelectedId(id);
      setSidebarOpen(false);
      setSaveState("idle");
      setDirtyState(false);
      if (window.location.hash !== `#note-${id}`) {
        history.replaceState(null, "", `#note-${id}`);
      }
    },
    [flushSave, selectedId, setDirtyState, setSaveState]
  );

  const handleCreate = useCallback(async () => {
    await flushSave();
    const res = await fetch("/api/notes", { method: "POST" });
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    if (!res.ok) return;
    const data: { note: Note; tags: TagCount[] } = await res.json();
    setNotes((prev) => sortNotes([data.note, ...prev.filter((item) => item.id !== data.note.id)]));
    setTags(data.tags);
    setSelectedId(data.note.id);
    setSidebarOpen(false);
    setSaveState("idle");
    setDirtyState(false);
    history.replaceState(null, "", `#note-${data.note.id}`);
    requestAnimationFrame(() => {
      const title = document.querySelector<HTMLTextAreaElement>("textarea");
      title?.focus();
    });
  }, [flushSave, setDirtyState, setSaveState]);

  const handleImported = useCallback(
    (imported: Note[]) => {
      if (imported.length === 0) return;
      // 清空筛选条件，确保刚导入的笔记能在列表里看到
      setQuery("");
      setActiveTag(null);
      setNotes((prev) => {
        const ids = new Set(imported.map((note) => note.id));
        return sortNotes([...imported, ...prev.filter((note) => !ids.has(note.id))]);
      });
      setSelectedId(imported[0].id);
      setSidebarOpen(false);
      setSaveState("idle");
      setDirtyState(false);
      history.replaceState(null, "", `#note-${imported[0].id}`);
      requestAnimationFrame(() => {
        document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      });
    },
    [setDirtyState, setSaveState]
  );

  const handleChange = useCallback(
    (patch: Partial<Pick<Note, "title" | "body" | "tags" | "pinned">>) => {
      if (!selectedId) return;
      editVersion.current += 1;
      setNotes((prev) =>
        prev.map((item) => (item.id === selectedId ? { ...item, ...patch, updatedAt: Date.now() } : item))
      );
      setSaveState("idle");
      setDirtyState(true);
      scheduleSave();
    },
    [scheduleSave, selectedId, setDirtyState, setSaveState]
  );

  const handleTogglePin = useCallback(async () => {
    const draft = draftRef.current;
    if (!draft) return;
    const pinned = !draft.pinned;
    editVersion.current += 1;
    setNotes((prev) => sortNotes(prev.map((item) => (item.id === draft.id ? { ...item, pinned } : item))));
    setDirtyState(true);
    scheduleSave();
  }, [scheduleSave, setDirtyState]);

  const handleDelete = useCallback(async () => {
    const draft = draftRef.current;
    if (!draft) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const res = await fetch(`/api/notes/${draft.id}`, { method: "DELETE" });
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    if (!res.ok) return;
    const remaining = notes.filter((item) => item.id !== draft.id);
    setNotes(remaining);
    setSaveState("idle");
    setDirtyState(false);
    setSelectedId(remaining[0]?.id ?? null);
    if (remaining[0]) history.replaceState(null, "", `#note-${remaining[0].id}`);
    else history.replaceState(null, "", window.location.pathname);
    void loadNotes(query, activeTag);
  }, [activeTag, loadNotes, notes, query, setDirtyState, setSaveState]);

  const handleHelpOpen = useCallback(
    async (id: string) => {
      await flushSave();
      setQuery("");
      setActiveTag(null);
      await loadNotes("", null);
      setSelectedId(id);
      setSidebarOpen(false);
      setSaveState("idle");
      setDirtyState(false);
      history.replaceState(null, "", `#note-${id}`);
    },
    [activeTag, flushSave, loadNotes, notes, setDirtyState, setSaveState]
  );

  /* ---------------- 退出登录 ---------------- */
  const handleLogout = useCallback(async () => {
    // 先停掉待执行的自动保存，避免退出后还在写数据
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 请求失败也照样回到登录页
    }
    router.replace("/login");
    router.refresh();
  }, [router]);

  /* ---------------- 首次进入时按 hash 定位 ---------------- */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || loading || notes.length === 0) return;
    restoredRef.current = true;
    const hash = window.location.hash.replace("#note-", "");
    const target =
      notes.find((note) => note.id === hash) ??
      // 默认打开「使用指南」
      notes.find((note) => note.id === helpIdRef.current) ??
      notes[0];
    if (target) setSelectedId(target.id);
  }, [loading, notes]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* 移动端遮罩 */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="关闭侧边栏"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          notes={notes}
          tags={tags}
          selectedId={selectedId}
          query={query}
          activeTag={activeTag}
          loading={loading}
          onQueryChange={setQuery}
          onTagChange={setActiveTag}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onHelpOpen={handleHelpOpen}
          onImported={handleImported}
          selectedNote={selectedNote}
          user={user}
          onLogout={handleLogout}
          onGotoHeading={(i) => editorRef.current?.scrollToHeading(i)}
        />
      </div>

      {selectedNote ? (
        <NoteEditor
          note={selectedNote}
          status={saveStatus}
          dirty={dirty}
          onChange={handleChange}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          onOpenSidebar={() => setSidebarOpen(true)}
          ref={editorRef}
        />
      ) : (
        <EmptyState loading={loading} onCreate={handleCreate} createRef={createButtonRef} />
      )}
    </div>
  );
}

function EmptyState({
  loading,
  onCreate,
  createRef,
}: {
  loading: boolean;
  onCreate: () => void;
  createRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-white dark:bg-zinc-950">
      <div className="px-6 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600">
          <BookIcon size={28} />
        </span>
        <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-200">
          {loading ? "正在加载…" : "从一篇笔记开始"}
        </h2>
        <p className="mt-1.5 text-sm text-zinc-400 dark:text-zinc-500">
          {loading ? "正在读取你的笔记库" : "在左侧选择一篇笔记，或新建一篇"}
        </p>
        {!loading ? (
          <button
            ref={createRef}
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <PlusIcon size={16} />
            新建笔记
            <kbd className="ml-1 rounded bg-emerald-700/60 px-1 py-px text-[10px] font-normal">
              Ctrl N
            </kbd>
          </button>
        ) : null}
      </div>
    </div>
  );
}
