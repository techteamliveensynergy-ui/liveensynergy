/**
 * Video link handling for profiles.
 *
 * Aligned 29 Jul: a profile can carry several video links, any URL is accepted,
 * and YouTube / Vimeo are embedded inline while everything else renders as a
 * plain link. The forms say as much, so nobody is surprised when their
 * SoundCloud link doesn't turn into a player.
 */

export interface VideoEmbed {
  /** The URL as supplied. */
  url: string;
  /** Player URL when we recognise the host, otherwise null. */
  embedUrl: string | null;
  provider: "youtube" | "vimeo" | null;
}

/** Pulls the id out of the various YouTube URL shapes. */
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1) || null;
  if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) {
    return null;
  }
  // /watch?v=ID
  const v = u.searchParams.get("v");
  if (v) return v;
  // /embed/ID, /shorts/ID, /live/ID
  const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
  return m ? m[2] : null;
}

/** Vimeo ids are numeric; unlisted links carry a hash after them. */
function vimeoId(u: URL): { id: string; hash?: string } | null {
  if (!u.hostname.replace(/^www\./, "").endsWith("vimeo.com")) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const id = parts.find((p) => /^\d+$/.test(p));
  if (!id) return null;
  const after = parts[parts.indexOf(id) + 1];
  return after && /^[a-z0-9]+$/i.test(after) ? { id, hash: after } : { id };
}

/** Classifies a link and, where possible, builds its player URL. */
export function toEmbed(rawUrl: string): VideoEmbed {
  const url = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, embedUrl: null, provider: null };
  }

  const yt = youtubeId(parsed);
  if (yt) {
    return {
      url,
      // nocookie host keeps a profile view from dropping tracking cookies on
      // visitors who haven't asked for them.
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      provider: "youtube",
    };
  }

  const vm = vimeoId(parsed);
  if (vm) {
    return {
      url,
      embedUrl: `https://player.vimeo.com/video/${vm.id}${vm.hash ? `?h=${vm.hash}` : ""}`,
      provider: "vimeo",
    };
  }

  return { url, embedUrl: null, provider: null };
}

/**
 * Normalises whatever is stored into a list. Profiles previously held a single
 * `video_url` string, and those rows still exist.
 */
export function videoList(
  videoUrls: string[] | null | undefined,
  legacyVideoUrl?: string | null,
): string[] {
  const list = (videoUrls ?? []).filter((v) => v && v.trim());
  if (list.length === 0 && legacyVideoUrl) return [legacyVideoUrl];
  return list;
}
