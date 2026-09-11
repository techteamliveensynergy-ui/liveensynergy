import type { CSSProperties } from "react";

/** Darkens a #rrggbb hex colour by a fraction (0-1) — used for a custom
 *  accent colour's hover state, mirroring --color-brand-dark's relationship
 *  to --color-brand in globals.css. Returns the input unchanged if it isn't
 *  a plain 6-digit hex (the colour input only ever produces one, but admin
 *  data is still admin-typed data). */
function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * CSS custom-property override for a survey's accent colour, scoped to a
 * wrapping element (never applied globally) around just the Next/Submit
 * button. `.btn-primary` in globals.css reads `--color-brand` for its base
 * fill and `--color-brand-dark` on hover — overriding both here, rather
 * than an inline `backgroundColor`, means the hover state picks up the
 * custom colour too instead of reverting to the platform default orange.
 * `.btn-ghost` (the Back button) doesn't reference either variable, so it's
 * unaffected by design.
 */
export function accentColorVars(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    ["--color-brand" as string]: color,
    ["--color-brand-dark" as string]: darken(color, 0.12),
  } as CSSProperties;
}

/**
 * Page-level decorative background for a survey — a single-page survey's
 * template-wide background_image_url, or a stepped survey's current
 * question's config.background_image_url. The cream wash on top keeps the
 * image from competing with the (opaque, `.card`-backed) content sitting on
 * it — cards stay crisp, the image only really reads in the gaps around
 * them and behind plain text like the footer.
 */
export function backgroundImageStyle(url: string | null | undefined): CSSProperties | undefined {
  if (!url) return undefined;
  return {
    backgroundImage: `linear-gradient(rgba(252,247,240,0.86), rgba(252,247,240,0.86)), url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    borderRadius: "1.25rem",
  };
}

/**
 * Turns a YouTube/Vimeo/Loom share link into an embeddable player URL.
 * Anything else returns null rather than iframe-embedding an arbitrary
 * origin — most sites block that via X-Frame-Options anyway, and the 4 Sep
 * standup's "embed links, not uploads" decision was about known video
 * platforms, not arbitrary URLs.
 */
export function videoEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.pathname.startsWith("/embed/")) return url.toString();
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") {
    return url.toString();
  }
  if (host === "loom.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "share" || parts[0] === "embed") {
      const id = parts[1];
      return id ? `https://www.loom.com/embed/${id}` : null;
    }
    return null;
  }

  return null;
}
