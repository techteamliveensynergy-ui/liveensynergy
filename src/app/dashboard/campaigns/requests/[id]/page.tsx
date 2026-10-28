import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import { campaignTitle, requestCategoryLabel } from "@/lib/campaign-requests";
import { DetailFact as Fact } from "@/components/campaigns/DetailFact";
import type { CampaignIntakeRequest } from "@/lib/types";
import { withdrawCampaignIntake } from "../../actions";

export const metadata = { title: "Campaign request" };

/** What a brand can expect after submitting — shown on the thank-you banner
 *  and kept in step with the next-step checklist on Campaigns live. */
const NEXT_STEPS = [
  "Our team reviews your request — we'll be in touch within 3 days.",
  "We put together a package and send you an order form to approve.",
  "Your invoice follows; the campaign goes live once it's paid.",
  "We match you with an artist, who sets up the discount codes, and we publish the campaign survey.",
];

/**
 * A brand's own campaign request, read-only, at any status (13 Oct client
 * notes: "should be able to view campaign request after submission"). Also
 * the landing page after submitting (?submitted=1 → thank-you message) and
 * after editing (?updated=1). Editing and withdrawing stay limited to
 * 'submitted' — RLS enforces the same rule.
 */
export default async function CampaignRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; updated?: string }>;
}) {
  const [{ id }, { submitted, updated }] = await Promise.all([params, searchParams]);
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id").eq("profile_id", profile.id).maybeSingle();
  const { data } = brand
    ? await supabase
        .from("campaign_intake_requests")
        .select("*")
        .eq("id", id)
        .eq("brand_id", brand.id)
        .maybeSingle()
    : { data: null };
  if (!data) notFound();
  const r = data as CampaignIntakeRequest;

  const { data: campaign } = r.converted_campaign_id
    ? await supabase
        .from("campaigns")
        .select("id, reference")
        .eq("id", r.converted_campaign_id)
        .maybeSingle<{ id: string; reference: string }>()
    : { data: null };

  const title = campaignTitle(r, `Request ${r.reference}`);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/campaigns" className="btn btn-ghost text-sm">
        ← Back to Campaign requests
      </Link>

      {submitted && (
        <section className="card bg-[var(--color-sage)]/60 p-6">
          <p className="text-3xl" aria-hidden>
            🎉
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
            Thank you — your campaign request is in
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]/80">
            We&apos;ve received request <strong>{r.reference}</strong>. Here&apos;s what happens next:
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--color-ink)]">
            {NEXT_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-[var(--color-ink)]/80">
            You can come back to this request any time from <strong>Campaign requests</strong>, and edit it
            until our team starts reviewing it.
          </p>
        </section>
      )}

      {updated && (
        <p className="rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm font-semibold">✓ Changes saved.</p>
      )}

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">{title}</h1>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Ref {r.reference} · Submitted {formatDate(r.created_at)}
            </p>
          </div>
          {r.status === "submitted" && (
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/campaigns/${r.id}`} className="btn btn-ghost text-sm">
                Edit
              </Link>
              <form action={withdrawCampaignIntake}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="btn btn-ghost text-sm text-[var(--color-accent)]">
                  Withdraw
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
          {r.status === "submitted" &&
            "Received — our team will review it within 3 days. You can still edit or withdraw it until they start."}
          {r.status === "in_review" && (
            <>
              Our team is reviewing this request, so it can no longer be edited. Need to change something?{" "}
              <Link href="/dashboard/messages?tab=support" className="font-semibold underline">
                Message the team
              </Link>
              .
            </>
          )}
          {r.status === "converted" &&
            (campaign ? (
              <>
                This request is now live campaign <strong>{campaign.reference}</strong>.{" "}
                <Link
                  href={`/dashboard/campaigns/live/${campaign.id}`}
                  className="font-semibold text-[var(--color-brand-dark)] underline"
                >
                  View the campaign →
                </Link>
              </>
            ) : (
              "This request has been converted to a live campaign — you'll find it under Campaigns live."
            ))}
          {r.status === "declined" && (
            <>
              <span className="font-semibold">Not taken forward.</span>
              {r.decline_reason ? ` ${r.decline_reason}` : ""}
            </>
          )}
        </div>

        {r.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt="" className="mt-5 max-h-64 w-full rounded-xl object-cover" />
        )}

        <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Fact label="Campaign description" value={r.description} />
          </div>
          <Fact
            label="Budget guidance"
            value={r.budget_expectation_gbp ? `£${Number(r.budget_expectation_gbp).toLocaleString("en-GB")}` : null}
          />
          <Fact label="Categories" value={requestCategoryLabel(r)} />
          <Fact label="Preferred location" value={r.preferred_location} />
          <Fact label="Preferred timeline" value={r.preferred_timeline} />
          <Fact label="Artist / event in mind" value={r.target_name} />
          <Fact label="Reward rules" value={r.reward_rules} />
          <Fact label="Expected outcomes" value={r.expected_outcomes} />
          <Fact label="Anything else" value={r.additional_info} />
          <Fact
            label="Event you suggested"
            value={
              r.suggested_event_note || r.suggested_event_url ? (
                <>
                  {r.suggested_event_note}
                  {r.suggested_event_url && (
                    <>
                      {r.suggested_event_note ? " " : ""}
                      <a href={r.suggested_event_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {r.suggested_event_url}
                      </a>
                    </>
                  )}
                </>
              ) : null
            }
          />
          <Fact label="Campaign manager" value={`${r.manager_name} · ${r.manager_email} · ${r.manager_phone}`} />
        </dl>
      </section>
    </div>
  );
}
