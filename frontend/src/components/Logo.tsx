import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-xl font-black tracking-[-0.04em] text-slate-950">
      <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-sm text-white shadow-lg shadow-violet-200">
        UC
      </span>
      Collabry
    </Link>
  );
}
