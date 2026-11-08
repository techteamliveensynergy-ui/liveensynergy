"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import { formatDateTime } from "@/lib/format";
import { loadArtistPending, NUDGE_COOLDOWN_MS, type ArtistPendingKind } from "@/lib/data/artist-pending";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: readonly ArtistPendingKind[] = ["agreement", "fulfilment", "codes", "codes_out"];

/** What the reminder asks for, and where it sends the artist. */
const ASK: Record<ArtistPendingKind, { what: string; anchor: string }> = {
  agreement: { what: "agree to the sponsorship", anchor: "" },
  fulfilment: { what: "review and consent to the fulfilment form", anchor: "#fulfilment" },
  codes: { what: "confirm the discount codes", anchor: "#discount-codes" },
  codes_out: { what: "add more discount codes", anchor: "#discount-codes" },
};

function back(notice: string, kind?: string): never {
  const q = new URLSearchParams({ notice });
  if (kind) q.set("kind", kind);
  redirect(`/dashboard/admin/artist-pending?${q.toString()}`);
}

/**
 * "Nudge artist" — sends the artist a reminder about ONE pending item.
 *
 * The item is re-checked against the live data (not trusted from the form), so a
 * reminder can't go out for something the artist has just done. One reminder per
 * event + item per 12 hours; every send is logged in artist_nudges (0110).
 */
export async function nudgeArtist(formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const eventId = String(formData.get("event_id") ?? "");
  const kind = String(formData.get("kind") ?? "") as ArtistPendingKind;
  if (!UUID_RE.test(eventId) || !KINDS.includes(kind)) back("invalid");

  // Is it still pending, and who is it waiting on?
  const summary = await loadArtistPending(supabase);
  const row = summary.rows.find((r) => r.eventId === eventId);
  const item = row?.items.find((i) => i.kind === kind);
  if (!row || !item) back("resolved");

  // Migration 0110 not applied yet: say so rather than pretend to send.
  const { data: eventKey, error: keyError } = await supabase
    .from("notification_events")
    .select("key")
    .eq("key", "sponsorship.artist_nudge")
    .maybeSingle();
  if (keyError || !eventKey) back("not_ready");
  const { error: logProbe } = await supabase.from("artist_nudges").select("id").limit(1);
  if (logProbe) back("not_ready");

  const { data: last } = await supabase
    .from("artist_nudges")
    .select("sent_at")
    .eq("sponsored_event_id", eventId)
    .eq("kind", kind)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ sent_at: string }>();
  if (last && Date.now() - new Date(last.sent_at).getTime() < NUDGE_COOLDOWN_MS) back("too_soon", kind);

  // Log first: if the log write fails nothing is sent, so a reminder can never
  // go out unrecorded (and a double-click can't send twice past the cooldown).
  const { error: logError } = await supabase.from("artist_nudges").insert({
    sponsored_event_id: eventId,
    kind,
    artist_profile_id: row.artistId,
    sent_by: userId,
  });
  if (logError) {
    console.error("[nudgeArtist] could not log the reminder:", logError.message);
    back("failed");
  }

  const ask = ASK[kind];
  const detail =
    kind === "codes" && item.dueAt
      ? `${item.overdue ? "The deadline was" : "The deadline is"} ${formatDateTime(item.dueAt)}.${
          row.peopleWaiting > 0
            ? ` ${row.peopleWaiting} ${row.peopleWaiting === 1 ? "person is" : "people are"} waiting for their code.`
            : ""
        }`
      : kind === "codes" && row.peopleWaiting > 0
        ? `${row.peopleWaiting} ${row.peopleWaiting === 1 ? "person is" : "people are"} waiting for their code until you do.`
        : "The partnership can't move on until this is done.";

  await notify({
    eventKey: "sponsorship.artist_nudge",
    recipientProfileId: row.artistId,
    link: `/dashboard/sponsored/${eventId}${ask.anchor}`,
    variables: {
      event_name: row.name,
      reference: row.reference,
      what: ask.what,
      detail,
    },
  });

  revalidatePath("/dashboard/admin/artist-pending");
  back("nudged", kind);
}
