import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Participation, SponsoredEvent } from "@/lib/types";
import {
  uploadTicketProof,
  provideConsent,
  withdrawParticipation,
} from "./actions";

export const metadata = { title: "My events" };

type Row = Participation & { sponsored_events: SponsoredEvent | null };

export default async function ParticipationsPage() {
  const { profile } = await requireRole(["audience"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("participations")
    .select("*, sponsored_events(*)")
    .eq("audience_profile_id", profile.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <PageHeader
        title="My events"
        subtitle="Track the events you've registered for and complete each step to claim your reward."
        action={
          <Link href="/dashboard/discover" className="btn btn-primary">
            Find events
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🎟️"
          title="You haven't registered for any events"
          body="Discover events with sponsor-funded rewards and register to attend."
          cta={{ href: "/dashboard/discover", label: "Discover events" }}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((p) => {
            const ev = p.sponsored_events;
            return (
              <div key={p.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{ev?.name ?? "Event"}</h3>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {[
                        ev?.event_date &&
                          new Date(ev.event_date).toLocaleDateString("en-GB"),
                        ev?.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <form action={withdrawParticipation}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="btn btn-ghost text-sm text-[var(--color-accent)]"
                    >
                      Withdraw
                    </button>
                  </form>
                </div>

                {ev?.reward_rules && (
                  <div className="mt-3 rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--color-brand-dark)]">
                      Reward:
                    </span>{" "}
                    {ev.reward_rules}
                  </div>
                )}

                {/* Step 1 — proof of purchase */}
                {p.status === "registered" && (
                  <form
                    action={uploadTicketProof}
                    className="mt-4 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <div className="flex-1">
                      <label className="field-label" htmlFor={`proof-${p.id}`}>
                        Step 1 — add your ticket link / reference
                      </label>
                      <input
                        id={`proof-${p.id}`}
                        name="ticket_proof_url"
                        className="input"
                        placeholder="Paste your ticket confirmation link"
                        required
                      />
                    </div>
                    <button type="submit" className="btn btn-primary">
                      Submit proof
                    </button>
                  </form>
                )}

                {p.status === "ticket_uploaded" && (
                  <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
                    ✅ Proof submitted. Your attendance will be verified at the
                    venue.
                  </p>
                )}

                {p.status === "attendance_verified" && (
                  <p className="mt-4 text-sm text-[var(--color-purple-deep)]">
                    🎉 Attendance verified — your reward is being processed.
                  </p>
                )}

                {p.status === "reward_released" && (
                  <p className="mt-4 text-sm text-[var(--color-olive-deep)]">
                    💸 Reward released
                    {p.reward_amount_gbp != null
                      ? `: £${Number(p.reward_amount_gbp).toLocaleString("en-GB")}`
                      : ""}
                    .
                  </p>
                )}

                {/* Consent / payout details */}
                {p.selected && (
                  <form
                    action={provideConsent}
                    className="mt-4 grid gap-2 rounded-xl border border-black/5 p-4 text-sm"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <p className="font-semibold">You&apos;ve been selected 🎯</p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="bank_details_provided"
                        defaultChecked={p.bank_details_provided}
                        className="h-4 w-4"
                      />
                      I consent to share my payout details to receive the reward
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="newsletter_opt_in"
                        defaultChecked={p.newsletter_opt_in}
                        className="h-4 w-4"
                      />
                      Sign me up for the sponsor&apos;s newsletter &amp;
                      promotions
                    </label>
                    <div>
                      <button type="submit" className="btn btn-ghost text-sm">
                        Save preferences
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
