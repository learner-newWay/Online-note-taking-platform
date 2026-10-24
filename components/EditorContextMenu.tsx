"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  type?: "item";
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
};

export type MenuEntry = MenuItem | { type: "separator" };

type Props = {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
};

// 右键菜单：在指定坐标弹出，点击外部 / 滚动 / Esc 关闭。
// 用 fixed 定位并做边界翻转，避免贴边时被裁掉。
export default function EditorContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }
    setPos({ left: Math.max(margin, left), top: Math.max(margin, top) });
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      // 点到菜单项内部时，后续的 click 会自行触发并关闭，这里只处理外部点击
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-52 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
    >
      {entries.map((entry, index) =>
        "type" in entry && entry.type === "separator" ? (
          <div key={index} className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            onClick={() => {
              (entry as MenuItem).onSelect();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {entry.icon ? (
              <span className="text-zinc-400 dark:text-zinc-500">{entry.icon}</span>
            ) : null}
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut ? (
              <kbd className="text-[11px] text-zinc-400 dark:text-zinc-500">{entry.shortcut}</kbd>
            ) : null}
          </button>
        )
      )}
    </div>
  );
}
