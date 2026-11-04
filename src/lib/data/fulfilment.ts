import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which of these confirmed events are still "waiting for fulfilment" (0103)?
 * Answered by a definer RPC that only says yes/no for the caller's own events,
 * because a brand can't read the fulfilment table (it holds the artist's
 * payment terms). If the migration isn't applied yet the RPC errors and this
 * returns an empty set — the lists then show the plain status, as before.
 */
export async function waitingFulfilment(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc("sponsored_events_waiting_fulfilment", { p_ids: ids });
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data as string[]);
}

/** The status value StatusBadge understands for an event that's confirmed but not live. */
export const WAITING_STATUS = "waiting_fulfilment";
