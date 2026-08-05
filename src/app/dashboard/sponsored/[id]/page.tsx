import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { computePlatformFee, netSponsorshipBudget } from "@/lib/constants";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { Field } from "@/components/ui/Field";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import type {
  EventListing,
  Participation,
  SponsoredEvent,
  SponsoredEventAsset,
} from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";
import { attendUrl } from "@/lib/attendance";
import { qrCodeDataUrl } from "@/lib/qr";
import {
  toggleAgreement,
  updateSponsoredEvent,
  markCompleted,
  contactSupport,
  updateParticipation,
} from "../actions";

export const metadata = { title: "Sponsored event" };

type ParticipantRow = Participation & {
  profiles: { full_name: string | null } | null;
};

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return `£${Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: 2,
  })}`;
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; reason?: string }>;
}) {
  const { id } = await params;
  const { notice, reason } = await searchParams;
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
      // Names come through the "profiles: read my event participants" policy
      // added in 0021 — before it, this list could only show an id fragment.
      supabase
        .from("participations")
        .select("*, profiles(full_name)")
        .eq("sponsored_event_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const listing = listingRow as EventListing | null;
  const assets = (assetRows ?? []) as SponsoredEventAsset[];
  const participations = (parts ?? []) as ParticipantRow[];

  const isBrand = !!brand && brand.id === event.brand_id;
  const isArtist = event.artist_profile_id === profile.id;
  const myAgreed = isBrand ? event.brand_agreed : event.artist_agreed;
  const otherPartyAgreed = isBrand ? event.artist_agreed : event.brand_agreed;
  const locked = event.status !== "in_progress";

  // The platform fee comes off the gross budget before anything can be paid
  // out, so every figure below works from the net amount. `remaining` falls
  // back to the recomputed net for rows written before that fix.
  const fee =
    event.budget_gbp != null ? computePlatformFee(Number(event.budget_gbp)) : null;
  const netBudget = netSponsorshipBudget(event.budget_gbp);
  const remaining = event.remaining_budget_gbp ?? netBudget;

  // How far the remaining budget stretches, at the linked event's ticket price.
  const ticketPrice = listing?.ticket_price_gbp ?? null;
  const sponsorableCount =
    ticketPrice != null && ticketPrice > 0 && remaining != null
      ? Math.floor(Number(remaining) / Number(ticketPrice))
      : null;

  const checkInUrl = attendUrl(event.attendance_qr_token);
  const checkInQr = locked ? await qrCodeDataUrl(checkInUrl) : null;

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

      {/* An agreement that couldn't be honoured — the campaign was settled on
          another event, or this listing is already committed elsewhere. Says
          so plainly rather than appearing to do nothing (0022). */}
      {(notice === "conflict" || notice === "locked") && (
        <div className="rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          <p className="font-semibold">This couldn&apos;t be confirmed</p>
          <p className="mt-1">
            {reason ||
              "Another event has already been confirmed for this campaign."}
          </p>
        </div>
      )}
      {notice === "agree-failed" && (
        <div className="rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          Something went wrong recording your agreement. Please try again, or
          contact the Live·En·Synergy team.
        </div>
      )}

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
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label="Budget (gross)"
            value={money(event.budget_gbp)}
            hint="what the brand commits"
          />
          <Stat
            label="Service fee"
            value={fee ? money(fee.feeIncVat) : "—"}
            hint="inc. VAT"
          />
          <Stat
            label="Available for rewards"
            value={money(remaining)}
            hint={
              netBudget != null && remaining != null && remaining < netBudget
                ? `of ${money(netBudget)} after fees`
                : "after fees"
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
            label={event.start_time ? "Date & time" : "Date"}
            value={formatEventDateTime(
              {
                date: event.event_date,
                time: event.start_time,
                timeZone: event.timezone,
              },
              { weekday: true },
            )}
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
              {event.status === "withdrawn"
                ? "This proposal was withdrawn — the sponsor confirmed a different event for the same campaign."
                : "These terms are locked — both parties have agreed them. To change anything, contact the Live·En·Synergy team."}
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
                {myAgreed ? (
                  <button type="submit" className="btn btn-ghost">
                    Withdraw my agreement
                  </button>
                ) : (
                  // Agreeing when the other side already has confirms the
                  // sponsorship outright, and there's no undo — so it asks
                  // first (3 Aug standup).
                  <ConfirmSubmit
                    label="I agree to these terms"
                    pendingLabel="Agreeing…"
                    title={
                      otherPartyAgreed
                        ? "Confirm this sponsorship?"
                        : "Agree to these terms?"
                    }
                    body={
                      otherPartyAgreed ? (
                        <>
                          The other party has already agreed, so this confirms{" "}
                          <strong>{event.name}</strong> immediately.{" "}
                          <strong>This can&apos;t be undone</strong> — the terms
                          lock, and any other events suggested for this campaign
                          are withdrawn. Changing anything afterwards means
                          contacting the Live·En·Synergy team.
                        </>
                      ) : (
                        <>
                          You&apos;re agreeing to the terms for{" "}
                          <strong>{event.name}</strong> as they stand. The
                          sponsorship confirms as soon as the other party agrees
                          too, and confirmation can&apos;t be undone.
                        </>
                      )
                    }
                    confirmLabel={
                      otherPartyAgreed ? "Yes, confirm it" : "Yes, I agree"
                    }
                    danger={otherPartyAgreed}
                  />
                )}
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

      {/* Attendance check-in */}
      {(isBrand || isArtist) && checkInQr && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Attendance check-in</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Display this QR code at the venue — audience members who scan it
            (or follow the link) confirm their own attendance, no manual
            verification needed. Share the image or link with the artist,
            e.g. by pasting it into your conversation under Messages.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={checkInQr}
              alt="Attendance check-in QR code"
              className="h-32 w-32 rounded-lg border border-black/10 bg-white p-2"
            />
            <div className="min-w-0">
              <p className="field-label">Check-in link</p>
              <p className="break-all text-sm text-[var(--color-brand-dark)]">
                {checkInUrl}
              </p>
              <a
                href={checkInQr}
                download="attendance-qr.png"
                className="btn btn-ghost mt-3 text-sm"
              >
                Download QR image
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Participants */}
      {(isBrand || isArtist) && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold">
            Participants ({participations.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Run selection and verify attendance. Paying the reward out is
            handled by the Live·En·Synergy team once attendance is verified —
            get in touch if a payout needs chasing.
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
                      {p.profiles?.full_name ?? `Participant #${p.id.slice(0, 8)}`}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      {p.selected && (
                        <span className="text-xs text-[var(--color-olive-deep)]">selected</span>
                      )}
                      {p.status === "reward_released" &&
                        p.reward_amount_gbp != null && (
                          <span className="text-xs text-[var(--color-ink-soft)]">
                            {money(p.reward_amount_gbp)} paid
                          </span>
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
                      <span className="text-xs text-[var(--color-ink-soft)]">
                        Awaiting reward payout by the team
                      </span>
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
