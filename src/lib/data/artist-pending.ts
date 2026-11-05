import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Waiting on artists" (admin) — what each artist still owes on their open
 * sponsorships, so an admin can see at a glance why an event isn't moving and
 * who to chase. Read by the admin tab (/dashboard/admin/artist-pending) and the
 * overview's "Needs attention" tile, so the two can't disagree.
 *
 * Three things an artist can owe (each maps to its own screen):
 *  - agreement   — hasn't agreed to the sponsorship yet;
 *  - fulfilment  — the form was sent ("ready") and they haven't given consent;
 *  - codes       — the discount codes aren't confirmed. Until they are, nothing
 *                  issues (auto_issue_reward_code(), 0075) and the admin's
 *                  "Issue codes to everyone eligible" refuses too.
 *
 * Things that are the TEAM's to do — no code tiers set up, fulfilment form not
 * sent — are listed separately as `waitingOnUs`, never blamed on the artist.
 *
 * Runs with the caller's (admin's) session; RLS gives admins every row. Any
 * query that fails (a table or column an older database lacks) degrades to
 * "nothing found" rather than breaking the admin overview.
 */

/** A second reminder for the same event + item inside this window is refused (0110). */
export const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type ArtistPendingKind = "agreement" | "fulfilment" | "codes";

export interface ArtistPendingItem {
  kind: ArtistPendingKind;
  label: string;
  /** Short explanation shown under the label. */
  detail: string | null;
  /** When the artist was asked / the deadline, ISO. */
  since: string | null;
  dueAt: string | null;
  overdue: boolean;
  /** Anchor on the admin event page where this is handled. */
  anchor: string;
}

export interface ArtistPendingRow {
  eventId: string;
  reference: string;
  name: string;
  status: string;
  eventDate: string | null;
  artistId: string;
  artistName: string;
  items: ArtistPendingItem[];
  /** Blockers on our side, shown muted (never counted against the artist). */
  waitingOnUs: string[];
  /** Checked in / answered but no live code (only counted while codes are unconfirmed). */
  peopleWaiting: number;
  /** Registered, not yet through to a code. */
  peopleRegistered: number;
  severity: number;
}

export interface ArtistPendingSummary {
  rows: ArtistPendingRow[];
  /** Events where an ARTIST owes something. */
  artistEvents: number;
  overdueEvents: number;
  peopleWaiting: number;
  /** Events blocked only on the team. */
  teamOnlyEvents: number;
}

const EMPTY: ArtistPendingSummary = { rows: [], artistEvents: 0, overdueEvents: 0, peopleWaiting: 0, teamOnlyEvents: 0 };

type EventRow = {
  id: string;
  reference: string;
  name: string;
  status: string;
  brand_agreed: boolean;
  artist_agreed: boolean;
  event_date: string | null;
  artist_profile_id: string;
  reward_codes_confirmed_at: string | null;
  codes_due_at: string | null;
};

