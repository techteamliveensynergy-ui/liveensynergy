import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { formatGbp } from "@/lib/billing";
import { displayUrl } from "@/lib/urls";
import {
  SURVEY_TYPE_LABELS,
  embedUrl,
  isDirectVideo,
  type CampaignOrderForm,
  type OrderFormSection,
} from "@/lib/order-forms";

/**
 * A Campaign Order Form laid out as presentation-sized "slides" (5 Oct: the
 * brand reviews substantial imagery and video before consenting, so it reads
 * like a deck, not a form). Shared by the brand review screen, the admin
 * preview, the printable PDF and — with the artist sections only — the artist
 * brief. Server-safe: no hooks.
 */

type Doc = Partial<CampaignOrderForm> & { reference?: string };

function Slide({
  eyebrow,
  title,
  children,
  tone = "light",
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tone?: "light" | "brand";
}) {
  return (
    <section
      className={`order-slide break-inside-avoid rounded-[2rem] p-8 shadow-sm sm:p-12 print:rounded-none print:shadow-none ${
        tone === "brand"
          ? "bg-[var(--color-ink)] text-white"
          : "border border-black/5 bg-white text-[var(--color-ink)]"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.2em] ${
          tone === "brand" ? "text-white/60" : "text-[var(--color-brand)]"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold sm:text-4xl">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!shown.length) return <p className="text-lg text-[var(--color-ink-soft)]">Not provided yet.</p>;
  return (
    <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm font-medium text-[var(--color-ink-soft)]">{label}</dt>
          <dd className="mt-1 whitespace-pre-line text-lg sm:text-xl">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LongText({ label, text }: { label: string; text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="mt-6">
      <p className="text-sm font-medium text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-1 whitespace-pre-line text-lg leading-relaxed sm:text-xl">{text}</p>
    </div>
  );
}

function Video({ url }: { url: string }) {
  const embed = embedUrl(url);
  if (embed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black print:hidden">
        <iframe
          src={embed}
          title="Campaign video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (isDirectVideo(url)) {
    return (
      <video src={url} controls className="aspect-video w-full rounded-2xl bg-black print:hidden" />
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-lg underline">
      Watch the video: {displayUrl(url)}
    </a>
  );
}

export function OrderFormDocument({
  form,
  sections,
  campaignReference,
  packageName,
}: {
  form: Doc;
  sections: OrderFormSection[];
  campaignReference?: string | null;
  packageName?: string | null;
}) {
  const has = (s: OrderFormSection) => sections.includes(s);
  const images = form.media_image_urls ?? [];

  return (
    <div className="space-y-8 print:space-y-6">
      {has("media") && (images.length > 0 || form.media_video_url) && (
        <Slide eyebrow="The campaign" title={form.campaign_name ?? "Campaign preview"}>
          <div className="space-y-6">
            {form.media_video_url && <Video url={form.media_video_url} />}
            {images.length > 0 && (
              <div className={`grid gap-4 ${images.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt={`Campaign image ${i + 1}`}
                    className={`w-full rounded-2xl object-cover ${
                      images.length === 1 ? "aspect-video" : "aspect-[4/3]"
                    } ${i === 0 && images.length % 2 === 1 && images.length > 1 ? "sm:col-span-2 sm:aspect-video" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        </Slide>
      )}

      {has("brand") && (
        <Slide eyebrow="Brand" title={form.brand_company_name ?? "Brand / company"}>
          <Facts
            items={[
              ["Brand / company name", form.brand_company_name],
              ["Address", form.brand_address],
              ["Contact person", form.contact_name],
              ["Email address", form.contact_email],
            ]}
          />
        </Slide>
      )}

      {has("campaign") && (
        <Slide eyebrow="Campaign information" title={form.campaign_name ?? "Campaign"}>
          <Facts
            items={[
              ["Campaign ID", campaignReference ?? null],
              ["Campaign name", form.campaign_name],
              ["Campaign timeline", form.campaign_timeline],
            ]}
          />
          <LongText label="Campaign objective" text={form.campaign_objective} />
        </Slide>
      )}

      {has("event") && (
        <Slide eyebrow="Linked event" title={form.event_name ?? "Event to be confirmed"}>
          <Facts
            items={[
              ["Artist / event partner", form.artist_name],
              ["Event name", form.event_name],
              ["Event ID", form.event_reference],
              ["Date", form.event_date ? formatDate(form.event_date) : null],
              ["Venue", form.event_venue],
              ["Location", form.event_location],
            ]}
          />
        </Slide>
      )}

      {has("research") && (
        <Slide eyebrow="Research" title="Survey & audience research">
          <Facts
            items={[
              ["Approx. number of participants", form.approx_participants?.toLocaleString("en-GB")],
              ["Type of survey", form.survey_type ? SURVEY_TYPE_LABELS[form.survey_type] : null],
              ["Number of survey questions", form.survey_question_count],
              [
                "Draft survey link",
                form.draft_survey_link ? (
                  <a href={form.draft_survey_link} target="_blank" rel="noopener noreferrer" className="underline">
                    {displayUrl(form.draft_survey_link)}
                  </a>
                ) : null,
              ],
            ]}
          />
          <LongText label="Potential research questions" text={form.research_questions} />
        </Slide>
      )}

      {has("benefit") && (
        <Slide eyebrow="Participant benefit" title="What participants receive">
          <Facts
            items={[
              ["Discount / reward", form.discount_reward],
              ["Number of available rewards", form.rewards_available?.toLocaleString("en-GB")],
            ]}
          />
          <LongText label="Redemption arrangements" text={form.redemption_arrangements} />
        </Slide>
      )}

      {has("social") && form.social_media_details && (
        <Slide eyebrow="Survey participation" title="Artist social media">
          <p className="whitespace-pre-line text-lg leading-relaxed sm:text-xl">{form.social_media_details}</p>
        </Slide>
      )}

      {has("other") && form.other_details && (
        <Slide eyebrow="Any other details" title="Notes">
          <p className="whitespace-pre-line text-lg leading-relaxed sm:text-xl">{form.other_details}</p>
        </Slide>
      )}

      {has("commercial") && (
        <Slide eyebrow="Commercial" title={packageName ? `${packageName} package` : "Campaign fee"} tone="brand">
          <dl className="grid gap-6 sm:grid-cols-4">
            {(
              [
                ["Package", packageName ?? "Custom"],
                ["Campaign fee", form.campaign_fee_gbp != null ? formatGbp(form.campaign_fee_gbp) : "—"],
                ["VAT", form.vat_gbp != null ? formatGbp(form.vat_gbp) : "—"],
                ["Total amount", form.total_gbp != null ? formatGbp(form.total_gbp) : "—"],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-white/60">{label}</dt>
                <dd className={`mt-1 font-semibold ${label === "Total amount" ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {form.payment_date && (
            <p className="mt-8 text-lg text-white/80">Payment date: {formatDate(form.payment_date)}</p>
          )}
        </Slide>
      )}
    </div>
  );
}
