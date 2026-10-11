import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./Logo";

export function AuthShell({
  title,
  copy,
  children,
  footer,
}: {
  title: string;
  copy: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.85fr_1.15fr]">
      <section className="flex flex-col bg-slate-950 p-7 text-white lg:p-12">
        <div className="[&_a]:text-white"><Logo /></div>
        <div className="my-auto max-w-lg py-16">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-300">Built for better work</p>
          <blockquote className="mt-5 text-3xl font-bold leading-tight tracking-tight lg:text-5xl">
            “Less chasing. More creating.”
          </blockquote>
          <p className="mt-6 text-lg leading-8 text-slate-400">Clear terms, visible budgets and one shared campaign status for everyone.</p>
        </div>
        <Link href="/" className="text-sm text-slate-400 hover:text-white">← Back home</Link>
      </section>
      <section className="flex items-center justify-center bg-[#fbfaff] px-5 py-14">
        <div className="w-full max-w-md">
          <h1 className="text-4xl font-black tracking-[-0.04em]">{title}</h1>
          <p className="mt-3 text-slate-600">{copy}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-7 text-center text-sm text-slate-600">{footer}</div>
        </div>
      </section>
    </main>
  );
}
