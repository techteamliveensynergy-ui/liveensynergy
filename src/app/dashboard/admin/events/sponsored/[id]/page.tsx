import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/dashboard/ui";
import { computePlatformFee, netSponsorshipBudget } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Participation } from "@/lib/types";
import { setSponsoredStatus } from "../../../actions";
import { adminUpdateParticipation, adminMarkNoShow } from "../../../marketplace-actions";
import { formatEventDateTime } from "@/lib/event-time";
import { attendUrl } from "@/lib/attendance";
import { qrCodeDataUrl } from "@/lib/qr";
import { signedUrlFor } from "@/lib/storage";
import { EventEditForm } from "./EventEditForm";

export const metadata = { title: "Sponsored event · Admin" };

/**
 * Statuses run one way only — a confirmed deal can't be dropped back to "in
 * progress" (3 Aug standup), so the picker only offers the current status and
 * anything after it. `setSponsoredStatus` enforces the same rule server-side.
 */
const SPONSORED_STATUSES = ["in_progress", "confirmed", "completed"];

function statusesFrom(current: string) {
  const i = SPONSORED_STATUSES.indexOf(current);
  return i === -1 ? [] : SPONSORED_STATUSES.slice(i);
}

type Row = Participation & { profiles: { full_name: string | null; email: string | null } | null };

function Money({ value }: { value: number | null | undefined }) {
  return <>{value != null ? `£${Number(value).toLocaleString("en-GB")}` : "—"}</>;
}

