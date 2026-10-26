import {
  SURVEY_NEARLY_FULL_BODY,
  SURVEY_NEARLY_FULL_TITLE,
  SURVEY_OVER_CAPACITY_BODY,
  SURVEY_OVER_CAPACITY_TITLE,
  type SurveyCapacityState,
} from "@/lib/survey-capacity";

/**
 * The notice above a survey form once places run low (#34, 19 Oct): a
 * warning from 90% of the expected participants, and "responses are
 * reviewed" once the limit is reached. Renders nothing otherwise.
 */
export function CapacityNotice({ capacity }: { capacity: SurveyCapacityState | null }) {
  if (!capacity) return null;
  const over = capacity.is_full;
  if (!over && !capacity.nearly_full) return null;

  return (
    <div
      role="status"
      className={`mb-5 rounded-xl px-4 py-3 text-sm ${
        over
          ? "bg-[var(--color-pink)] text-[var(--color-accent)]"
          : "bg-[var(--color-gold)]/40 text-[var(--color-ink)]"
      }`}
    >
      <p className="font-semibold">{over ? SURVEY_OVER_CAPACITY_TITLE : SURVEY_NEARLY_FULL_TITLE}</p>
      <p className="mt-0.5">{over ? SURVEY_OVER_CAPACITY_BODY : SURVEY_NEARLY_FULL_BODY}</p>
    </div>
  );
}
