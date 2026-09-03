"use client";

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
  disabled,
}: {
  onAdd: (type: SurveyQuestionType) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <h3 className="field-label">Question types</h3>
      <p className="field-hint">Drag onto the canvas, or click to add.</p>
      <div className="space-y-2">
        {SURVEY_QUESTION_TYPES.map((s) => (
          <PaletteCard key={s.type} type={s.type} disabled={disabled} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}
