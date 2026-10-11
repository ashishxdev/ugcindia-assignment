"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Application, Campaign, Submission, User } from "@/lib/types";

export default function BrandDashboard() {
  const router = useRouter();
  const campaignEditorRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [campaignFormError, setCampaignFormError] = useState("");

  const loadCampaigns = useCallback(async () => {
    try {
      const [{ user: currentUser }, { campaigns: records }] = await Promise.all([
        api<{ user: User }>("/auth/me"),
        api<{ campaigns: Campaign[] }>("/campaigns/mine"),
      ]);
      if (currentUser.role !== "BRAND") return router.replace("/creator/dashboard");
      setUser(currentUser);
      setCampaigns(records);
      setSelected((current) => current ?? records[0]?._id ?? null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.replace("/login");
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadApplications = useCallback(async (campaignId: string) => {
    try {
      const response = await api<{ applications: Application[] }>(`/campaigns/${campaignId}/applications`);
      setApplications(response.applications);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load applications");
    }
  }, []);

  const loadSubmissions = useCallback(async (campaignId: string) => {
    const response = await api<{ submissions: Submission[] }>(`/submissions/campaign/${campaignId}`);
    setSubmissions(response.submissions);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ user: User }>("/auth/me"),
      api<{ campaigns: Campaign[] }>("/campaigns/mine"),
    ]).then(([{ user: currentUser }, { campaigns: records }]) => {
      if (!active) return;
      if (currentUser.role !== "BRAND") { router.replace("/creator/dashboard"); return; }
      setUser(currentUser);
      setCampaigns(records);
      setSelected(records[0]?._id ?? null);
    }).catch((caught: unknown) => {
      if (!active) return;
      if (caught instanceof ApiError && caught.status === 401) { router.replace("/login"); return; }
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    Promise.all([
      api<{ applications: Application[] }>(`/campaigns/${selected}/applications`),
      api<{ submissions: Submission[] }>(`/submissions/campaign/${selected}`),
    ])
      .then(([applicationResponse, submissionResponse]) => { if (active) { setApplications(applicationResponse.applications); setSubmissions(submissionResponse.submissions); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load applications"); });
    return () => { active = false; };
  }, [selected]);
  useEffect(() => {
    if (!editingCampaign) return;
    const frame = window.requestAnimationFrame(() => {
      campaignEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingCampaign]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const budgetRupees = Number(form.get("budget"));
    const creatorFeeRupees = Number(form.get("fee"));
    const slots = Number(form.get("slots"));
    const applicationDeadline = new Date(String(form.get("applicationDeadline")));
    const submissionDeadline = new Date(String(form.get("submissionDeadline")));

    setCampaignFormError("");
    if (budgetRupees < creatorFeeRupees * slots) {
      setCampaignFormError(
        `The total budget must be at least ${formatMoney(creatorFeeRupees * slots)} to cover ${slots} creator ${slots === 1 ? "slot" : "slots"}.`,
      );
      return;
    }
    if (applicationDeadline <= new Date()) {
      setCampaignFormError("The application deadline must be in the future.");
      return;
    }
    if (submissionDeadline <= applicationDeadline) {
      setCampaignFormError("The submission deadline must be after the application deadline.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { campaign } = await api<{ campaign: Campaign }>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"), description: form.get("description"), budgetRupees,
          creatorFeeRupees, slots,
          applicationDeadline: applicationDeadline.toISOString(),
          submissionDeadline: submissionDeadline.toISOString(),
        }),
      });
      setCampaigns((current) => [campaign, ...current]);
      setSelected(campaign._id);
      setShowForm(false);
      setEditingCampaign(null);
      formElement.reset();
    } catch (caught) {
      setCampaignFormError(caught instanceof Error ? caught.message : "Unable to create campaign");
    } finally { setSaving(false); }
  }

  async function updateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCampaign) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const budgetRupees = Number(form.get("budget"));
    const creatorFeeRupees = Number(form.get("fee"));
    const slots = Number(form.get("slots"));
    const applicationDeadline = new Date(String(form.get("applicationDeadline")));
    const submissionDeadline = new Date(String(form.get("submissionDeadline")));

    setCampaignFormError("");
    if (budgetRupees < creatorFeeRupees * slots) {
      setCampaignFormError(
        `The total budget must be at least ${formatMoney(creatorFeeRupees * slots)} to cover ${slots} creator ${slots === 1 ? "slot" : "slots"}.`,
      );
      return;
    }
    if (submissionDeadline <= applicationDeadline) {
      setCampaignFormError("The submission deadline must be after the application deadline.");
      return;
    }

    setSaving(true);
    try {
      await api(`/campaigns/${editingCampaign._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.get("title"), description: form.get("description"), budgetRupees,
          creatorFeeRupees, slots,
          applicationDeadline: applicationDeadline.toISOString(),
          submissionDeadline: submissionDeadline.toISOString(),
        }),
      });
      setEditingCampaign(null);
      await loadCampaigns();
    } catch (caught) {
      setCampaignFormError(caught instanceof Error ? caught.message : "Unable to update campaign");
    } finally {
      setSaving(false);
    }
  }

  async function cancelCampaign(campaign: Campaign) {
    if (!window.confirm(`Cancel “${campaign.title}”? New applications will stop, but selected creators can still finish their work.`)) return;
    setSaving(true);
    setError("");
    try {
      await api(`/campaigns/${campaign._id}/cancel`, { method: "PATCH" });
      setEditingCampaign(null);
      await Promise.all([loadCampaigns(), loadApplications(campaign._id), loadSubmissions(campaign._id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel campaign");
    } finally {
      setSaving(false);
    }
  }

  async function decide(applicationId: string, decision: "approve" | "reject") {
    setError("");
    try {
      await api(`/applications/${applicationId}/${decision}`, { method: "PATCH" });
      await Promise.all([loadCampaigns(), selected ? loadApplications(selected) : Promise.resolve()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update application");
    }
  }

  async function reviewSubmission(submissionId: string, decision: "approve" | "revision" | "reject") {
    const note = feedback[submissionId]?.trim();
    setReviewErrors((current) => ({ ...current, [submissionId]: "" }));
    if (decision !== "approve" && (!note || note.length < 3)) {
      setReviewErrors((current) => ({
        ...current,
        [submissionId]: "Add at least 3 characters of feedback before requesting a revision or rejecting this deliverable.",
      }));
      return;
    }

    setReviewing(`${submissionId}:${decision}`);
    try {
      await api(`/submissions/${submissionId}/${decision}`, {
        method: "PATCH",
        body: JSON.stringify(decision === "approve" ? {} : { feedback: note }),
      });
      if (selected) await Promise.all([loadCampaigns(), loadSubmissions(selected)]);
    } catch (caught) {
      setReviewErrors((current) => ({
        ...current,
        [submissionId]: caught instanceof Error ? caught.message : "Unable to review this submission.",
      }));
    } finally {
      setReviewing(null);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      const { preferences } = await api<{ preferences: User["notificationPreferences"] }>("/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ email: form.get("email") === "on", whatsapp: form.get("whatsapp") === "on" }),
      });
      setUser((current) => current ? { ...current, notificationPreferences: preferences } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save preferences"); }
    finally { setSaving(false); }
  }

  if (loading) return <Loading />;

  const activeCampaign = campaigns.find((campaign) => campaign._id === selected);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const campaignHistory = campaigns.filter((campaign) => campaign.status !== "ACTIVE");
  const pending = applications.filter((application) => application.status === "APPLIED").length;
  const approvedAndPaid = campaigns.reduce(
    (total, campaign) =>
      total +
      (campaign.creatorFeeRupees > 0
        ? Math.round((campaign.spentRupees ?? 0) / campaign.creatorFeeRupees)
        : 0),
    0,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader label="Brand workspace" />
      <main className="mx-auto max-w-7xl px-5 py-9 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow">Overview</p><h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">Good morning, {user?.name.split(" ")[0]}</h1><p className="mt-2 text-slate-600">Create campaigns and move the right creators forward.</p></div>
          <button className="btn-primary !px-5 !py-3" onClick={() => { setCampaignFormError(""); setEditingCampaign(null); setShowForm((value) => !value); }}>{showForm ? "Close form" : "+ New campaign"}</button>
        </div>

        {error && <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        {showForm && <CampaignForm onSubmit={createCampaign} saving={saving} error={campaignFormError} />}
        {editingCampaign && <div ref={campaignEditorRef} className="scroll-mt-4"><CampaignForm key={editingCampaign._id} campaign={editingCampaign} onSubmit={updateCampaign} saving={saving} error={campaignFormError} onCancel={() => { setEditingCampaign(null); setCampaignFormError(""); }} /></div>}

        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric label="Campaigns" value={String(campaigns.length)} />
          <Metric label="Pending review" value={String(pending)} />
          <Metric label="Approved & paid" value={String(approvedAndPaid)} />
          <Metric label="Budget committed" value={formatMoney(campaigns.reduce((sum, item) => sum + item.reservedRupees + (item.spentRupees ?? 0), 0))} />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Active campaigns</h2><span className="text-sm text-slate-500">{activeCampaigns.length} active</span></div>
            <div className="max-h-[42rem] space-y-3 overflow-y-auto overscroll-contain pr-2" role="region" aria-label="Campaign list" tabIndex={0}>
              {activeCampaigns.map((campaign) => (
                <article key={campaign._id} className={`card overflow-hidden hover:border-violet-300 ${selected === campaign._id ? "border-violet-400 ring-4 ring-violet-100" : ""}`}>
                  <button type="button" onClick={() => setSelected(campaign._id)} className="w-full p-5 text-left">
                    <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{campaign.title}</h3><span className={`status ${campaign.status === "ACTIVE" ? "status-green" : "status-red"}`}>{campaign.status}</span></div>
                    <p className="mt-3 text-sm text-slate-500">{getCollaborationStats(campaign).currentCount}/{campaign.slots} current collaborations</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <CountValue label="Selected" value={getCollaborationStats(campaign).selectedCount} />
                      <CountValue label="Active" value={getCollaborationStats(campaign).activeCount} />
                      <CountValue label="Paid" value={getCollaborationStats(campaign).paidCount} tone="green" />
                      <CountValue label="Rejected" value={getCollaborationStats(campaign).rejectedCount} tone="red" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <BudgetValue label="Total" value={campaign.budgetRupees} />
                      <BudgetValue label="Available" value={Math.max(0, campaign.budgetRupees - campaign.reservedRupees - (campaign.spentRupees ?? 0))} highlight />
                      <BudgetValue label="Reserved" value={campaign.reservedRupees} />
                      <BudgetValue label="Paid" value={campaign.spentRupees ?? 0} />
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, (getCollaborationStats(campaign).currentCount / campaign.slots) * 100)}%` }} /></div>
                  </button>
                  {campaign.status === "ACTIVE" && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3"><button type="button" className="btn-secondary !px-3 !py-2" onClick={() => { setSelected(campaign._id); setShowForm(false); setCampaignFormError(""); setEditingCampaign(campaign); }}>Edit</button><button type="button" className="btn-danger !px-3 !py-2" disabled={saving} onClick={() => cancelCampaign(campaign)}>Cancel campaign</button></div>}
                </article>
              ))}
              {!activeCampaigns.length && <Empty copy="No active campaigns. Create one when you are ready to collaborate again." />}
            </div>
            <div className="mb-4 mt-8 flex items-center justify-between"><h2 className="text-xl font-bold">Campaign history</h2><span className="text-sm text-slate-500">{campaignHistory.length} closed</span></div>
            <div className="max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-2" role="region" aria-label="Campaign history" tabIndex={0}>
              {campaignHistory.map((campaign) => (
                <article key={campaign._id} className={`card overflow-hidden ${selected === campaign._id ? "border-violet-400 ring-4 ring-violet-100" : ""}`}>
                  <button type="button" onClick={() => setSelected(campaign._id)} className="w-full p-5 text-left">
                    <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{campaign.title}</h3><p className="mt-1 text-xs text-slate-500">Read-only campaign record</p></div><span className={`status ${campaign.status === "COMPLETED" ? "status-green" : "status-red"}`}>{campaign.status}</span></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <CountValue label="Selected" value={getCollaborationStats(campaign).selectedCount} />
                      <CountValue label="Paid" value={getCollaborationStats(campaign).paidCount} tone="green" />
                      <CountValue label="Rejected" value={getCollaborationStats(campaign).rejectedCount} tone="red" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><BudgetValue label="Total budget" value={campaign.budgetRupees} /><BudgetValue label="Paid" value={campaign.spentRupees ?? 0} /></div>
                  </button>
                </article>
              ))}
              {!campaignHistory.length && <Empty copy="Completed and cancelled campaigns will be kept here." />}
            </div>
          </div>

          <div>
            <div className="mb-4"><h2 className="text-xl font-bold">Applicants</h2>{activeCampaign && <span className="text-sm text-slate-500">For {activeCampaign.title}</span>}</div>
            <div className="card overflow-hidden">
              {applications.map((application, index) => {
                const creator = typeof application.creator === "string" ? null : application.creator;
                return <div key={application._id} className={`p-5 ${index ? "border-t border-slate-100" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><p className="font-bold">{creator?.name ?? "Creator"}</p><p className="mt-1 text-sm text-slate-500">{creator?.email}</p>{application.note && <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">“{application.note}”</p>}</div>
                    <div className="flex items-center gap-2">
                      <Status value={application.status} />
                      {application.status === "APPLIED" && <><button className="btn-secondary !px-3 !py-2" onClick={() => decide(application._id, "reject")}>Reject</button><button className="btn-primary !px-3 !py-2" onClick={() => decide(application._id, "approve")}>Approve</button></>}
                    </div>
                  </div>
                </div>;
              })}
              {!applications.length && <Empty copy={activeCampaign ? "No creators have applied yet." : "Select a campaign to review applicants."} />}
            </div>
          </div>
        </section>

        <section className="mt-10 pb-12">
          <div className="flex items-center justify-between"><div><p className="eyebrow">Content review</p><h2 className="mt-2 text-2xl font-bold">Deliverables</h2></div><span className="text-sm text-slate-500">{submissions.length} received</span></div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {submissions.map((submission) => {
              const creator = typeof submission.creator === "string" ? null : submission.creator;
              return <article className="card p-6" key={submission._id}>
                <div className="flex items-start justify-between gap-4"><div><p className="font-bold">{creator?.name ?? "Creator"}</p><p className="mt-1 text-sm text-slate-500">Revision {submission.revisionCount} of 2</p></div><SubmissionBadge value={submission.status} /></div>
                <a className="mt-5 block truncate rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-violet-700 hover:bg-violet-50" href={submission.url} target="_blank" rel="noreferrer">Open Instagram deliverable ↗</a>
                {submission.feedback && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Previous feedback: {submission.feedback}</p>}
                {submission.status === "SUBMITTED" && <>
                  <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor={`feedback-${submission._id}`}>Review feedback</label>
                  <textarea className="input mt-2 min-h-20 resize-y" id={`feedback-${submission._id}`} placeholder="Required for revision or rejection" aria-invalid={Boolean(reviewErrors[submission._id])} aria-describedby={reviewErrors[submission._id] ? `review-error-${submission._id}` : undefined} value={feedback[submission._id] ?? ""} onChange={(event) => { setFeedback((current) => ({ ...current, [submission._id]: event.target.value })); setReviewErrors((current) => ({ ...current, [submission._id]: "" })); }} />
                  {reviewErrors[submission._id] && <p id={`review-error-${submission._id}`} role="alert" aria-live="polite" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{reviewErrors[submission._id]}</p>}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button className="btn-danger" disabled={Boolean(reviewing)} onClick={() => reviewSubmission(submission._id, "reject")}>{reviewing === `${submission._id}:reject` ? "Rejecting…" : "Reject"}</button>
                    <button className="btn-secondary" disabled={submission.revisionCount >= 2 || Boolean(reviewing)} onClick={() => reviewSubmission(submission._id, "revision")}>{reviewing === `${submission._id}:revision` ? "Requesting…" : "Request revision"}</button>
                    <button className="btn-primary" disabled={Boolean(reviewing)} onClick={() => reviewSubmission(submission._id, "approve")}>{reviewing === `${submission._id}:approve` ? "Approving…" : "Approve & pay"}</button>
                  </div>
                </>}
              </article>;
            })}
            {!submissions.length && <div className="card lg:col-span-2"><Empty copy={activeCampaign ? "Approved creators’ deliverables will appear here." : "Select a campaign to review work."} /></div>}
          </div>
        </section>
        {user && <form className="card mb-12 flex flex-wrap items-center justify-between gap-5 p-6" onSubmit={savePreferences}><div><h2 className="font-bold">Notification channels</h2><p className="mt-1 text-sm text-slate-500">Messages created from 9 PM to 9 AM IST wait until 9 AM.</p></div><div className="flex flex-wrap items-center gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={user.notificationPreferences.email} /> Email</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp" defaultChecked={user.notificationPreferences.whatsapp} /> WhatsApp</label><button className="btn-secondary" disabled={saving}>Save preferences</button></div></form>}
      </main>
    </div>
  );
}

function CampaignForm({ onSubmit, saving, error, campaign, onCancel }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; error: string; campaign?: Campaign; onCancel?: () => void }) {
  return <form onSubmit={onSubmit} className="card mt-8 p-6 shadow-xl shadow-slate-200/50">
    <div><p className="eyebrow">{campaign ? "Edit campaign" : "New campaign"}</p><h2 className="mt-1 text-2xl font-bold">{campaign ? "Update the campaign details" : "The essentials, all in one place"}</h2>{campaign && campaign.approvedCount > 0 && <p className="mt-2 text-sm text-slate-500">The creator fee is locked because creators have already been selected.</p>}</div>
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      <div className="field md:col-span-2"><label htmlFor="title">Campaign title</label><input className="input" id="title" name="title" defaultValue={campaign?.title} minLength={3} maxLength={120} placeholder="e.g. Everyday skincare stories" required /></div>
      <div className="field md:col-span-2"><label htmlFor="description">What should creators know?</label><textarea className="input min-h-28 resize-y" id="description" name="description" defaultValue={campaign?.description} minLength={10} maxLength={1200} placeholder="Describe the product, audience and content direction." required /></div>
      <div className="field"><label htmlFor="budget">Total budget (₹)</label><input className="input" id="budget" name="budget" type="number" defaultValue={campaign?.budgetRupees} min="1" step="0.01" required /></div>
      <div className="field"><label htmlFor="fee">Fee per creator (₹)</label><input className="input read-only:bg-slate-100 read-only:text-slate-500" id="fee" name="fee" type="number" defaultValue={campaign?.creatorFeeRupees} min="1" step="0.01" readOnly={Boolean(campaign && campaign.approvedCount > 0)} required /></div>
      <div className="field"><label htmlFor="slots">Creator slots</label><input className="input" id="slots" name="slots" type="number" defaultValue={campaign?.slots} min={Math.max(1, campaign?.approvedCount ?? 1)} max="1000" required /></div>
      <div className="field"><label htmlFor="applicationDeadline">Application deadline</label><input className="input" id="applicationDeadline" name="applicationDeadline" type="datetime-local" defaultValue={campaign ? formatDateTimeLocal(campaign.applicationDeadline) : undefined} required /></div>
      <div className="field"><label htmlFor="submissionDeadline">Submission deadline</label><input className="input" id="submissionDeadline" name="submissionDeadline" type="datetime-local" defaultValue={campaign ? formatDateTimeLocal(campaign.submissionDeadline) : undefined} required /></div>
    </div>
    {error && <p role="alert" aria-live="polite" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
    <div className="mt-6 flex justify-end gap-3">{onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Close</button>}<button className="btn-primary !px-6 !py-3" disabled={saving}>{saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}</button></div>
  </form>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p></div>; }
function CountValue({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "red" }) { const colors = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"; return <div className={`rounded-lg px-2.5 py-2 ${colors}`}><span>{label}</span><strong className="ml-1">{value}</strong></div>; }
function BudgetValue({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) { return <div className={`rounded-xl p-2.5 ${highlight ? "bg-emerald-50" : "bg-slate-50"}`}><p className={`text-[10px] uppercase tracking-wide ${highlight ? "text-emerald-700" : "text-slate-400"}`}>{label}</p><p className={`mt-1 font-bold ${highlight ? "text-emerald-700" : "text-slate-700"}`}>{formatMoney(value)}</p></div>; }
function Empty({ copy }: { copy: string }) { return <div className="p-10 text-center text-sm text-slate-500">{copy}</div>; }
function Status({ value }: { value: Application["status"] }) { const classes = value === "APPROVED" ? "status-green" : value === "APPLIED" ? "status-yellow" : value === "REJECTED" ? "status-red" : "status-slate"; const label = value === "APPROVED" ? "SELECTED" : value; return <span className={`status ${classes}`}>{label}</span>; }
function SubmissionBadge({ value }: { value: Submission["status"] }) { const classes = value === "APPROVED" ? "status-green" : value === "SUBMITTED" ? "status-yellow" : value === "REJECTED" ? "status-red" : "status-slate"; return <span className={`status ${classes}`}>{value.replace("_", " ")}</span>; }
function Loading() { return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" /></div>; }
function getCollaborationStats(campaign: Campaign) { return campaign.collaborationStats ?? { selectedCount: campaign.approvedCount, activeCount: campaign.approvedCount, paidCount: 0, rejectedCount: 0, currentCount: campaign.approvedCount }; }
function formatDateTimeLocal(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
