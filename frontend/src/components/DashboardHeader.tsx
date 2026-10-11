"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "./Logo";

export function DashboardHeader({ label }: { label: string }) {
  const router = useRouter();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="hidden rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-700 sm:block">
            {label}
          </span>
        </div>
        <button className="btn-secondary !py-2" onClick={logout}>Log out</button>
      </div>
    </header>
  );
}
