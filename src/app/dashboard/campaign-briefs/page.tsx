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
        subtitle="What each sponsor's campaign at your event involves: the objective, participant rewards and how to promote it."
      />
      {briefs.length === 0 ? (
        <EmptyState
          title="No campaign briefs yet"
          body="When a brand approves a campaign linked to one of your events, its brief appears here."
        />
      ) : (
        <div className="space-y-12">
          {briefs.map((b) => (
            <article key={b.id}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">
                  {b.brand_name} · {b.campaign_name ?? b.campaign_reference}
                </h2>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {b.reference} · approved {formatDate(b.approved_at)}
                </p>
              </div>
              <OrderFormDocument
                form={{ ...b, media_image_urls: [] }}
                sections={ARTIST_SECTIONS}
                campaignReference={b.campaign_reference}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
