# 云笺 · 在线笔记

一个简洁、可自托管的在线笔记网站，使用 **Next.js 15 + SQLite** 构建。

## 功能

- **账号登录**：注册 / 登录后才能使用，笔记按账号隔离，互相看不到对方的内容
- **创建 / 编辑 / 删除笔记**：左侧笔记列表，右侧编辑器，操作即时反馈
- **自动保存**：停止输入约 0.7 秒后自动写入数据库，也可按 `Ctrl/Cmd + S` 立即保存
- **Markdown 编辑与预览**：支持「编辑 / 分栏 / 预览」三种视图，兼容 GFM（表格、任务列表、删除线、代码块等）
- **标签分类与搜索**：给笔记打标签，按标签筛选；搜索同时匹配标题与正文
- **置顶**：重要笔记可置顶，始终排在列表最前
- **深色模式**：跟随系统偏好，也可手动切换，选择会记住
- **响应式**：窄屏下侧边栏收起为抽屉，移动端也能正常编辑

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:3000 会跳转到登录页：

- **没有账号**：切到「注册」，设置用户名（2–20 位字母 / 数字 / 中文）和密码（至少 6 位）后自动登录；
- **已有账号**：直接输入用户名和密码登录。

> 升级到多用户版本前创建的笔记属于「无主」状态，会由**第一个注册的用户**自动继承；
> 之后注册的账号从空笔记库开始。

生产环境：

```bash
npm run build
npm start
```

## 账号与会话

- 密码用 `scrypt`（N=16384）加盐哈希后存储，数据库里没有明文；
- 登录后在浏览器里写入 `HttpOnly` + `SameSite=Lax` 的会话 Cookie，会话有效期 30 天；
- 会话令牌只存哈希，服务端可随时注销（如「退出登录」）；
- 所有笔记 / 导入 / 上传接口都需要登录态，未登录返回 `401`；
- 笔记、标签、图片都按用户隔离：别人的笔记既读不到也改不了，读别人的图片返回 `404`。

## 数据存储

笔记保存在本地 SQLite 数据库 `data/notes.db`（首次启动时自动创建），无需额外安装数据库服务。

- `users`：账号、密码哈希、注册时间
- `sessions`：登录会话（令牌哈希与过期时间）
- `notes`：笔记正文、标题、置顶状态、时间戳、所属用户
- `tags` / `note_tags`：标签与笔记的多对多关系（标签按用户区分）
- `data/uploads/<用户 id>/`：每个用户单独的图片目录

直接备份 `data/` 目录即可备份全部笔记与账号。删除笔记时，不再被引用的标签会自动清理。

## 键盘快捷键

### 全局

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + S` | 立即保存当前笔记 |
| `Ctrl/Cmd + N` | 新建笔记 |
| `Enter`（标题栏中） | 跳转到正文 |
| `Enter` / `,`（标签输入框） | 确认标签 |
| `Backspace`（标签输入框为空时） | 删除最后一个标签 |

### Markdown 格式（正文编辑区）

与主流 Markdown 编辑器（Typora / Notion / Google Docs）保持一致。**无需先选中文字**：行内样式会直接作用于光标所在的**词**（中文按连续字块处理），标题 / 列表 / 引用作用于光标所在的**行**；选中多行可批量套用，**再按一次取消**。

| 快捷键 | 作用 | 语法 |
| --- | --- | --- |
| `Ctrl/Cmd + B` | 粗体 | `**文字**` |
| `Ctrl/Cmd + I` | 斜体 | `*文字*` |
| `Ctrl/Cmd + Shift + X` | 删除线 | `~~文字~~` |
| `Ctrl/Cmd + E` | 行内代码 | `` `文字` `` |
| `Ctrl/Cmd + K` | 链接 | `[文字](https://)` |
| `Ctrl/Cmd + Alt + 1` | 一级标题 | `# 标题` |
| `Ctrl/Cmd + Alt + 2` | 二级标题 | `## 标题` |
| `Ctrl/Cmd + Alt + 3` | 三级标题 | `### 标题` |
| `Ctrl/Cmd + Shift + 8` | 无序列表 | `- 项目` |
| `Ctrl/Cmd + Shift + 7` | 有序列表 | `1. 项目` |
| `Ctrl/Cmd + Shift + 9` | 引用 | `> 引用` |
| `Ctrl/Cmd + Shift + K` | 代码块 | ` ```…``` ` |
| `Ctrl/Cmd + Alt + T` | 插入表格 | `\| a \| b \|` |
| `Tab` / `Shift + Tab` | 缩进 / 反缩进 | 两个空格 |

> 兼容别名：`Ctrl/Cmd + Shift + Q` 等同于引用，`Ctrl/⌘ + \`` 等同于行内代码。
> 编辑器工具栏右侧的**键盘图标**可随时弹出完整快捷键表。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 15（App Router） |
| 界面 | React 19 + Tailwind CSS 4 |
| 数据库 | SQLite（better-sqlite3） |
| Markdown | react-markdown + remark-gfm |

## 目录结构

```
app/
  api/auth/register/route.ts # 注册（同时创建会话）
  api/auth/login/route.ts    # 登录
  api/auth/logout/route.ts   # 退出登录
  api/auth/me/route.ts       # 当前登录用户
  api/notes/route.ts         # 列表查询（搜索 / 标签筛选）与新建
  api/notes/[id]/route.ts    # 单条读取、更新、删除
  login/page.tsx             # 登录 / 注册页
  globals.css                # 主题、Markdown 排版样式
  layout.tsx                 # 布局与主题初始化脚本
  page.tsx                   # 首页（未登录时跳转登录页）
components/
  AuthForm.tsx               # 登录 / 注册表单
  NotesApp.tsx               # 状态管理：加载、自动保存、快捷键
  Sidebar.tsx                # 搜索、标签筛选、笔记列表、账号与退出
  NoteEditor.tsx             # 标题、标签、编辑 / 预览
  MarkdownPreview.tsx        # Markdown 渲染
  ShortcutPanel.tsx          # Markdown 快捷键面板
  ThemeToggle.tsx            # 深色模式切换
lib/
  db.ts                      # SQLite 连接、建表与老库升级
  auth.ts                    # 密码哈希、会话、当前用户
  notes.ts                   # 数据访问层（按用户隔离）
  uploads.ts                 # 图片存储（按用户分目录）
  markdown.ts                # Markdown 编辑操作（加粗、列表、代码块…）
  shortcuts.ts               # 按键 → 编辑操作映射
  format.ts                  # 时间与摘要格式化
```
