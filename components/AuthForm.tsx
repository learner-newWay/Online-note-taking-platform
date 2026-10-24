"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookIcon } from "./icons";

type Mode = "login" | "register";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (isRegister && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || (isRegister ? "注册失败" : "登录失败"));
        return;
      }

      // 登录成功后回到笔记页
      router.replace("/");
      router.refresh();
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white dark:bg-emerald-500">
            <BookIcon size={24} />
          </span>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">云笺</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {isRegister ? "注册账号，开始记录你的笔记" : "登录账号，继续你的笔记"}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          {/* 登录 / 注册 切换 */}
          <div className="mb-5 flex rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-800/80">
            <ModeTab label="登录" active={!isRegister} onClick={() => switchMode("login")} />
            <ModeTab label="注册" active={isRegister} onClick={() => switchMode("register")} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                用户名
              </span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                maxLength={40}
                placeholder="2–20 位字母、数字或中文"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                密码
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                maxLength={72}
                placeholder="至少 6 位"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100"
              />
            </label>

            {isRegister ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  确认密码
                </span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  maxLength={72}
                  placeholder="再输入一次密码"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100"
                />
              </label>
            ) : null}

            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {busy ? "处理中…" : isRegister ? "注册并登录" : "登录"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
            {isRegister ? (
              <>
                已有账号？
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="ml-1 text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  去登录
                </button>
              </>
            ) : (
              <>
                还没有账号？
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="ml-1 text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  注册一个
                </button>
              </>
            )}
          </p>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          笔记按账号独立保存，只有你能看到。
        </p>
      </div>
    </main>
  );
}

function ModeTab({
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
      aria-pressed={active}
      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/60 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600"
          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
