"use client";

import { useEffect, useRef } from "react";

/**
 * Warns before leaving a screen whose edits live in React state rather than
 * form fields (the survey builder's question canvas — QA 30 Oct #4: questions
 * added and not saved were lost on reload with no warning). Covers a real
 * page unload and a client-side <Link> click, like UnsavedChangesGuard does
 * for forms.
 */
export function DirtyStateGuard({ dirty, message }: { dirty: boolean; message: string }) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    let leaving = false;
    const isDirty = () => dirtyRef.current && !leaving;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || !isDirty()) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const link = (e.target as HTMLElement | null)?.closest?.("a");
      const href = link?.getAttribute("href");
      if (!link || !href || href.startsWith("#") || link.target === "_blank") return;
      if (window.confirm(message)) {
        leaving = true;
      } else {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [message]);

  return null;
}
