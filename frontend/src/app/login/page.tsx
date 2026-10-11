"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
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
      const { user } = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      router.push(user.role === "BRAND" ? "/brand/dashboard" : "/creator/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to log in");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) return <SessionLoader />;

  return (
    <AuthShell
      title="Welcome back"
      copy="Pick up where your campaign left off."
      footer={<>New to Collabry? <Link className="font-bold text-violet-700" href="/signup">Create an account</Link></>}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        <button className="btn-primary w-full !py-3.5" disabled={loading}>{loading ? "Logging in…" : "Log in"}</button>
      </form>
    </AuthShell>
  );
}

function SessionLoader() {
  return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" /></div>;
}