export async function loadArtistPending(supabase: SupabaseClient): Promise<ArtistPendingSummary> {
  const { data: eventData, error } = await supabase
    .from("sponsored_events")
    .select(
      "id, reference, name, status, brand_agreed, artist_agreed, event_date, artist_profile_id, reward_codes_confirmed_at, codes_due_at",
    )
    .not("artist_profile_id", "is", null)
    .in("status", ["in_progress", "confirmed"]);
  if (error || !eventData?.length) return EMPTY;
  const events = eventData as EventRow[];
  const eventIds = events.map((e) => e.id);
  const artistIds = [...new Set(events.map((e) => e.artist_profile_id))];

  const [fulfilmentRes, tierRes, partRes, codeRes, artistRes, profileRes] = await Promise.all([
    supabase
      .from("sponsored_event_fulfilment")
      .select("sponsored_event_id, ready_at, artist_ack_at")
      .in("sponsored_event_id", eventIds),
    supabase.from("sponsored_event_reward_tiers").select("sponsored_event_id").in("sponsored_event_id", eventIds),
    supabase
      .from("participations")
      .select("id, sponsored_event_id, status")
      .in("sponsored_event_id", eventIds)
      .neq("status", "rejected"),
    supabase
      .from("reward_codes")
      .select("participation_id")
      .in("sponsored_event_id", eventIds)
      .neq("status", "void"),
    supabase.from("artists").select("profile_id, artist_name").in("profile_id", artistIds),
    supabase.from("profiles").select("id, full_name").in("id", artistIds),
  ]);

  const fulfilment = new Map(
    ((fulfilmentRes.data ?? []) as { sponsored_event_id: string; ready_at: string | null; artist_ack_at: string | null }[]).map(
      (f) => [f.sponsored_event_id, f],
    ),
  );
  const tiers = new Map<string, number>();
  for (const t of (tierRes.data ?? []) as { sponsored_event_id: string }[]) {
    tiers.set(t.sponsored_event_id, (tiers.get(t.sponsored_event_id) ?? 0) + 1);
  }
  const coded = new Set(((codeRes.data ?? []) as { participation_id: string | null }[]).map((c) => c.participation_id));
  const people = new Map<string, { waiting: number; registered: number }>();
  for (const p of (partRes.data ?? []) as { id: string; sponsored_event_id: string; status: string }[]) {
    if (coded.has(p.id)) continue;
    const cur = people.get(p.sponsored_event_id) ?? { waiting: 0, registered: 0 };
    if (p.status === "attendance_verified" || p.status === "reward_released") cur.waiting++;
    else if (p.status === "registered" || p.status === "ticket_uploaded") cur.registered++;
    people.set(p.sponsored_event_id, cur);
  }
  const artistNames = new Map<string, string>();
  for (const p of (profileRes.data ?? []) as { id: string; full_name: string | null }[]) {
    if (p.full_name) artistNames.set(p.id, p.full_name);
  }
  // The artist's public name wins over the account holder's.
  for (const a of (artistRes.data ?? []) as { profile_id: string; artist_name: string | null }[]) {
    if (a.artist_name) artistNames.set(a.profile_id, a.artist_name);
  }

  const now = Date.now();
  const rows: ArtistPendingRow[] = [];

  for (const e of events) {
    const items: ArtistPendingItem[] = [];
    const waitingOnUs: string[] = [];
    const f = fulfilment.get(e.id);
    const tierCount = tiers.get(e.id) ?? 0;
    const counts = people.get(e.id) ?? { waiting: 0, registered: 0 };

    if (e.status === "in_progress" && !e.artist_agreed) {
      items.push({
        kind: "agreement",
        label: "Hasn't agreed to the sponsorship",
        detail: e.brand_agreed ? "The brand has already agreed." : "The brand hasn't agreed yet either.",
        since: null,
        dueAt: null,
        overdue: false,
        anchor: "",
      });
    }

    if (f?.ready_at && !f.artist_ack_at) {
      items.push({
        kind: "fulfilment",
        label: "Hasn't consented to the fulfilment form",
        detail: "The form was sent to them; their consent is the final step.",
        since: f.ready_at,
        dueAt: null,
        overdue: false,
        anchor: "#fulfilment",
      });
    } else if (!f?.ready_at && e.status === "in_progress") {
      waitingOnUs.push("Fulfilment form not sent to the artist yet");
    }

    if (!e.reward_codes_confirmed_at) {
      if (tierCount === 0) {
        waitingOnUs.push("No discount-code tiers set up yet, so there is nothing for the artist to confirm");
      } else {
        const due = e.codes_due_at ? new Date(e.codes_due_at).getTime() : null;
        const overdue = due !== null && due < now;
        const detailParts: string[] = [];
        if (counts.waiting > 0) {
          detailParts.push(
            `${counts.waiting} ${counts.waiting === 1 ? "person is" : "people are"} checked in with no code, and nothing issues until this is confirmed.`,
          );
        } else {
          detailParts.push("No codes are issued until the artist confirms them.");
        }
        items.push({
          kind: "codes",
          label: "Hasn't confirmed the reward codes",
          detail: detailParts.join(" "),
          since: null,
          dueAt: e.codes_due_at,
          overdue,
          anchor: "#discount-codes",
        });
      }
    }

    if (items.length === 0 && waitingOnUs.length === 0) continue;

    const codesItem = items.some((i) => i.kind === "codes");
    const overdue = items.some((i) => i.overdue);
    rows.push({
      eventId: e.id,
      reference: e.reference,
      name: e.name,
      status: e.status,
      eventDate: e.event_date,
      artistId: e.artist_profile_id,
      artistName: artistNames.get(e.artist_profile_id) ?? "Artist",
      items,
      waitingOnUs,
      peopleWaiting: codesItem ? counts.waiting : 0,
      peopleRegistered: codesItem ? counts.registered : 0,
      severity: (overdue ? 1000 : 0) + (codesItem ? counts.waiting * 10 : 0) + items.length,
    });
  }

  rows.sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name));

  const artistRows = rows.filter((r) => r.items.length > 0);
  return {
    rows,
    artistEvents: artistRows.length,
    overdueEvents: artistRows.filter((r) => r.items.some((i) => i.overdue)).length,
    peopleWaiting: artistRows.reduce((t, r) => t + r.peopleWaiting, 0),
    teamOnlyEvents: rows.length - artistRows.length,
  };
}
