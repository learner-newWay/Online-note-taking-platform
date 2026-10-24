"use client";

import { useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { UploadIcon } from "./icons";

type Props = {
  onImported: (notes: Note[]) => void;
};

const ACCEPT =
  ".md,.markdown,.mdown,.txt,.text,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function ImportButton({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setBusy(true);
    setError("");

    try {
      const form = new FormData();
      for (const file of picked) form.append("files", file, file.name);

      const res = await fetch("/api/import", { method: "POST", body: form });
      const data: { notes?: Note[]; error?: string } = await res.json().catch(() => ({}));

      if (!res.ok || !data.notes || data.notes.length === 0) {
        throw new Error(data.error || `导入失败（${res.status}）`);
      }
      onImported(data.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={busy ? "正在导入…" : "导入笔记（Markdown / Word / TXT）"}
        aria-label="导入笔记"
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-60 ${
          error
            ? "text-red-500 hover:bg-red-100/70 dark:text-red-400 dark:hover:bg-red-900/30"
            : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        }`}
      >
        <UploadIcon size={17} />
      </button>

      {error ? (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-red-200 bg-white p-2 text-xs leading-relaxed text-red-600 shadow-lg dark:border-red-900 dark:bg-zinc-900 dark:text-red-400">
          {error}
        </div>
      ) : null}
    </div>
  );
}
