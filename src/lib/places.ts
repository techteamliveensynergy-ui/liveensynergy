import "server-only";

/**
 * Google Places API (New), called from the server only — the key
 * (`GOOGLE_MAPS_API_KEY`) never reaches the browser. Used by the venue picker
 * on event listings and the admin event edit form (0126). Setup:
 * docs/google-places-setup.md.
 *
 * Billing: autocomplete requests and the details call that ends them share a
 * session token, so a whole "type → pick" counts as one session.
 */

export interface PlaceSuggestion {
  placeId: string;
  /** "O2 Academy Brixton" */
  main: string;
  /** "211 Stockwell Road, London, UK" */
  secondary: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
}

export function placesEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

function key(): string {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

/** Session tokens are client-made UUIDs; anything else is dropped. */
function cleanToken(token: string | null | undefined): string | undefined {
  return token && /^[A-Za-z0-9-]{8,64}$/.test(token) ? token : undefined;
}

export async function autocompleteVenues(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
    },
    body: JSON.stringify({
      input: input.slice(0, 200),
      sessionToken: cleanToken(sessionToken),
      languageCode: "en-GB",
      // A bias, not a filter: UK first, venues abroad still found.
      regionCode: "gb",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Places autocomplete failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }[];
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .slice(0, 6)
    .map((p) => ({
      placeId: p.placeId!,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export async function placeDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails | null> {
  if (!/^[A-Za-z0-9_-]{4,300}$/.test(placeId)) return null;
  const token = cleanToken(sessionToken);
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${
    token ? `?sessionToken=${encodeURIComponent(token)}` : ""
  }`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Places details failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const p = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: { longText?: string; types?: string[] }[];
  };
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const part = (...types: string[]) =>
    p.addressComponents?.find((c) => c.types?.some((t) => types.includes(t)))?.longText ?? null;
  return {
    placeId: p.id ?? placeId,
    name: p.displayName?.text ?? null,
    address: p.formattedAddress ?? null,
    lat,
    lng,
    // UK addresses put the town in postal_town, not locality.
    city: part("postal_town", "locality", "administrative_area_level_2"),
    country: part("country"),
  };
}
