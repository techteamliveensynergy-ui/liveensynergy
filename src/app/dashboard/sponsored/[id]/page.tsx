import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { Field } from "@/components/ui/Field";
import type {
  EventListing,
  Participation,
  SponsoredEvent,
  SponsoredEventAsset,
} from "@/lib/types";
import {
  toggleAgreement,
  updateSponsoredEvent,
  markCompleted,
  contactSupport,
  updateParticipation,
} from "../actions";

export const metadata = { title: "Sponsored event" };

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`, not a full ISO string. */
function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default async function SponsoredEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["brand", "artist", "event"]);
  const supabase = await createClient();

  const { data: ev } = await supabase
    .from("sponsored_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!ev) notFound();
  const event = ev as SponsoredEvent;

  const [{ data: brand }, { data: listingRow }, { data: assetRows }, { data: parts }] =
    await Promise.all([
      supabase.from("brands").select("id").eq("profile_id", profile.id).maybeSingle(),
      event.listing_id
        ? supabase
            .from("event_listings")
            .select("*")
            .eq("id", event.listing_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("sponsored_event_assets")
        .select("*")
        .eq("sponsored_event_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("participations")
        .select("*")
        .eq("sponsored_event_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const listing = listingRow as EventListing | null;
  const assets = (assetRows ?? []) as SponsoredEventAsset[];
  const participations = (parts ?? []) as Participation[];

  const isBrand = !!brand && brand.id === event.brand_id;
  const isArtist = event.artist_profile_id === profile.id;
  const myAgreed = isBrand ? event.brand_agreed : event.artist_agreed;
  const locked = event.status !== "in_progress";

  // How far the remaining budget stretches, at the linked event's ticket price.
  const ticketPrice = listing?.ticket_price_gbp ?? null;
  const remaining = event.remaining_budget_gbp;
  const sponsorableCount =
    ticketPrice != null && ticketPrice > 0 && remaining != null
      ? Math.floor(Number(remaining) / Number(ticketPrice))
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/sponsored"
        className="inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to sponsored events
      </Link>

      <PageHeader
        title={event.name}
        subtitle={
          event.artist_display_name
            ? `Sponsorship ref ${event.reference} · with ${event.artist_display_name}`
            : `Sponsorship ref ${event.reference}`
        }
        action={<StatusBadge status={event.status} />}
      />

      {event.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.banner_url}
          alt=""
          className="h-48 w-full rounded-2xl object-cover"
        />
      )}

      {/* Sponsorship management */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Sponsorship management</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Budget"
            value={
              event.budget_gbp != null
                ? `£${Number(event.budget_gbp).toLocaleString("en-GB")}`
                : "—"
            }
          />
          <Stat
            label="Remaining budget"
            value={
              remaining != null
                ? `£${Number(remaining).toLocaleString("en-GB")}`
                : "—"
            }
          />
          <Stat
            label="People this can sponsor"
            value={
              sponsorableCount != null
                ? sponsorableCount.toLocaleString("en-GB")
                : "—"
            }
            hint={
              ticketPrice != null && ticketPrice > 0
                ? `at £${Number(ticketPrice).toLocaleString("en-GB")} a ticket`
                : "add a ticket price on the listing"
            }
          />
          <Stat
            label="Participation deadline"
            value={
              event.participation_deadline
                ? new Date(event.participation_deadline).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"
            }
          />
        </div>
      </div>

      {/* Full event details — previously you had to leave the page for these. */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Event details</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Event name" value={event.name} />
          <Detail
            label="Artist / act"
            value={event.artist_display_name ?? listing?.name ?? null}
          />
          <Detail
            label="Date"
            value={
              event.event_date
                ? new Date(event.event_date).toLocaleDateString("en-GB", {
                    dateStyle: "full",
                  })
                : null
            }
          />
          <Detail label="Venue" value={event.venue_details ?? listing?.venue_name ?? null} />
          <Detail
            label="Location"
            value={
              event.location ??
              [listing?.city, listing?.country].filter(Boolean).join(", ") ??
              null
            }
          />
          <Detail label="Category" value={listing?.category ?? null} />
          <Detail
            label="Capacity"
            value={listing?.capacity != null ? String(listing.capacity) : null}
          />
          <Detail
            label="Ticket price"
            value={
              listing?.ticket_price_gbp != null
                ? `£${Number(listing.ticket_price_gbp).toLocaleString("en-GB")}`
                : null
            }
          />
          {listing && (
            <Detail label="Source listing ref" value={listing.reference} />
          )}
        </dl>

        {listing?.ticket_buy_url && (
          <a
            href={listing.ticket_buy_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-semibold text-[var(--color-brand-dark)]"
          >
            Ticket page ↗
          </a>
        )}

        {listing?.sponsor_benefits && (
          <div className="mt-4">
            <p className="field-label">Benefit to sponsors</p>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-ink-soft)]">
              {listing.sponsor_benefits}
            </p>
          </div>
        )}
      </div>

      {/* Branding */}
      {(event.branding_guidelines || assets.length > 0) && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Branding</h2>
          {event.branding_guidelines && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-ink-soft)]">
              {event.branding_guidelines}
            </p>
          )}
          {assets.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {assets.map((a) => (
                <figure key={a.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.description ?? ""}
                    className="h-24 w-full rounded-lg object-cover"
                  />
                  {a.description && (
                    <figcaption className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      {a.description}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Terms & agreement */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Terms &amp; confirmation</h2>

        {locked ? (
          <>
            <p className="mt-2 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
              These terms are locked — both parties have agreed them. To change
              anything, contact the Live·En·Synergy team.
            </p>
            <dl className="mt-4 grid gap-4">
              <Detail label="Reward rules" value={event.reward_rules} block />
              <Detail label="Sponsorship terms" value={event.terms} block />
              <Detail
                label="How attendance is confirmed"
                value={event.attendance_method}
                block
              />
            </dl>
          </>
        ) : (
          <form action={updateSponsoredEvent} className="mt-4 grid gap-4">
            <input type="hidden" name="id" value={event.id} />
            <Field label="Reward rules" htmlFor="reward_rules">
              <textarea
                id="reward_rules"
                name="reward_rules"
                className="textarea"
                defaultValue={event.reward_rules ?? ""}
              />
            </Field>
            <Field label="Sponsorship terms" htmlFor="terms">
              <textarea
                id="terms"
                name="terms"
                className="textarea"
                defaultValue={event.terms ?? ""}
              />
            </Field>
            <Field label="Branding guidelines" htmlFor="branding_guidelines">
              <textarea
                id="branding_guidelines"
                name="branding_guidelines"
                className="textarea"
                defaultValue={event.branding_guidelines ?? ""}
              />
            </Field>
            <Field
              label="How will the audience confirm physical attendance?"
              htmlFor="attendance_method"
            >
              <textarea
                id="attendance_method"
                name="attendance_method"
                className="textarea"
                placeholder="Artist will provide confirmation after ticket scan at the box office, or display a QR code at the venue."
                defaultValue={event.attendance_method ?? ""}
              />
            </Field>
            <Field label="Participation deadline" htmlFor="participation_deadline">
              <input
                id="participation_deadline"
                name="participation_deadline"
                type="datetime-local"
                className="input"
                defaultValue={toLocalInputValue(event.participation_deadline)}
              />
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn btn-ghost">
                Save terms
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <AgreeCard label="Brand agreed" agreed={event.brand_agreed} />
          <AgreeCard label="Artist agreed" agreed={event.artist_agreed} />
        </div>

        {(isBrand || isArtist) && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!locked && (
              <form action={toggleAgreement}>
                <input type="hidden" name="id" value={event.id} />
                <button
                  type="submit"
                  className={`btn ${myAgreed ? "btn-ghost" : "btn-primary"}`}
                >
                  {myAgreed ? "Withdraw my agreement" : "I agree to these terms"}
                </button>
              </form>
            )}
            <form action={contactSupport}>
              <input type="hidden" name="id" value={event.id} />
              <input type="hidden" name="event_name" value={event.name} />
              <button type="submit" className="btn btn-ghost">
                Contact Live·En·Synergy
              </button>
            </form>
            {event.status === "confirmed" && (
              <form action={markCompleted}>
                <input type="hidden" name="id" value={event.id} />
                <button type="submit" className="btn btn-ghost">
                  Mark completed
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Participants */}
      {(isBrand || isArtist) && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold">
            Participants ({participations.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Run selection, verify attendance and release rewards. Personal
            details are shared only after a participant is selected and consents.
          </p>

          {participations.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
              No registrations yet.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {participations.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      Participant #{p.id.slice(0, 8)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      {p.selected && (
                        <span className="text-xs text-[var(--color-olive-deep)]">selected</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!p.selected && p.status !== "rejected" && (
                      <ParticipationBtn
                        eventId={event.id}
                        id={p.id}
                        op="select"
                        label="Select"
                      />
                    )}
                    {/* Only before verification — otherwise a released reward
                        could be regressed back to "attendance verified". */}
                    {p.selected &&
                      (p.status === "registered" ||
                        p.status === "ticket_uploaded") && (
                        <ParticipationBtn
                          eventId={event.id}
                          id={p.id}
                          op="verify"
                          label="Verify attendance"
                        />
                      )}
                    {p.status === "attendance_verified" && (
                      <ReleaseRewardForm eventId={event.id} id={p.id} />
                    )}
                    {p.status !== "rejected" && !p.selected && (
                      <ParticipationBtn
                        eventId={event.id}
                        id={p.id}
                        op="reject"
                        label="Reject"
                        danger
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
      <p className="text-xs text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      {hint && (
        <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{hint}</p>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  block,
}: {
  label: string;
  value: string | null | undefined;
  block?: boolean;
}) {
  return (
    <div className={block ? "" : undefined}>
      <dt className="field-label">{label}</dt>
      <dd
        className={`text-sm ${
          value
            ? "whitespace-pre-wrap text-[var(--color-ink)]"
            : "text-[var(--color-ink-soft)]"
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function AgreeCard({ label, agreed }: { label: string; agreed: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${agreed ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-mint)] text-[var(--color-ink-soft)]"}`}
    >
      <span className="font-medium">{label}</span>
      <span>{agreed ? "✓ Agreed" : "Pending"}</span>
    </div>
  );
}

/**
 * Releasing a reward needs an amount — without it the participant's reward
 * shows as "—" and the audience's running total stays at £0.
 */
function ReleaseRewardForm({ eventId, id }: { eventId: string; id: string }) {
  return (
    <form action={updateParticipation} className="flex items-center gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="release" />
      <label className="sr-only" htmlFor={`reward-${id}`}>
        Reward amount in GBP
      </label>
      <div className="flex items-center gap-1">
        <span className="text-sm text-[var(--color-ink-soft)]">£</span>
        <input
          id={`reward-${id}`}
          name="reward_amount_gbp"
          type="number"
          min={0}
          step="0.01"
          required
          placeholder="0.00"
          className="input w-24 px-2 py-1 text-sm"
        />
      </div>
      <button type="submit" className="btn btn-ghost text-sm">
        Release reward
      </button>
    </form>
  );
}

function ParticipationBtn({
  eventId,
  id,
  op,
  label,
  danger,
}: {
  eventId: string;
  id: string;
  op: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={updateParticipation}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button
        type="submit"
        className={`btn btn-ghost text-sm ${danger ? "text-[var(--color-accent)]" : ""}`}
      >
        {label}
      </button>
    </form>
  );
}
