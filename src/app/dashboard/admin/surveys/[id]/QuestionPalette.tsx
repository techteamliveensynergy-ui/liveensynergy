"use client";

import { DEMOGRAPHIC_ORDER, DEMOGRAPHIC_PRESETS } from "@/lib/surveys";
import type { SurveyDemographic } from "@/lib/types";
import { useDraggable } from "@dnd-kit/core";
import { SURVEY_QUESTION_TYPES } from "@/lib/surveys";
import type { SurveyQuestionType } from "@/lib/types";

function PaletteCard({
  type,
  disabled,
  onAdd,
}: {
  type: SurveyQuestionType;
  disabled: boolean;
  onAdd: (type: SurveyQuestionType) => void;
}) {
  const spec = SURVEY_QUESTION_TYPES.find((s) => s.type === type)!;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: "palette", type },
    disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      onClick={() => onAdd(type)}
      className={`card flex w-full items-start gap-2 p-3 text-left text-sm ${isDragging ? "opacity-40" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="text-lg" aria-hidden>
        {spec.icon}
      </span>
      <span>
        <span className="block font-medium">{spec.label}</span>
        <span className="block text-xs text-[var(--color-ink-soft)]">{spec.hint}</span>
      </span>
    </button>
  );
}

export function QuestionPalette({
  onAdd,
  onAddLikert,
  onAddRatingGroup,
  onAddDemographics,
  demographicsPresent,
  disabled,
}: {
  onAdd: (type: SurveyQuestionType) => void;
  onAddLikert: () => void;
  onAddRatingGroup: () => void;
  /** Adds the given demographic questions (each once per survey). */
  onAddDemographics: (kinds: SurveyDemographic[]) => void;
  demographicsPresent: SurveyDemographic[];
  disabled: boolean;
}) {
  const missing = DEMOGRAPHIC_ORDER.filter((k) => !demographicsPresent.includes(k));
  return (
    <div className="space-y-2">
      <h3 className="field-label">Question types</h3>
      <p className="field-hint">Drag onto the canvas, or click to add.</p>
      <div className="space-y-2">
        {SURVEY_QUESTION_TYPES.map((s) => (
          <PaletteCard key={s.type} type={s.type} disabled={disabled} onAdd={onAdd} />
        ))}
      </div>

      <h3 className="field-label pt-2">Presets</h3>
      <button
        type="button"
        disabled={disabled}
        onClick={onAddLikert}
        className="card flex w-full items-start gap-2 p-3 text-left text-sm"
      >
        <span className="text-lg" aria-hidden>
          🙂
        </span>
        <span>
          <span className="block font-medium">Likert (5-point)</span>
          <span className="block text-xs text-[var(--color-ink-soft)]">
            Strongly disagree → Strongly agree, with face icons.
          </span>
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onAddRatingGroup}
        className="card flex w-full items-start gap-2 p-3 text-left text-sm"
      >
        <span className="text-lg" aria-hidden>
          📊
        </span>
        <span>
          <span className="block font-medium">Rating group</span>
          <span className="block text-xs text-[var(--color-ink-soft)]">
            Several items rated on one scale — e.g. Sound, Lighting, Bar.
          </span>
        </span>
      </button>

      <h3 className="field-label pt-2">Demographics</h3>
      <p className="field-hint">
        Required questions with “Prefer not to say”. They fill the Age band, Gender, Country and Income band columns
        in results, exports and reports — always anonymised.
      </p>
      <button
        type="button"
        disabled={disabled || missing.length === 0}
        onClick={() => onAddDemographics(missing)}
        className="card flex w-full items-start gap-2 p-3 text-left text-sm"
      >
        <span className="text-lg" aria-hidden>
          👥
        </span>
        <span>
          <span className="block font-medium">
            {missing.length === 0 ? "All demographics added" : `Add ${missing.length === 4 ? "all four" : "the rest"}`}
          </span>
          <span className="block text-xs text-[var(--color-ink-soft)]">Age range, gender, country, income range.</span>
        </span>
      </button>
      <div className="grid grid-cols-2 gap-2">
        {DEMOGRAPHIC_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled || demographicsPresent.includes(k)}
            onClick={() => onAddDemographics([k])}
            className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs"
            title={demographicsPresent.includes(k) ? "Already in this survey" : `Add ${DEMOGRAPHIC_PRESETS[k].label}`}
          >
            {demographicsPresent.includes(k) ? "✓ " : "+ "}
            {DEMOGRAPHIC_PRESETS[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}
