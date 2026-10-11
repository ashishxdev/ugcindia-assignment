import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaff]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 lg:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/signup" className="btn-primary">Start collaborating</Link>
        </div>
      </nav>

      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pt-24">
        <div className="absolute -left-40 top-0 size-96 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="relative">
          <p className="eyebrow">Campaign collaboration, simplified</p>
          <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-7xl">
            Great content starts with a <span className="text-violet-600">clear connection.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
            One calm workspace for brands to launch campaigns and creators to find paid work—without the spreadsheet chase.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary !px-6 !py-3.5">Create your account →</Link>
            <a href="#how-it-works" className="btn-secondary !px-6 !py-3.5">See how it works</a>
          </div>
        </div>

        <div className="relative">
          <div className="card rotate-1 p-5 shadow-2xl shadow-violet-200/60">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-600">Featured campaign</p>
                <h2 className="mt-1 text-xl font-bold">Everyday ritual stories</h2>
              </div>
              <span className="status status-green">Open</span>
            </div>
            <div className="grid grid-cols-3 gap-3 py-5">
              <Stat label="Creator fee" value="₹5,000" />
              <Stat label="Open slots" value="8" />
              <Stat label="Apply by" value="15 Oct" />
            </div>
            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Budget clarity</span><span>₹10k reserved of ₹50k</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-1/5 rounded-full bg-violet-400" /></div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <p className="eyebrow">How it works</p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ["01", "Create with clarity", "Set one budget, fee, deadline and slot count. Everyone sees the same terms."],
              ["02", "Choose the right fit", "Review creator applications and reserve budget the instant you approve."],
              ["03", "Track every decision", "Both sides always know what is pending, approved or withdrawn."],
            ].map(([number, title, copy]) => (
              <article className="card p-6" key={number}>
                <span className="text-sm font-black text-violet-600">{number}</span>
                <h3 className="mt-8 text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}
