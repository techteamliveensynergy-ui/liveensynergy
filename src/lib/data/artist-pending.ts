import type { SupabaseClient } from "@supabase/supabase-js";
import { eventOpenStates } from "@/lib/campaign-opening";

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
 * Things that are the TEAM's to do are listed separately as `waitingOnUs`, never
 * blamed on the artist: no code tiers, unique codes not generated yet (the artist
 * can't confirm codes that don't exist), the fulfilment form not sent, and — the
 * last manual step — an event whose artist has finished everything but which
 * nobody has opened for registration ("Open now"). Nothing else prompts an admin
 * for those, so the QA of 5 Nov only found them by trial and error.
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
  /** Blockers on our side (never counted against the artist). */
  waitingOnUs: { text: string; href: string | null; kind: "codes_setup" | "fulfilment" | "open" | "review" }[];
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
  /** Everything the artist owed is done; nobody has opened registration yet. */
  readyToOpen: number;
  /** Survey responses on these events waiting for an admin's decision. */
  responsesToReview: number;
}

const EMPTY: ArtistPendingSummary = {
  rows: [],
  artistEvents: 0,
  overdueEvents: 0,
  peopleWaiting: 0,
  teamOnlyEvents: 0,
  readyToOpen: 0,
  responsesToReview: 0,
};

type EventRow = {
  id: string;
  campaign_id: string | null;
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
      "id, campaign_id, reference, name, status, brand_agreed, artist_agreed, event_date, artist_profile_id, reward_codes_confirmed_at, codes_due_at",
    )
    .not("artist_profile_id", "is", null)
    .in("status", ["in_progress", "confirmed"]);
  if (error || !eventData?.length) return EMPTY;
  const events = eventData as EventRow[];
  const eventIds = events.map((e) => e.id);
  const artistIds = [...new Set(events.map((e) => e.artist_profile_id))];

  const [fulfilmentRes, tierRes, partRes, codeRes, artistRes, profileRes, openStates] = await Promise.all([
    supabase
      .from("sponsored_event_fulfilment")
      .select("sponsored_event_id, ready_at, artist_ack_at")
      .in("sponsored_event_id", eventIds),
    supabase
      .from("sponsored_event_reward_tiers")
      .select("id, sponsored_event_id, distribution_model, shared_code")
      .in("sponsored_event_id", eventIds),
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
    eventOpenStates(supabase, events.filter((e) => e.campaign_id).map((e) => e.id)),
  ]);

  // Responses held for review on these events' surveys: no code is issued until
  // an admin passes them, so they belong on the same "waiting on us" list
  // (QA 6 Nov: held responses sat with nothing pointing at them).
  const campaignIds = [...new Set(events.map((e) => e.campaign_id).filter((c): c is string => Boolean(c)))];
  const reviewByCampaign = new Map<string, string[]>();
  if (campaignIds.length) {
    const { data: tplRows } = await supabase.from("survey_templates").select("id, campaign_id").in("campaign_id", campaignIds);
    const campaignOf = new Map(((tplRows ?? []) as { id: string; campaign_id: string }[]).map((t) => [t.id, t.campaign_id]));
    if (campaignOf.size) {
      const { data: heldRows } = await supabase
        .from("survey_responses")
        .select("id, template_id")
        .eq("quality_status", "review")
        .in("template_id", [...campaignOf.keys()]);
      for (const r of (heldRows ?? []) as { id: string; template_id: string }[]) {
        const c = campaignOf.get(r.template_id);
        if (!c) continue;
        reviewByCampaign.set(c, [...(reviewByCampaign.get(c) ?? []), r.id]);
      }
    }
  }

  // Is every tier able to hand out a code? A unique-code tier needs its codes
  // generated (the pool); a shared tier needs its shared code.
  const tierRows = (tierRes.data ?? []) as {
    id: string;
    sponsored_event_id: string;
    distribution_model: string | null;
    shared_code: string | null;
  }[];
  const uniqueTierIds = tierRows.filter((t) => t.distribution_model !== "shared").map((t) => t.id);
  const { data: poolRows } = uniqueTierIds.length
    ? await supabase.from("reward_code_pool").select("tier_id").in("tier_id", uniqueTierIds)
    : { data: [] as { tier_id: string }[] };
  const pooled = new Set(((poolRows ?? []) as { tier_id: string }[]).map((p) => p.tier_id));
  const tierState = new Map<string, { count: number; notReady: number }>();
  for (const t of tierRows) {
    const cur = tierState.get(t.sponsored_event_id) ?? { count: 0, notReady: 0 };
    cur.count++;
    const ready = t.distribution_model === "shared" ? !!t.shared_code : pooled.has(t.id);
    if (!ready) cur.notReady++;
    tierState.set(t.sponsored_event_id, cur);
  }

  const fulfilment = new Map(
    ((fulfilmentRes.data ?? []) as { sponsored_event_id: string; ready_at: string | null; artist_ack_at: string | null }[]).map(
      (f) => [f.sponsored_event_id, f],
    ),
  );
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
    const waitingOnUs: ArtistPendingRow["waitingOnUs"] = [];
    const f = fulfilment.get(e.id);
    const tier = tierState.get(e.id) ?? { count: 0, notReady: 0 };
    const eventHref = `/dashboard/admin/events/sponsored/${e.id}`;
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
      waitingOnUs.push({ text: "Fulfilment form not sent to the artist yet", href: `${eventHref}#fulfilment`, kind: "fulfilment" });
    }

    if (!e.reward_codes_confirmed_at) {
      if (tier.count === 0) {
        waitingOnUs.push({
          text: "No discount-code tiers set up yet, so there is nothing for the artist to confirm",
          href: `${eventHref}#discount-codes`,
          kind: "codes_setup",
        });
      } else if (tier.notReady > 0) {
        waitingOnUs.push({
          text:
            tier.notReady === 1
              ? "A discount-code tier has no codes yet — generate the unique codes (or add the shared code), then the artist can confirm them"
              : `${tier.notReady} discount-code tiers have no codes yet — generate the unique codes (or add the shared codes), then the artist can confirm them`,
          href: `${eventHref}#discount-codes`,
          kind: "codes_setup",
        });
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

    const held = e.campaign_id ? (reviewByCampaign.get(e.campaign_id) ?? []) : [];
    if (held.length > 0) {
      waitingOnUs.push({
        text:
          held.length === 1
            ? "1 survey response is waiting for your review — no discount code is issued until you pass it"
            : `${held.length} survey responses are waiting for your review — no discount codes are issued until you pass them`,
        href:
          held.length === 1
            ? `/dashboard/admin/surveys/responses/${held[0]}`
            : "/dashboard/admin/surveys/responses?status=review",
        kind: "review",
      });
    }

    // The last manual step: the artist has done everything, nobody has opened
    // registration. (A campaign-less event is always open.)
    const open = openStates.get(e.id);
    if (
      e.status === "confirmed" &&
      e.reward_codes_confirmed_at &&
      items.length === 0 &&
      open &&
      !open.is_open
    ) {
      waitingOnUs.push({
        text: "Ready to open — the artist has finished everything. Press “Open now” on the campaign so the audience can register.",
        href: e.campaign_id ? `/dashboard/admin/campaigns/${e.campaign_id}` : eventHref,
        kind: "open",
      });
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
    readyToOpen: rows.filter((r) => r.waitingOnUs.some((w) => w.kind === "open")).length,
    responsesToReview: [...reviewByCampaign.values()].reduce((t, ids) => t + ids.length, 0),
  };
}
