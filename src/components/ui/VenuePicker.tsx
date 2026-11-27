"use client";

import { useEffect, useRef, useState } from "react";
import { getVenueDetails, searchVenues } from "@/app/dashboard/places-actions";
import type { PlaceDetails, PlaceSuggestion } from "@/lib/places";
import {
  DEFAULT_CHECKIN_RADIUS_M,
  hasVenueLocation,
  mapsLink,
  NO_VENUE,
  parseCoordinates,
  type VenueLocation,
} from "@/lib/venue";

function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** An OpenStreetMap embed framed on roughly the check-in area (no key needed). */
function mapEmbedUrl(lat: number, lng: number, radiusM: number): string {
  const span = Math.max(radiusM, 400) * 1.15;
  const dLat = span / 111_320;
  const dLng = span / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(5)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Picks the venue as coordinates (0126): search Google Places by venue name or
 * address, or — for a field, a park, a venue Google doesn't know — paste the
 * coordinates from Google Maps. Posts four hidden fields (`venue_address`,
 * `venue_place_id`, `venue_lat`, `venue_lng`) read by `venueFromForm()`.
 *
 * The map preview is there so whoever sets it can see the pin is on the right
 * building: a wrong pin locks every attendee out of check-in on the night.
 */
export function VenuePicker({
  placesEnabled,
  initial,
  radiusM = DEFAULT_CHECKIN_RADIUS_M,
  onPick,
  id = "venue-search",
}: {
  placesEnabled: boolean;
  initial?: Partial<VenueLocation> | null;
  /** Frames the map preview on the check-in area. */
  radiusM?: number;
  /** Lets a form fill its own venue name / city / country from the pick. */
  onPick?: (place: PlaceDetails) => void;
  id?: string;
}) {
  const [venue, setVenue] = useState<VenueLocation>({ ...NO_VENUE, ...(initial ?? {}) });
  const [editing, setEditing] = useState(!hasVenueLocation(initial));
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(!placesEnabled);
  const [coordText, setCoordText] = useState("");
  const [addressText, setAddressText] = useState("");
  const token = useRef<string>(newSessionToken());
  const latest = useRef(0);

  // Debounced search; a slower earlier reply never overwrites a newer one.
  useEffect(() => {
    if (!placesEnabled || manual) return;
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const n = ++latest.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchVenues(q, token.current);
      if (n !== latest.current) return;
      setSearching(false);
      setError(res.error ?? null);
      setSuggestions(res.suggestions);
    }, 300);
    return () => clearTimeout(t);
  }, [query, placesEnabled, manual]);

  async function choose(s: PlaceSuggestion) {
    setSearching(true);
    setError(null);
    const res = await getVenueDetails(s.placeId, token.current);
    setSearching(false);
    // A details call ends the billing session; the next search starts a new one.
    token.current = newSessionToken();
    if (res.error || !res.place) {
      setError(res.error ?? "We couldn't load that venue.");
      return;
    }
    const p = res.place;
    const address = [p.name, p.address].filter(Boolean).join(", ");
    setVenue({ venue_address: address || null, venue_place_id: p.placeId, venue_lat: p.lat, venue_lng: p.lng });
    setSuggestions([]);
    setQuery("");
    setEditing(false);
    onPick?.(p);
  }

  function applyCoordinates() {
    const c = parseCoordinates(coordText);
    if (!c) {
      setError("Enter the coordinates as “latitude, longitude”, e.g. 51.4652, -0.1149 (right-click the spot in Google Maps to copy them).");
      return;
    }
    setError(null);
    setVenue({ venue_address: addressText.trim() || null, venue_place_id: null, venue_lat: c.lat, venue_lng: c.lng });
    setEditing(false);
  }

  const set = hasVenueLocation(venue);
  const link = mapsLink(venue);

  return (
    <div className="space-y-3">
      <input type="hidden" name="venue_address" value={venue.venue_address ?? ""} />
      <input type="hidden" name="venue_place_id" value={venue.venue_place_id ?? ""} />
      <input type="hidden" name="venue_lat" value={venue.venue_lat ?? ""} />
      <input type="hidden" name="venue_lng" value={venue.venue_lng ?? ""} />

      {set && (
        <div className="rounded-xl border border-black/10 p-3" data-testid="venue-set">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            📍 {venue.venue_address || `Pinned at ${venue.venue_lat}, ${venue.venue_lng}`}
          </p>
          <iframe
            title="Venue map"
            src={mapEmbedUrl(venue.venue_lat!, venue.venue_lng!, radiusM)}
            className="mt-2 h-48 w-full rounded-lg border border-black/10"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-dark)] underline">
                Check the pin in Google Maps ↗
              </a>
            )}
            {!editing && (
              <button type="button" className="underline" onClick={() => setEditing(true)}>
                Change venue
              </button>
            )}
            <button
              type="button"
              className="text-[var(--color-accent)] underline"
              onClick={() => {
                setVenue(NO_VENUE);
                setEditing(true);
              }}
            >
              Remove location
            </button>
          </div>
        </div>
      )}

      {editing && !manual && placesEnabled && (
        <div className="relative">
          <input
            id={id}
            type="search"
            className="input"
            autoComplete="off"
            placeholder="Search the venue name or address, e.g. O2 Academy Brixton"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter picks the top result instead of submitting the whole form.
              if (e.key === "Enter") {
                e.preventDefault();
                if (suggestions[0]) void choose(suggestions[0]);
              }
            }}
          />
          {searching && <p className="field-hint">Searching…</p>}
          {suggestions.length > 0 && (
            <ul
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-black/10 bg-white shadow-lg"
              role="listbox"
            >
              {suggestions.map((s) => (
                <li key={s.placeId}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-mist)]"
                    onClick={() => void choose(s)}
                  >
                    <span className="font-semibold">{s.main}</span>
                    {s.secondary && <span className="block text-xs text-[var(--color-ink-soft)]">{s.secondary}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && manual && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`${id}-coords`}>
              Coordinates
            </label>
            <input
              id={`${id}-coords`}
              className="input"
              placeholder="51.4652, -0.1149"
              value={coordText}
              onChange={(e) => setCoordText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCoordinates();
                }
              }}
            />
            <p className="field-hint">In Google Maps, right-click the venue and click the numbers to copy them.</p>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-address`}>
              Address (shown to people)
            </label>
            <input
              id={`${id}-address`}
              className="input"
              placeholder="e.g. Victoria Park, London E9"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={applyCoordinates}>
              Use these coordinates
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-[var(--color-accent)]" role="alert">
          {error}
        </p>
      )}

      {editing && placesEnabled && (
        <button
          type="button"
          className="text-xs underline"
          onClick={() => {
            setManual((m) => !m);
            setError(null);
          }}
        >
          {manual ? "Search for the venue instead" : "Can't find it? Enter the coordinates instead"}
        </button>
      )}
    </div>
  );
}
