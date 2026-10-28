"use client";

import { useState } from "react";

/**
 * A player from a platform that sets its own cookies however it's embedded
 * — Instagram, TikTok, Loom (GitHub #47). Nothing from the platform loads
 * until the viewer asks for it, so opening a survey never drops their
 * cookies on anyone. YouTube (nocookie) and Vimeo (dnt) load straight away.
 */
export function ClickToLoadEmbed({ src, platform }: { src: string; platform: string }) {
  const [loaded, setLoaded] = useState(false);
  if (loaded) {
    return (
      <iframe
        src={src}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black/90 p-4 text-center text-white">
      <button type="button" className="btn btn-white text-sm" onClick={() => setLoaded(true)}>
        ▶ Play video
      </button>
      <p className="max-w-xs text-[0.75em] text-white/80">
        This video is hosted on {platform}, which may set its own cookies when it plays.{" "}
        <a href="/cookies" target="_blank" className="underline">
          Cookie policy
        </a>
      </p>
    </div>
  );
}
