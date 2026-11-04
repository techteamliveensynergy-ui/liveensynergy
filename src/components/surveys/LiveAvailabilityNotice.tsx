"use client";

import { useCallback, useRef, useState } from "react";
import { surveyAvailability } from "@/app/survey/[templateId]/actions";
import {
  SURVEY_CODES_OUT_BODY,
  SURVEY_CODES_OUT_TITLE,
  SURVEY_FILLED_MID_BODY,
  SURVEY_FILLED_MID_TITLE,
  SURVEY_QUOTA_MID_BODY,
  SURVEY_QUOTA_MID_TITLE,
  type SurveyAvailability,
} from "@/lib/survey-capacity";

const MIN_INTERVAL_MS = 30_000;

/**
 * Re-checks a survey's places and codes while someone is answering it
 * (GitHub #53). `check` is called on each step change; it asks the server at
 * most once every 30 s and never while the tab is hidden, so an idle tab
 * costs nothing. Once the survey fills or its codes run out, `notice` is a
 * banner the respondent can read and carry on past — it never blocks.
 *
 * `initiallyFull`: the page already showed the quota-filled or over-limit
 * notice at load, so a "quota reached" / "full" answer has nothing new to
 * say; "codes out" still does.
 */
export function useLiveAvailability(templateId: string, initiallyFull: boolean) {
  const [state, setState] = useState<SurveyAvailability>("open");
  const lastAsked = useRef(0);
  const inFlight = useRef(false);

  const check = useCallback(() => {
    if (inFlight.current || document.hidden) return;
    const now = Date.now();
    if (now - lastAsked.current < MIN_INTERVAL_MS) return;
    lastAsked.current = now;
    inFlight.current = true;
    surveyAvailability(templateId)
      .then(setState)
      .catch(() => {})
      .finally(() => {
        inFlight.current = false;
      });
  }, [templateId]);

  const show =
    state === "codes_out" || ((state === "full" || state === "quota_reached") && !initiallyFull);
  const title =
    state === "codes_out" ? SURVEY_CODES_OUT_TITLE : state === "quota_reached" ? SURVEY_QUOTA_MID_TITLE : SURVEY_FILLED_MID_TITLE;
  const body =
    state === "codes_out" ? SURVEY_CODES_OUT_BODY : state === "quota_reached" ? SURVEY_QUOTA_MID_BODY : SURVEY_FILLED_MID_BODY;
  const notice = show ? (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl bg-[var(--color-pink)] px-4 py-3 text-[0.875em] text-[var(--color-accent)]"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  ) : null;

  return { check, notice };
}