export default async function AdminSponsoredDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("sponsored_events")
    .select(
      "*, brands(brand_name, profile_id), campaigns(reference, description), event_listings(name, ticket_price_gbp)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      reference: string;
      name: string;
      status: string;
      event_date: string | null;
      start_time: string | null;
      timezone: string;
      venue_details: string | null;
      location: string | null;
      budget_gbp: number | null;
      remaining_budget_gbp: number | null;
      reward_rules: string | null;
      terms: string | null;
      branding_guidelines: string | null;
      attendance_method: string | null;
      brand_agreed: boolean;
      artist_agreed: boolean;
      participation_deadline: string | null;
      artist_profile_id: string | null;
      attendance_qr_token: string;
      brands: { brand_name: string; profile_id: string } | null;
      campaigns: { reference: string; description: string } | null;
      event_listings: { name: string; ticket_price_gbp: number | null } | null;
    }>();
  if (!event) notFound();

  const [{ data: partRows }, { data: artist }] = await Promise.all([
    supabase
      .from("participations")
      .select("*, profiles(full_name, email)")
      .eq("sponsored_event_id", id)
      .order("created_at", { ascending: true }),
    event.artist_profile_id
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", event.artist_profile_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const participantsRaw = (partRows ?? []) as Row[];
  const participants = await Promise.all(
    participantsRaw.map(async (p) => ({
      ...p,
      ticketHref: p.ticket_proof_url
        ? ((await signedUrlFor(p.ticket_proof_url)) ??
          (/^https?:\/\//.test(p.ticket_proof_url) ? p.ticket_proof_url : null))
        : null,
    })),
  );

  const checkInUrl = attendUrl(event.attendance_qr_token);
  const checkInQr = await qrCodeDataUrl(checkInUrl);

  // Funnel
  const registered = participants.length;
  const proofed = participants.filter((p) =>
    ["ticket_uploaded", "attendance_verified", "reward_released"].includes(p.status),
  ).length;
  const verified = participants.filter((p) =>
    ["attendance_verified", "reward_released"].includes(p.status),
  ).length;
  const rewarded = participants.filter((p) => p.status === "reward_released").length;
  const released = participants.reduce(
    (sum, p) => sum + Number(p.reward_amount_gbp ?? 0),
    0,
  );

  const fee = event.budget_gbp != null ? computePlatformFee(Number(event.budget_gbp)) : null;
  const pct = (n: number) => (registered ? Math.round((n / registered) * 100) : 0);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/events"
        className="inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to events
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-serif text-[var(--color-ink-soft)]">
            {event.brands?.brand_name ?? "No brand"} ↔{" "}
            {artist?.full_name ?? "No artist"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            {event.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Ref {event.reference}
            {event.event_date ? ` · ${formatEventDateTime({ date: event.event_date, time: event.start_time, timeZone: event.timezone })}` : ""}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <StatusBadge status={event.status} />
      </div>

      {/* Money */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          {
            label: "Budget (gross)",
            value: <Money value={event.budget_gbp} />,
            tint: "bg-[#faf5ee]",
          },
          {
            label: "Available for rewards",
            value: (
              <Money
                value={
                  event.remaining_budget_gbp ??
                  netSponsorshipBudget(event.budget_gbp)
                }
              />
            ),
            tint: "bg-[var(--color-sage)]",
          },
          {
            label: "Released",
            value: `£${released.toLocaleString("en-GB")}`,
            tint: "bg-[var(--color-lavender)]",
          },
          {
            label: "Platform fee",
            value: fee ? `£${Math.round(fee.feeIncVat).toLocaleString("en-GB")}` : "—",
            tint: "bg-[#fbeadd]",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl border border-black/10 p-4 shadow-sm ${s.tint}`}
          >
            <p className="text-xs text-[var(--color-ink-soft)]">{s.label}</p>
            <p className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          Funnel
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Registered", n: registered, p: 100 },
            { label: "Proof uploaded", n: proofed, p: pct(proofed) },
            { label: "Verified", n: verified, p: pct(verified) },
            { label: "Rewarded", n: rewarded, p: pct(rewarded) },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--color-ink-soft)]">
                  {s.label}
                </span>
                <span className="font-display text-lg font-semibold text-[var(--color-ink)]">
                  {s.n}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)]"
                  style={{ width: `${s.p}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{s.p}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deal */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Deal
          </h2>
          {statusesFrom(event.status).length > 1 ? (
            <form action={setSponsoredStatus} className="flex items-center gap-2">
              <input type="hidden" name="id" value={event.id} />
              <select
                name="status"
                className="select w-auto py-1.5 text-sm"
                defaultValue={event.status}
              >
                {statusesFrom(event.status).map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-ghost text-sm">
                Move status on
              </button>
            </form>
          ) : (
            <p className="text-sm text-[var(--color-ink-soft)]">
              {event.status === "withdrawn"
                ? "Withdrawn — another event was chosen for this campaign."
                : "Completed — the status can't move on any further."}
            </p>
          )}
        </div>

        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Status only ever moves forward. To change the deal itself — deadline,
          budget, terms — use Edit event details below.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              event.brand_agreed
                ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
                : "bg-[var(--color-mint)] text-[var(--color-ink-soft)]"
            }`}
          >
            Brand agreed · {event.brand_agreed ? "✓" : "Pending"}
          </div>
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              event.artist_agreed
                ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
                : "bg-[var(--color-mint)] text-[var(--color-ink-soft)]"
            }`}
          >
            Artist agreed · {event.artist_agreed ? "✓" : "Pending"}
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {[
            ["Campaign", event.campaigns?.reference ?? "—"],
            ["Listing", event.event_listings?.name ?? "—"],
            ["Venue", event.venue_details ?? "—"],
            [
              "Participation deadline",
              event.participation_deadline
                ? formatDate(event.participation_deadline)
                : "—",
            ],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
              <dt className="text-xs text-[var(--color-ink-soft)]">{k}</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-ink)]">{v}</dd>
            </div>
          ))}
        </dl>

        {event.reward_rules && (
          <div className="mt-3 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
            <span className="font-semibold">Reward rules</span> — {event.reward_rules}
          </div>
        )}
      </div>

      {/* Admin override of the deal's details. The parties themselves can't
          touch a confirmed sponsorship, so this is the only route to moving a
          deadline that has passed or fixing a budget (3 Aug standup). */}
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          Edit event details
        </h2>
        {event.status === "completed" ? (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            This event is completed — its details are locked.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Admin-only. Neither the brand nor the artist can change a
              confirmed deal themselves, so edits made here are the record both
              sides see.
            </p>
            <EventEditForm
              parties={`${event.brands?.brand_name ?? "the brand"} and ${
                artist?.full_name ?? "the artist"
              }`}
              event={{
                id: event.id,
                name: event.name,
                event_date: event.event_date,
                start_time: event.start_time,
                venue_details: event.venue_details,
                location: event.location,
                budget_gbp: event.budget_gbp,
                participation_deadline: event.participation_deadline,
                terms: event.terms,
                reward_rules: event.reward_rules,
                branding_guidelines: event.branding_guidelines,
                attendance_method: event.attendance_method,
              }}
            />
          </>
        )}
      </div>

      {/* Attendance check-in */}
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          Attendance check-in
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Pass this QR code or link on to the artist (e.g. via Messages) so
          they can display it at the venue — attendees scan it to confirm
          their own attendance instead of needing manual verification.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={checkInQr}
            alt="Attendance check-in QR code"
            className="h-32 w-32 rounded-lg border border-black/10 bg-white p-2"
          />
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-ink-soft)]">Check-in link</p>
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

      {/* Participants */}
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          Participants ({participants.length})
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Admin can run the same selection, verification and reward steps as the
          organiser — use this to unblock a stalled event.
        </p>

        {participants.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
            No registrations yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--color-ink)]">
                      {p.profiles?.full_name ?? "Unnamed"}
                    </span>
                    <StatusBadge status={p.status} />
                    {p.selected && (
                      <span className="text-xs text-[var(--color-olive-deep)]">
                        selected
                      </span>
                    )}
                    {p.no_show && (
                      <span className="text-xs text-[var(--color-accent)]">
                        ⚠ no-show
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-[var(--color-ink-soft)]">
                    {p.profiles?.email ?? "—"}
                    {p.attendance_verified_at
                      ? ` · verified ${formatDateTime(p.attendance_verified_at)}`
                      : ""}
                    {p.reward_amount_gbp != null
                      ? ` · £${Number(p.reward_amount_gbp).toLocaleString("en-GB")}`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]/70">
                    {p.ticketHref ? (
                      <a
                        href={p.ticketHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-brand-dark)] underline"
                      >
                        Ticket proof ↗
                      </a>
                    ) : (
                      "No ticket proof"
                    )}
                    {p.bank_details_provided ? " · payout consented" : ""}
                    {p.newsletter_opt_in ? " · newsletter opt-in" : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!p.selected && p.status !== "rejected" && (
                    <AdminBtn eventId={event.id} id={p.id} op="select" label="Select" />
                  )}
                  {p.selected &&
                    (p.status === "registered" || p.status === "ticket_uploaded") && (
                      <AdminBtn
                        eventId={event.id}
                        id={p.id}
                        op="verify"
                        label="Verify"
                      />
                    )}
                  {p.selected &&
                    p.status !== "reward_released" &&
                    !p.no_show && (
                      <form action={adminMarkNoShow}>
                        <input type="hidden" name="event_id" value={event.id} />
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          className="btn btn-ghost text-sm text-[var(--color-accent)]"
                        >
                          Mark no-show
                        </button>
                      </form>
                    )}
                  {p.status === "attendance_verified" && (
                    <form
                      action={adminUpdateParticipation}
                      className="flex items-center gap-1.5"
                    >
                      <input type="hidden" name="event_id" value={event.id} />
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="op" value="release" />
                      <input
                        name="reward_amount_gbp"
                        type="number"
                        min={0}
                        step="0.01"
                        required
                        placeholder="£"
                        className="input w-20 px-2 py-1 text-sm"
                        aria-label="Reward amount"
                      />
                      <button type="submit" className="btn btn-ghost text-sm">
                        Release
                      </button>
                    </form>
                  )}
                  {!p.selected && p.status !== "rejected" && (
                    <AdminBtn
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
    </div>
  );
}

function AdminBtn({
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
    <form action={adminUpdateParticipation}>
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
