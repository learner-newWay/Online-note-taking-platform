"use client";

import { useEffect, useRef } from "react";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";
import { KeyboardIcon } from "./icons";

type Props = {
  open: boolean;
  onToggle: () => void;
};

export default function ShortcutPanel({ open, onToggle }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) onToggle();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onToggle();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onToggle]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Markdown 快捷键"
        aria-label="Markdown 快捷键"
        aria-expanded={open}
        className={`rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          open
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        }`}
      >
        <KeyboardIcon size={17} />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="mb-2.5 last:mb-0">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400 dark:text-zinc-500">
                {group.title}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">{item.label}</span>
                    <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10.5px] whitespace-nowrap text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-2 border-t border-zinc-100 pt-2 text-[10.5px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            无需先选中：行内样式直接作用于光标所在的词，标题 / 列表 / 引用作用于光标所在的行；选中多行可批量应用，再按一次取消。
          </p>
        </div>
      ) : null}
    </div>
  );
}
