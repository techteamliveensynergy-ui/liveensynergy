"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/**
 * Renders Turnstile explicitly into a ref'd div, rather than implicitly via
 * a `cf-turnstile` class — implicit rendering has Turnstile inject its own
 * `<input name="cf-turnstile-response">` into a React-owned subtree,
 * putting React and a third-party script in charge of the same DOM
 * children. Explicit render into a div React never puts children in, with
 * the token lifted into React state (SurveyForm.tsx's own hidden input),
 * keeps that ownership boundary clean.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset — the
 * server-side screenSurveySubmission() in survey-abuse.ts is what decides
 * whether that's a pass-through (dev) or a refusal (production).
 */
export function TurnstileWidget({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch((err) => console.error("[turnstile] widget load failed", err));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Mount once per siteKey — onToken is stable enough for this widget's
    // lifetime and re-running this effect on every render would re-mount
    // the third-party widget needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  // A Turnstile token is single-use — the server has spent it once this
  // form fails validation and the user retries. Force a fresh challenge
  // rather than resubmitting a dead token (which fails as
  // timeout-or-duplicate, masking the real error).
  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} />;
}
