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
