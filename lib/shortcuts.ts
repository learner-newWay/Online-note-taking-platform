// 快捷键定义（用于界面展示；实际键位在 components/MarkdownEditor.tsx 中由 TipTap 绑定）

export type ShortcutEntry = {
  label: string;
  keys: string;
};

export const SHORTCUT_GROUPS: { title: string; items: ShortcutEntry[] }[] = [
  {
    title: "文字样式",
    items: [
      { label: "粗体", keys: "Ctrl / ⌘ + B" },
      { label: "斜体", keys: "Ctrl / ⌘ + I" },
      { label: "删除线", keys: "Ctrl / ⌘ + Shift + X" },
      { label: "行内代码", keys: "Ctrl / ⌘ + E" },
      { label: "链接", keys: "Ctrl / ⌘ + K" },
    ],
  },
  {
    title: "块级元素",
    items: [
      { label: "一级标题", keys: "Ctrl / ⌘ + Alt + 1" },
      { label: "二级标题", keys: "Ctrl / ⌘ + Alt + 2" },
      { label: "三级标题", keys: "Ctrl / ⌘ + Alt + 3" },
      { label: "无序列表", keys: "Ctrl / ⌘ + Shift + 8" },
      { label: "有序列表", keys: "Ctrl / ⌘ + Shift + 7" },
      { label: "引用", keys: "Ctrl / ⌘ + Shift + 9" },
      { label: "代码块", keys: "Ctrl / ⌘ + Shift + K" },
      { label: "表格", keys: "Ctrl / ⌘ + Alt + T" },
    ],
  },
  {
    title: "图片",
    items: [
      { label: "粘贴剪贴板图片", keys: "Ctrl / ⌘ + V" },
      { label: "插入图片（右键菜单）", keys: "右键正文" },
      { label: "插入图片（工具栏）", keys: "图片按钮" },
    ],
  },
];
