/**
 * Placeholder artwork for events with no uploaded image.
 *
 * Organisers often list an event before they have artwork, which left blank
 * cards on Discover and the landing page (raised 29 Jul). These are Pexels
 * photographs, free to use commercially with no attribution required, picked to
 * match the event categories in `EVENT_CATEGORIES`.
 *
 * They are only ever a fallback — the moment an organiser uploads their own
 * image it wins.
 */

/** Pexels image ids, served through their CDN at a fixed render size. */
const PEXELS: Record<string, string> = {
  music: "1105666", // crowd at a live music gig
  comedy: "713149", // performer on a lit stage with a mic
  theatre: "11523", // theatre seating and stage curtain
  dance: "1701202", // dancer mid-performance
  sports: "274422", // stadium under floodlights
  gaming: "7862657", // gaming setup with controllers
  conference: "2774556", // conference audience
  festival: "1105666", // festival crowd
  art: "1509534", // gallery wall
  food: "1267320", // food market stalls
  film: "7991579", // cinema screen
  default: "1763075", // generic stage lighting
};

const cdn = (id: string) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200&h=630&fit=crop`;

/**
 * Maps a free-text category onto a placeholder. Categories are user-facing
 * strings like "Music & Live Performance", so this matches on keywords rather
 * than requiring an exact value.
 */
export function placeholderForCategory(category?: string | null): string {
  const c = (category ?? "").toLowerCase();
  const key = Object.keys(PEXELS).find(
    (k) => k !== "default" && c.includes(k),
  );
  // A couple of categories don't contain their own keyword.
  if (!key) {
    if (c.includes("sport")) return cdn(PEXELS.sports);
    if (c.includes("e-sport") || c.includes("esport")) return cdn(PEXELS.gaming);
    if (c.includes("academic")) return cdn(PEXELS.conference);
    if (c.includes("exhibition")) return cdn(PEXELS.art);
  }
  return cdn(PEXELS[key ?? "default"]);
}

export interface EventImage {
  src: string;
  alt: string;
  /** True when this is a stand-in rather than the organiser's own artwork. */
  isPlaceholder: boolean;
}

/** The image to render for an event, falling back by category. */
export function eventImage(
  imageUrl: string | null | undefined,
  category?: string | null,
): EventImage {
  if (imageUrl) return { src: imageUrl, alt: "", isPlaceholder: false };
  return {
    src: placeholderForCategory(category),
    alt: category ? `${category} event` : "Live event",
    isPlaceholder: true,
  };
}
