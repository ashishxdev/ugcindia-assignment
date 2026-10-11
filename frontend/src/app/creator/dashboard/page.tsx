"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { Application, Campaign, LedgerEntry, Submission, User, Wallet, Withdrawal } from "@/lib/types";

interface WalletResponse { wallet: Wallet; ledger: LedgerEntry[]; withdrawals: Withdrawal[] }

export default function CreatorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [walletData, setWalletData] = useState<WalletResponse | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [submissionErrors, setSubmissionErrors] = useState<Record<string, string>>({});
  const [walletError, setWalletError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [userResponse, campaignResponse, applicationResponse, submissionResponse, walletResponse] = await Promise.all([
        api<{ user: User }>("/auth/me"), api<{ campaigns: Campaign[] }>("/campaigns"),
        api<{ applications: Application[] }>("/applications/mine"), api<{ submissions: Submission[] }>("/submissions/mine"),
        api<WalletResponse>("/wallet"),
      ]);
      if (userResponse.user.role !== "CREATOR") { router.replace("/brand/dashboard"); return; }
      setUser(userResponse.user); setCampaigns(campaignResponse.campaigns); setApplications(applicationResponse.applications);
      setSubmissions(submissionResponse.submissions); setWalletData(walletResponse);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace("/login"); return; }
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ user: User }>("/auth/me"), api<{ campaigns: Campaign[] }>("/campaigns"),
      api<{ applications: Application[] }>("/applications/mine"), api<{ submissions: Submission[] }>("/submissions/mine"), api<WalletResponse>("/wallet"),
    ]).then(([userResponse, campaignResponse, applicationResponse, submissionResponse, walletResponse]) => {
      if (!active) return;
      if (userResponse.user.role !== "CREATOR") { router.replace("/brand/dashboard"); return; }
      setUser(userResponse.user); setCampaigns(campaignResponse.campaigns); setApplications(applicationResponse.applications);
      setSubmissions(submissionResponse.submissions); setWalletData(walletResponse);
    }).catch((caught: unknown) => {
      if (!active) return;
      if (caught instanceof ApiError && caught.status === 401) { router.replace("/login"); return; }
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  const byCampaign = useMemo(() => new Map(applications.map((item) => [typeof item.campaign === "string" ? item.campaign : item.campaign._id, item])), [applications]);
  const byApplication = useMemo(() => new Map(submissions.map((item) => [typeof item.application === "string" ? item.application : item.application._id, item])), [submissions]);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id); setError("");
    try { await action(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to complete this action"); }
    finally { setBusy(null); }
  }

  function apply(campaignId: string) { return run(campaignId, () => api(`/campaigns/${campaignId}/applications`, { method: "POST", body: "{}" })); }
  function withdraw(application: Application) { return run(application._id, () => api(`/applications/${application._id}/withdraw`, { method: "PATCH" })); }
  async function submit(application: Application) {
    const url = urls[application._id]?.trim();
    setSubmissionErrors((current) => ({ ...current, [application._id]: "" }));
    if (!url) {
      setSubmissionErrors((current) => ({ ...current, [application._id]: "Add your Instagram post URL first." }));
      return;
    }
    if (!isInstagramUrl(url)) {
      setSubmissionErrors((current) => ({ ...current, [application._id]: "Enter a complete Instagram URL, for example https://www.instagram.com/p/example/." }));
      return;
    }

    setBusy(application._id);
    try {
      await api("/submissions", { method: "POST", body: JSON.stringify({ applicationId: application._id, url }) });
      setUrls((current) => ({ ...current, [application._id]: "" }));
      await load();
    } catch (caught) {
      setSubmissionErrors((current) => ({ ...current, [application._id]: caught instanceof Error ? caught.message : "Unable to submit this deliverable." }));
    } finally {
      setBusy(null);
    }
  }

  async function requestWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountRupees = Number(form.get("amount"));
    const availableRupees = walletData?.wallet.availableRupees ?? 0;

    setWalletError("");
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      setWalletError("Enter a valid withdrawal amount.");
      return;
    }
    if (amountRupees > availableRupees) {
      setWalletError(
        `You can withdraw up to ${formatMoney(availableRupees)} from your available balance.`,
      );
      return;
    }

    setBusy("withdrawal");
    try {
      await api("/wallet/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountRupees, mockOutcome: form.get("outcome") }),
      });
      formElement.reset();
      await load();
    } catch (caught) {
      setWalletError(caught instanceof Error ? caught.message : "Unable to process this withdrawal.");
    } finally {
      setBusy(null);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run("preferences", () => api("/notifications/preferences", { method: "PATCH", body: JSON.stringify({ email: form.get("email") === "on", whatsapp: form.get("whatsapp") === "on" }) }));
  }

  if (loading) return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" /></div>;

  const workApplications = applications.filter((item) => item.status === "APPROVED");
  const approvedWorkCount = submissions.filter((item) => item.status === "APPROVED").length;
  return <div className="min-h-screen bg-slate-50">
    <DashboardHeader label="Creator workspace" />
    <main className="mx-auto max-w-7xl px-5 py-9 lg:px-8">
      <div><p className="eyebrow">Discover</p><h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">Find your next fit, {user?.name.split(" ")[0]}</h1><p className="mt-2 text-slate-600">Clear briefs, visible fees and no guessing where you stand.</p></div>
      {error && <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4"><Metric label="Available balance" value={formatMoney(walletData?.wallet.availableRupees ?? 0)} /><Metric label="Lifetime earned" value={formatMoney(walletData?.wallet.lifetimeEarnedRupees ?? 0)} /><Metric label="Approved work" value={String(approvedWorkCount)} /><Metric label="Pending applications" value={String(applications.filter((item) => item.status === "APPLIED").length)} /></div>

      <section className="mt-10">
        <div className="flex items-center justify-between"><h2 className="text-2xl font-bold">Open campaigns</h2><span className="text-sm text-slate-500">{campaigns.length} opportunities</span></div>
        <div className="mt-5 flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain pb-4" role="region" aria-label="Open campaigns" tabIndex={0}>
          {campaigns.map((campaign) => {
            const application = byCampaign.get(campaign._id); const brand = typeof campaign.brand === "string" ? "Brand" : campaign.brand.name;
            const hasSubmission = application ? byApplication.has(application._id) : false;
            const payout = calculatePayoutPreview(campaign.creatorFeeRupees);
            return <article key={campaign._id} className="card flex w-[min(85vw,22rem)] shrink-0 snap-start flex-col p-6 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60">
              <div className="flex items-center justify-between"><span className="status status-green">Accepting applications</span><span className="text-xs font-medium text-slate-500">by {brand}</span></div>
              <h3 className="mt-5 text-xl font-bold tracking-tight">{campaign.title}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{campaign.description}</p>
              <div className="mt-6 grid grid-cols-3 gap-2 border-y border-slate-100 py-4 text-sm"><Detail label="Your fee" value={formatMoney(campaign.creatorFeeRupees)} /><Detail label="Slots left" value={String(campaign.slots - campaign.approvedCount)} /><Detail label="Apply by" value={formatDate(campaign.applicationDeadline)} /></div>
              <details className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm"><summary className="cursor-pointer font-bold text-emerald-800">Estimated take-home {formatMoney(payout.netRupees)}</summary><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-emerald-900"><span>Platform fee (10%)</span><span className="text-right">−{formatMoney(payout.platformFeeRupees)}</span><span>GST on fee (18%)</span><span className="text-right">−{formatMoney(payout.gstRupees)}</span><span>TDS (1%)</span><span className="text-right">−{formatMoney(payout.tdsRupees)}</span></div></details>
              <div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Submit by {formatDate(campaign.submissionDeadline)}</p>{!application && <button className="btn-primary" disabled={busy === campaign._id} onClick={() => apply(campaign._id)}>Apply</button>}{application && <div className="flex items-center gap-2"><ApplicationBadge status={application.status} />{(["APPLIED", "APPROVED"] as string[]).includes(application.status) && !hasSubmission && <button className="btn-danger" disabled={busy === application._id} onClick={() => withdraw(application)}>Withdraw</button>}</div>}</div>
            </article>;
          })}
        </div>
        {!campaigns.length && <Empty title="No open campaigns right now" copy="New opportunities will show up here." />}
      </section>

      <section className="mt-12"><div><p className="eyebrow">Your work</p><h2 className="mt-2 text-2xl font-bold">Approved collaborations</h2></div><div className="mt-5 grid max-h-[42rem] grid-cols-1 gap-5 overflow-y-auto overscroll-contain pr-2 md:grid-cols-2" role="region" aria-label="Approved collaborations" tabIndex={0}>
        {workApplications.map((application) => {
          const campaign = typeof application.campaign === "string" ? null : application.campaign; const submission = byApplication.get(application._id);
          const canSubmit = !submission || submission.status === "REVISION_REQUESTED";
          return <article className="card p-6" key={application._id}>
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold">{campaign?.title ?? "Campaign"}</h3><p className="mt-1 text-sm text-slate-500">Fee {formatMoney(campaign?.creatorFeeRupees ?? 0)}</p></div>{submission ? <SubmissionBadge status={submission.status} /> : <span className="status status-yellow">AWAITING SUBMISSION</span>}</div>
            {submission?.feedback && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><strong>Brand feedback:</strong> {submission.feedback}</p>}
            {submission && !canSubmit && <a className="mt-4 block truncate rounded-xl bg-slate-50 px-4 py-3 text-sm text-violet-700" href={submission.url} target="_blank" rel="noreferrer">{submission.url}</a>}
            {canSubmit && <div className="mt-5"><label className="text-sm font-bold text-slate-700" htmlFor={`url-${application._id}`}>{submission ? "Revised Instagram URL" : "Instagram post URL"}</label><div className="mt-2 flex gap-2"><input className="input" type="url" inputMode="url" id={`url-${application._id}`} placeholder="https://www.instagram.com/p/..." aria-invalid={Boolean(submissionErrors[application._id])} aria-describedby={submissionErrors[application._id] ? `url-error-${application._id}` : undefined} value={urls[application._id] ?? ""} onChange={(event) => { setUrls((current) => ({ ...current, [application._id]: event.target.value })); setSubmissionErrors((current) => ({ ...current, [application._id]: "" })); }} /><button className="btn-primary shrink-0" disabled={busy === application._id} onClick={() => submit(application)}>{busy === application._id ? "Submitting…" : submission ? "Resubmit" : "Submit"}</button></div>{submissionErrors[application._id] && <p id={`url-error-${application._id}`} role="alert" aria-live="polite" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{submissionErrors[application._id]}</p>}</div>}
            {submission && <p className="mt-3 text-xs text-slate-500">{submission.revisionCount}/2 revisions used</p>}
          </article>;
        })}
        {!workApplications.length && <div className="md:col-span-2"><Empty title="No approved collaborations yet" copy="When a brand approves you, the submission workspace appears here." /></div>}
      </div></section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <form className="card p-6" onSubmit={requestWithdrawal}><p className="eyebrow">Wallet</p><h2 className="mt-2 text-2xl font-bold">Withdraw funds</h2><p className="mt-2 text-sm text-slate-500">Available {formatMoney(walletData?.wallet.availableRupees ?? 0)}</p><div className="field mt-5"><label htmlFor="amount">Amount (₹)</label><input className="input" id="amount" name="amount" type="number" min="1" step="0.01" aria-invalid={Boolean(walletError)} aria-describedby={walletError ? "wallet-error" : undefined} onChange={() => setWalletError("")} required /></div><div className="field mt-4"><label htmlFor="outcome">Mock provider outcome</label><select className="input" id="outcome" name="outcome"><option value="SUCCESS">Simulate success</option><option value="FAILURE">Simulate failure</option></select></div>{walletError && <p id="wallet-error" role="alert" aria-live="polite" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{walletError}</p>}<button className="btn-primary mt-5 w-full" disabled={busy === "withdrawal"}>{busy === "withdrawal" ? "Processing…" : "Request withdrawal"}</button></form>
          {user && <form className="card p-6" onSubmit={savePreferences}><h3 className="font-bold">Notification channels</h3><p className="mt-1 text-sm text-slate-500">Quiet hours apply from 9 PM to 9 AM IST.</p><label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" name="email" defaultChecked={user.notificationPreferences.email} /> Email</label><label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" name="whatsapp" defaultChecked={user.notificationPreferences.whatsapp} /> WhatsApp</label><button className="btn-secondary mt-5" disabled={busy === "preferences"}>Save preferences</button></form>}
        </div>
        <div><h2 className="text-2xl font-bold">Wallet ledger</h2><div className="card mt-5 max-h-72 overflow-y-auto overscroll-contain" role="region" aria-label="Wallet ledger" tabIndex={0}>{walletData?.ledger.map((entry, index) => <div className={`flex min-h-24 items-center justify-between gap-4 p-5 ${index ? "border-t border-slate-100" : ""}`} key={entry._id}><div><p className="font-bold">{entry.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt)} · {entry.status}</p>{entry.breakdown && <p className="mt-2 text-xs text-slate-500">Gross {formatMoney(entry.breakdown.grossRupees)} − platform {formatMoney(entry.breakdown.platformFeeRupees)} − GST {formatMoney(entry.breakdown.gstRupees)} − TDS {formatMoney(entry.breakdown.tdsRupees)}</p>}</div><span className={`font-black ${entry.amountRupees >= 0 ? "text-emerald-600" : "text-slate-900"}`}>{entry.amountRupees >= 0 ? "+" : "−"}{formatMoney(Math.abs(entry.amountRupees))}</span></div>)}{!walletData?.ledger.length && <div className="p-10 text-center text-sm text-slate-500">Your transactions will appear here.</div>}</div><h3 className="mt-7 text-lg font-bold">Withdrawal status</h3><div className="card mt-3 max-h-60 overflow-y-auto overscroll-contain" role="region" aria-label="Withdrawal status history" tabIndex={0}>{walletData?.withdrawals.map((withdrawal, index) => <div className={`flex min-h-20 items-center justify-between gap-4 p-4 ${index ? "border-t border-slate-100" : ""}`} key={withdrawal._id}><div><p className="font-bold">{formatMoney(withdrawal.amountRupees)}</p><p className="mt-1 text-xs text-slate-500">{withdrawal.providerReference ?? withdrawal.failureReason ?? "Processing with mock provider"}</p></div><span className={`status ${withdrawal.status === "SUCCEEDED" ? "status-green" : withdrawal.status === "FAILED" ? "status-red" : "status-yellow"}`}>{withdrawal.status}</span></div>)}{!walletData?.withdrawals.length && <div className="p-7 text-center text-sm text-slate-500">No withdrawals requested.</div>}</div></div>
      </section>

      <section className="mt-12 pb-12"><h2 className="text-2xl font-bold">Application history</h2><div className="card mt-5 max-h-96 overflow-y-auto overscroll-contain" role="region" aria-label="Application history" tabIndex={0}>{applications.map((application, index) => { const campaign = typeof application.campaign === "string" ? null : application.campaign; return <div key={application._id} className={`flex items-center justify-between gap-4 p-5 ${index ? "border-t border-slate-100" : ""}`}><div><p className="font-bold">{campaign?.title ?? "Campaign"}</p><p className="mt-1 text-sm text-slate-500">Applied {formatDate(application.createdAt)}</p></div><ApplicationBadge status={application.status} /></div>; })}{!applications.length && <div className="p-10 text-center text-sm text-slate-500">You haven’t applied yet.</div>}</div></section>
    </main>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="card mt-5 p-12 text-center"><p className="font-bold">{title}</p><p className="mt-2 text-sm text-slate-500">{copy}</p></div>; }
function ApplicationBadge({ status }: { status: Application["status"] }) { const color = status === "APPROVED" ? "status-green" : status === "APPLIED" ? "status-yellow" : status === "REJECTED" ? "status-red" : "status-slate"; return <span className={`status ${color}`}>{status}</span>; }
function SubmissionBadge({ status }: { status: Submission["status"] }) { const color = status === "APPROVED" ? "status-green" : status === "SUBMITTED" ? "status-yellow" : status === "REJECTED" ? "status-red" : "status-slate"; return <span className={`status ${color}`}>{status.replace("_", " ")}</span>; }

function isInstagramUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === "https:" || url.protocol === "http:") &&
      (host === "instagram.com" || host.endsWith(".instagram.com"));
  } catch {
    return false;
  }
}

function calculatePayoutPreview(grossRupees: number) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const platformFeeRupees = round(grossRupees * 0.1);
  const gstRupees = round(platformFeeRupees * 0.18);
  const tdsRupees = round(grossRupees * 0.01);
  return {
    platformFeeRupees,
    gstRupees,
    tdsRupees,
    netRupees: round(grossRupees - platformFeeRupees - gstRupees - tdsRupees),
  };
}
