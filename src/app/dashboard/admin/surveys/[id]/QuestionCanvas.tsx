"use client";

import { useDroppable } from "@dnd-kit/core";
import type { SurveyQuestionDraft } from "@/lib/surveys";
import { SortableQuestionCard } from "./SortableQuestionCard";

export function QuestionCanvas({
  questions,
  selectedKey,
  editable,
  onSelect,
  onMove,
  onRemove,
}: {
  questions: SurveyQuestionDraft[];
  selectedKey: string | null;
  editable: boolean;
  onSelect: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
}) {
  // Fallback droppable so dropping a palette card onto an otherwise-empty
  // canvas registers an `over` target — with zero sortable children there is
  // nothing else for dnd-kit to hit-test against.
  const { setNodeRef } = useDroppable({ id: "canvas" });

  return (
    <div ref={setNodeRef} className="min-h-[20rem] space-y-2">
      {questions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-ink-soft)]">
          Drag a question type here, or click one in the palette, to start
          building this survey.
        </div>
      ) : (
        questions.map((q) => (
          <SortableQuestionCard
            key={q.key}
            question={q}
            selected={q.key === selectedKey}
            editable={editable}
            onSelect={() => onSelect(q.key)}
            onMove={(direction) => onMove(q.key, direction)}
            onRemove={() => onRemove(q.key)}
          />
        ))
      )}
    </div>
  );
}
