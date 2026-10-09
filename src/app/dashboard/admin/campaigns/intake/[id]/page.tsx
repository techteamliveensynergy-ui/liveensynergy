import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { displayUrl } from "@/lib/urls";
import type { CampaignIntakeRequest } from "@/lib/types";
import { reviewCampaignIntake } from "../../../marketplace-actions";

export const metadata = { title: "Campaign request · Admin" };

interface Row extends CampaignIntakeRequest {
  brands: { brand_name: string; profile_id: string } | null;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words">{value}</dd>
    </div>
  );
}

/**
 * One brand-submitted campaign request, in full (Admin Portal brief, 9 Oct:
 * "when we see a campaign request we cannot click on it and see the
 * details"). Read-only on purpose — it's the brand's own form. To change
 * anything, create the campaign from it and edit the campaign. "Message
 * brand" opens the admin↔brand support thread (0030) so the conversation
 * can start before the request is accepted.
 */
export default async function AdminCampaignRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("campaign_intake_requests")
    .select("*, brands(brand_name, profile_id)")
    .eq("id", id)
    .maybeSingle<Row>();
  if (!data) notFound();
  const r = data;
  const messageHref = r.brands
    ? `/dashboard/messages/with/${r.brands.profile_id}?subject=${encodeURIComponent(`Campaign request ${r.reference}`)}`
    : null;
  const canAct = r.status === "submitted" || r.status === "in_review";

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/admin/campaigns/intake?status=${r.status}`} className="inline-block text-sm text-[var(--color-brand)]">
        ← Back to campaign requests
      </Link>
      <PageHeader
        title={r.target_name || `${r.brands?.brand_name ?? "Brand"} campaign request`}
        subtitle={`Request ${r.reference} · ${r.brands?.brand_name ?? "Unknown brand"} · submitted ${formatDateTime(r.created_at)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {messageHref && (
              <Link href={messageHref} className="btn btn-primary text-sm">
                Message brand
              </Link>
            )}
          </div>
        }
      />

      {r.status === "declined" && (
        <p className="rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          Declined{r.reviewed_at ? ` ${formatDateTime(r.reviewed_at)}` : ""}
          {r.decline_reason ? `: ${r.decline_reason}` : "."}
        </p>
      )}
      {r.status === "in_review" && (
        <p className="rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm">
          Approved — the campaign hasn&apos;t been created yet. Continue below, or decline it.
        </p>
      )}

      <section className="card p-6">
        {r.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt="" className="mb-4 max-h-64 w-full rounded-xl object-cover" />
        )}
        <h2 className="text-lg font-semibold">What the brand wants</h2>
        <p className="mt-2 whitespace-pre-line">{r.description}</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <Fact label="Budget guidance" value={r.budget_expectation_gbp ? `£${Number(r.budget_expectation_gbp).toLocaleString("en-GB")}` : null} />
          <Fact label="Category" value={r.category === "other" ? r.category_other : r.category} />
          <Fact label="Preferred location" value={r.preferred_location} />
          <Fact label="Preferred timeline" value={r.preferred_timeline} />
          <Fact label="Artist / event in mind" value={r.target_name} />
          <Fact label="Reward rules" value={r.reward_rules} />
          <Fact label="Expected outcomes" value={r.expected_outcomes} />
          <Fact label="Anything else" value={r.additional_info} />
          <Fact
            label="Event the brand suggests"
            value={
              r.suggested_event_note || r.suggested_event_url ? (
                <>
                  {r.suggested_event_note}
                  {r.suggested_event_url && (
                    <>
                      {" "}
                      <a href={r.suggested_event_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {displayUrl(r.suggested_event_url)} ↗
                      </a>
                    </>
                  )}
                </>
              ) : null
            }
          />
        </dl>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Brand contact</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          <Fact label="Name" value={r.manager_name} />
          <Fact label="Email" value={<a href={`mailto:${r.manager_email}`} className="underline">{r.manager_email}</a>} />
          <Fact label="Phone" value={r.manager_phone} />
        </dl>
        {r.brands && (
          <p className="mt-3 text-sm">
            <Link href={`/dashboard/admin/users/${r.brands.profile_id}`} className="underline">
              Open {r.brands.brand_name}&apos;s account
            </Link>
          </p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Next step</h2>
        {canAct ? (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            {r.status === "submitted" ? (
              <form action={reviewCampaignIntake}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="op" value="approve" />
                <button type="submit" className="btn btn-primary text-sm">
                  Approve → create campaign
                </button>
              </form>
            ) : (
              <Link href={`/dashboard/admin/campaigns/new?from_intake=${r.id}`} className="btn btn-primary text-sm">
                Continue creating the campaign
              </Link>
            )}
            <form action={reviewCampaignIntake} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="op" value="decline" />
              <input type="text" name="decline_reason" placeholder="Reason (shown to the brand)" className="input w-64 py-1.5 text-sm" />
              <button type="submit" className="btn btn-ghost text-sm text-[var(--color-accent)]">
                Decline
              </button>
            </form>
          </div>
        ) : r.status === "converted" && r.converted_campaign_id ? (
          <p className="mt-2 text-sm">
            Turned into a campaign.{" "}
            <Link href={`/dashboard/admin/campaigns/${r.converted_campaign_id}`} className="font-semibold underline">
              Open the campaign →
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Nothing left to do on this request.</p>
        )}
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          The request stays as the brand sent it. Details are adjusted on the campaign once it&apos;s created.
        </p>
      </section>
    </div>
  );
}
