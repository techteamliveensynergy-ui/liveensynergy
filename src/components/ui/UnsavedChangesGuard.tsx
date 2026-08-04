"use client";

import { useEffect, useRef } from "react";

/**
 * Warns before leaving a form with edits that haven't been saved.
 *
 * Asked for in the 3 Aug standup: admins were editing a user's profile,
 * navigating away, and losing the changes with no indication anything had been
 * dropped. Applies to the user-facing profile page for the same reason.
 *
 * Two escape routes have to be covered — a real page unload (`beforeunload`,
 * which the browser words itself) and a client-side `<Link>` navigation, which
 * never triggers it. The latter is caught with a capture-phase click listener
 * so it runs before Next's router picks the event up.
 */
export function UnsavedChangesGuard({
  message = "You have unsaved changes to this profile. Leave without saving them?",
}: {
  message?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    let dirty = false;
    const markDirty = () => {
      dirty = true;
    };
    // Submitting is the point at which the edits stop being unsaved.
    const markClean = () => {
      dirty = false;
    };

    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", markClean);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      // Legacy browsers need returnValue set; the string itself is ignored.
      e.returnValue = "";
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!dirty || e.defaultPrevented) return;
      // Let modified clicks (new tab / window) through untouched.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      const link = (e.target as HTMLElement | null)?.closest?.("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || link.target === "_blank") return;

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        dirty = false;
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);

    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      form.removeEventListener("submit", markClean);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [message]);

  return <span ref={anchor} hidden aria-hidden />;
}
