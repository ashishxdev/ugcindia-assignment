"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import type { Role, User } from "@/lib/types";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("BRAND");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    api<{ user: User }>("/auth/me")
      .then(({ user }) => {
        if (active) router.replace(user.role === "BRAND" ? "/brand/dashboard" : "/creator/dashboard");
      })
      .catch(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const { user } = await api<{ user: User }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password"), role }),
      });
      router.push(user.role === "BRAND" ? "/brand/dashboard" : "/creator/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create account");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) return <SessionLoader />;

  return (
    <AuthShell
      title="Start collaborating"
      copy="Choose how you’ll use the workspace. You can’t change this role later."
      footer={<>Already have an account? <Link className="font-bold text-violet-700" href="/login">Log in</Link></>}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          {(["BRAND", "CREATOR"] as Role[]).map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => setRole(option)}
              className={`rounded-xl border p-4 text-left ${role === option ? "border-violet-500 bg-violet-50 ring-4 ring-violet-100" : "border-slate-200 bg-white"}`}
            >
              <span className="block font-bold">I’m a {option === "BRAND" ? "brand" : "creator"}</span>
              <span className="mt-1 block text-xs text-slate-500">{option === "BRAND" ? "Launch campaigns" : "Find paid work"}</span>
            </button>
          ))}
        </div>
        <div className="field"><label htmlFor="name">Full name</label><input className="input" id="name" name="name" autoComplete="name" minLength={2} required /></div>
        <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /><p className="text-xs text-slate-500">At least 8 characters</p></div>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        <button className="btn-primary w-full !py-3.5" disabled={loading}>{loading ? "Creating account…" : `Continue as ${role === "BRAND" ? "brand" : "creator"}`}</button>
      </form>
    </AuthShell>
  );
}

function SessionLoader() {
  return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" /></div>;
}
