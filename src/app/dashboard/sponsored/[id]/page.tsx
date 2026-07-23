import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { Field } from "@/components/ui/Field";
import type { Participation, SponsoredEvent } from "@/lib/types";
import {
  toggleAgreement,
  updateSponsoredEvent,
  markCompleted,
  updateParticipation,
} from "../actions";

export const metadata = { title: "Sponsored event" };

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

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const isBrand = !!brand && brand.id === event.brand_id;
  const isArtist = event.artist_profile_id === profile.id;

  const myAgreed = isBrand ? event.brand_agreed : event.artist_agreed;

  const { data: parts } = await supabase
    .from("participations")
    .select("*")
    .eq("sponsored_event_id", id)
    .order("created_at", { ascending: true });
  const participations = (parts ?? []) as Participation[];

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
        subtitle={`Ref ${event.reference}`}
        action={<StatusBadge status={event.status} />}
      />

      {/* Sponsorship management */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Sponsorship management</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
              event.remaining_budget_gbp != null
                ? `£${Number(event.remaining_budget_gbp).toLocaleString("en-GB")}`
                : "—"
            }
          />
          <Stat
            label="Participation deadline"
            value={
              event.participation_deadline
                ? new Date(event.participation_deadline).toLocaleDateString(
                    "en-GB",
                  )
                : "—"
            }
          />
        </div>
      </div>

      {/* Terms & agreement */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Terms &amp; confirmation</h2>
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
          <Field label="Participation deadline" htmlFor="participation_deadline">
            <input
              id="participation_deadline"
              name="participation_deadline"
              type="date"
              className="input"
              defaultValue={event.participation_deadline ?? ""}
            />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className="btn btn-ghost">
              Save terms
            </button>
          </div>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <AgreeCard label="Brand agreed" agreed={event.brand_agreed} />
          <AgreeCard label="Artist agreed" agreed={event.artist_agreed} />
        </div>

        {(isBrand || isArtist) && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={toggleAgreement}>
              <input type="hidden" name="id" value={event.id} />
              <button
                type="submit"
                className={`btn ${myAgreed ? "btn-ghost" : "btn-primary"}`}
              >
                {myAgreed ? "Withdraw my agreement" : "I agree to these terms"}
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
                    {p.selected && p.status !== "attendance_verified" && (
                      <ParticipationBtn
                        eventId={event.id}
                        id={p.id}
                        op="verify"
                        label="Verify attendance"
                      />
                    )}
                    {p.status === "attendance_verified" && (
                      <ParticipationBtn
                        eventId={event.id}
                        id={p.id}
                        op="release"
                        label="Release reward"
                      />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
      <p className="text-xs text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
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
