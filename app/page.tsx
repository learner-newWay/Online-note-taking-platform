import { redirect } from "next/navigation";
import NotesApp from "@/components/NotesApp";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  // 没登录就先去登录 / 注册页
  if (!user) redirect("/login");

  return <NotesApp user={user} />;
}
