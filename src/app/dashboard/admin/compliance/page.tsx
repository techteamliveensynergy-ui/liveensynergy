import Link from "next/link";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Compliance & audit · Admin" };

interface Overview {
  terms_versions: { version: string; accounts: number }[];
  accounts_total: number;
  accounts_blocked: number;
  inactive_12_months: number;
  newsletter_opt_in: number;
  newsletter_opt_out: number;
  participation_terms_accepted: number;
  survey_consents: number;
  order_forms_approved: number;
  audit_events_30_days: number;
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  "survey.export": "Downloaded survey data",
  "participants.export": "Downloaded participant list",
};

type Status = "recorded" | "partial" | "planned";
const STATUS_CHIP: Record<Status, { label: string; cls: string }> = {
  recorded: { label: "Recorded", cls: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" },
  partial: { label: "Partly recorded", cls: "bg-[var(--color-gold)] text-[var(--color-ink)]" },
  planned: { label: "To discuss", cls: "bg-[var(--color-mist)] text-[var(--color-ink-soft)]" },
};

function Area({ title, status, children }: { title: string; status: Status; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className={`chip ${STATUS_CHIP[status].cls}`}>{STATUS_CHIP[status].label}</span>
      </div>
      <div className="mt-2 space-y-1 text-sm text-[var(--color-ink-soft)]">{children}</div>
    </section>
  );
}

/**
 * Compliance & audit (Admin Portal brief, 9 Oct — new module; "chat more in
 * coming time"). One page that says, for each governance area the brief
 * lists, what the platform records today and what's still to agree. The
 * activity trail starts with data exports (admin_audit_log, 0060); counts
 * come from compliance_overview() in one admin-checked call.
 */
export default async function AdminCompliancePage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: overviewData }, { data: auditRows }, { data: paymentAuditRows }] = await Promise.all([
    supabase.rpc("compliance_overview"),
    supabase
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, detail, created_at, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("payment_settings_audit")
      .select("id, action, mode, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const o = overviewData as Overview | null;
  const audit = (auditRows ?? []) as unknown as AuditRow[];
  const exports = audit.filter((a) => a.action.endsWith(".export"));
  const paymentAudit = (paymentAuditRows ?? []) as { id: string; action: string; mode: string | null; created_at: string }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compliance & audit"
        subtitle="What the platform records for data-protection governance today, and what's still to agree."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Area title="Administrator activity audit trail" status="partial">
          <p>
            {o?.audit_events_30_days ?? 0} recorded admin actions in the last 30 days. Recorded so far: data
            downloads, and every change to the Stripe payment settings. Other admin actions carry their own
            who/when stamps (invoice paid by, payment waived by, request reviewed by).
          </p>
        </Area>

        <Area title="Data export approvals" status="partial">
          <p>
            Every survey and participant download is logged with who, when and what ({exports.length} in the latest
            50 entries below). Survey downloads are anonymised at the database. An approval step before a
            download isn&apos;t built — to agree whether it&apos;s needed.
          </p>
        </Area>

        <Area title="Marketing consent and withdrawal records" status="partial">
          <p>
            Event sign-ups: {o?.newsletter_opt_in ?? 0} opted in to marketing, {o?.newsletter_opt_out ?? 0} did not.
            The current choice is stored; a history of withdrawals (when someone changed their mind) isn&apos;t yet.
          </p>
        </Area>

        <Area title="Privacy notice and terms version history" status="partial">
          <p>Accounts by the terms version they accepted at sign-up:</p>
          <ul className="list-inside list-disc">
            {(o?.terms_versions ?? []).map((v) => (
              <li key={v.version}>
                {v.version}: {v.accounts}
              </li>
            ))}
          </ul>
          <p>
            Plus {o?.participation_terms_accepted ?? 0} event-level terms acceptances, {o?.survey_consents ?? 0} survey
            privacy consents and {o?.order_forms_approved ?? 0} brand order-form approvals (both consents). The text of
            each past version isn&apos;t archived in the platform yet.
          </p>
        </Area>

        <Area title="Data retention and deletion schedules" status="planned">
          <p>
            {o?.inactive_12_months ?? 0} of {o?.accounts_total ?? 0} accounts have been inactive for more than 12
            months (
            <Link href="/dashboard/admin/users?activity=inactive_12m" className="underline">
              see them
            </Link>
            ). {o?.accounts_blocked ?? 0} accounts are blocked. Retention periods and automatic deletion are to agree.
          </p>
        </Area>

        <Area title="Joint-controller campaign records and arrangements" status="planned">
          <p>
            Each campaign&apos;s approved order form records the brand&apos;s consents and the agreed research scope. A
            written joint-controller arrangement per campaign is to agree.
          </p>
        </Area>

        <Area title="Data subject access and deletion requests" status="planned">
          <p>
            Not tracked as its own workflow yet. Until then, requests arriving through{" "}
            <Link href="/dashboard/admin/enquiries" className="underline">
              Enquiries
            </Link>{" "}
            can be handled there.
          </p>
        </Area>

        <Area title="Personal data breach and incident logs" status="planned">
          <p>No incident log in the platform yet — to agree format and who records it.</p>
        </Area>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Recent admin activity</h2>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Nothing recorded yet. Downloads will appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{a.profiles?.full_name || a.profiles?.email || "An admin"}</span>{" "}
                  {ACTION_LABELS[a.action] ?? a.action}
                  {typeof a.detail?.title === "string" ? ` — ${a.detail.title}` : ""}
                  {typeof a.detail?.file === "string" ? ` (${a.detail.file}${a.detail.include_rejected ? ", incl. rejected" : ""})` : ""}
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">{formatDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Payment settings changes</h2>
        {paymentAudit.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">No changes recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {paymentAudit.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  {p.action.replace(/_/g, " ")}
                  {p.mode ? ` (${p.mode})` : ""}
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">{formatDateTime(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
