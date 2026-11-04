import {
  SURVEY_NEARLY_FULL_BODY,
  SURVEY_NEARLY_FULL_TITLE,
  SURVEY_OVER_CAPACITY_BODY,
  SURVEY_OVER_CAPACITY_TITLE,
  SURVEY_QUOTA_BODY,
  SURVEY_QUOTA_TITLE,
  quotaFilledOpen,
  type SurveyCapacityState,
} from "@/lib/survey-capacity";

/**
 * The notice above a survey form once places run low (#34, 19 Oct; 2 Nov):
 *   90%      a warning that codes may run out,
 *   100%     the quota is filled — no code is guaranteed, fill it in at your
 *            own discretion (the 10% buffer keeps taking responses),
 *   limit    the participant limit is reached; responses are reviewed.
 * Renders nothing below 90%.
 */
export function CapacityNotice({ capacity }: { capacity: SurveyCapacityState | null }) {
  if (!capacity) return null;
  const over = capacity.is_full;
  const quota = quotaFilledOpen(capacity);
  if (!over && !quota && !capacity.nearly_full) return null;

  const title = over ? SURVEY_OVER_CAPACITY_TITLE : quota ? SURVEY_QUOTA_TITLE : SURVEY_NEARLY_FULL_TITLE;
  const body = over ? SURVEY_OVER_CAPACITY_BODY : quota ? SURVEY_QUOTA_BODY : SURVEY_NEARLY_FULL_BODY;

  return (
    <div
      role="status"
      data-testid="capacity-notice"
      data-stage={over ? "limit" : quota ? "quota" : "nearly_full"}
      className={`mb-5 rounded-xl px-4 py-3 text-sm ${
        over || quota
          ? "bg-[var(--color-pink)] text-[var(--color-accent)]"
          : "bg-[var(--color-gold)]/40 text-[var(--color-ink)]"
      }`}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}
