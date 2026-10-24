import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "云笺 · 在线笔记",
  description: "一个简洁的在线笔记网站，支持 Markdown 编辑、标签分类、搜索与深色模式。",
};

const themeScript = `(function(){try{var t=localStorage.getItem("yunjian-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(t==="dark"){document.documentElement.classList.add("dark");}document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
