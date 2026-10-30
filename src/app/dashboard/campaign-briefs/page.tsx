import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import { OrderFormDocument } from "@/components/order-forms/OrderFormDocument";
import { formatDate } from "@/lib/format";
import { ARTIST_SECTIONS, type CampaignOrderForm } from "@/lib/order-forms";

export const metadata = { title: "Campaign briefs" };

type Brief = Pick<
  CampaignOrderForm,
  | "id"
  | "reference"
  | "campaign_name"
  | "campaign_objective"
  | "campaign_timeline"
  | "artist_name"
  | "event_name"
  | "event_reference"
  | "event_date"
  | "event_venue"
  | "event_location"
  | "discount_reward"
  | "rewards_available"
  | "redemption_arrangements"
  | "social_media_details"
  | "approved_at"
> & { campaign_reference: string; brand_name: string };

/**
 * The artist's side of an approved Campaign Order Form: only the sections the
 * Admin Portal brief marks "ok for artist to see" — campaign information,
 * linked event, participant benefit and social media. Read through the
 * campaign_order_briefs view, which has no brand address, contact person or
 * commercial columns at all and only returns forms linked to this artist.
 */
export default async function CampaignBriefsPage() {
  await requireRole(["artist", "event"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_order_briefs")
    .select("*")
    .order("approved_at", { ascending: false });
  const briefs = (data ?? []) as Brief[];

  return (
    <div>
      <PageHeader
        title="Campaign briefs"
        subtitle="What each partner's campaign at your event involves: the objective, participant rewards and how to promote it."
      />
      {briefs.length === 0 ? (
        <EmptyState
          title="No campaign briefs yet"
          body="When a brand approves a campaign linked to one of your events, its brief appears here."
        />
      ) : (
        // A compact list, each brief opening in place (General Notes, 13 Oct:
        // every brief rendered as a full document, one after another). A lone
        // brief starts open.
        <div className="space-y-3">
          {briefs.map((b) => (
            <details key={b.id} open={briefs.length === 1} className="card group overflow-hidden p-0">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--color-mist)]">
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--color-ink)]">
                    {b.brand_name} · {b.campaign_name ?? b.campaign_reference}
                  </span>
                  <span className="block text-xs text-[var(--color-ink-soft)]">
                    {[
                      b.event_name,
                      b.event_date ? formatDate(b.event_date) : null,
                      `${b.reference} · approved ${formatDate(b.approved_at)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                  <span className="group-open:hidden">Read brief ▾</span>
                  <span className="hidden group-open:inline">Hide ▴</span>
                </span>
              </summary>
              <div className="border-t border-black/10 p-5">
                <OrderFormDocument
                  form={{ ...b, media_image_urls: [] }}
                  sections={ARTIST_SECTIONS}
                  campaignReference={b.campaign_reference}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
