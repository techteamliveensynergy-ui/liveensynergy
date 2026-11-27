"use server";

import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { autocompleteVenues, placeDetails, placesEnabled, type PlaceDetails, type PlaceSuggestion } from "@/lib/places";

/**
 * The venue picker's two calls (0126). Only people who set venues may use them
 * — artists / organisers on their listings and admins on a partnership — and
 * each is throttled per person, so the server key can't be used as a free
 * Google proxy.
 */
const VENUE_ROLES = new Set(["artist", "event", "admin"]);

async function allowed(action: string, max: number): Promise<string | null> {
  const { profile } = await requireProfile();
  if (!profile || !VENUE_ROLES.has(profile.role)) return "Only artists and the team can search for venues.";
  if (!placesEnabled()) return "Venue search isn't set up yet — enter the coordinates instead.";
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("rate_limit_hit", {
    p_action: action,
    p_window_seconds: 3600,
    p_max: max,
  });
  if (ok === false) return "Too many venue searches in the last hour — try again later, or enter the coordinates.";
  return null;
}

export async function searchVenues(
  query: string,
  sessionToken: string,
): Promise<{ error?: string; suggestions: PlaceSuggestion[] }> {
  const q = String(query ?? "").trim();
  if (q.length < 3) return { suggestions: [] };
  const refused = await allowed("places_search", 300);
  if (refused) return { error: refused, suggestions: [] };
  try {
    return { suggestions: await autocompleteVenues(q, sessionToken) };
  } catch (err) {
    console.error("[places] search failed", err);
    return { error: "Venue search isn't working right now — try again, or enter the coordinates.", suggestions: [] };
  }
}

export async function getVenueDetails(
  placeId: string,
  sessionToken: string,
): Promise<{ error?: string; place?: PlaceDetails }> {
  const refused = await allowed("places_details", 100);
  if (refused) return { error: refused };
  try {
    const place = await placeDetails(String(placeId ?? ""), sessionToken);
    if (!place) return { error: "Google has no exact location for that place — pick another result, or enter the coordinates." };
    return { place };
  } catch (err) {
    console.error("[places] details failed", err);
    return { error: "We couldn't load that venue — try again, or enter the coordinates." };
  }
}
