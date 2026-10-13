"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { questionSpec, type SurveyQuestionDraft } from "@/lib/surveys";

interface DragHandleProps {
  attributes?: unknown;
  listeners?: unknown;
}

function CardBody({
  question,
  number,
  problem,
  selected,
  editable,
  dragHandleProps,
  onSelect,
  onMove,
  onRemove,
}: {
  question: SurveyQuestionDraft;
  /** 1-based position — the same number save errors quote (FB-00027). */
  number?: number;
  problem?: string | null;
  selected: boolean;
  editable: boolean;
  dragHandleProps?: DragHandleProps;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const spec = questionSpec(question.type);
  return (
    <div
      className={`card flex items-center gap-3 p-3 ${
        selected ? "ring-2 ring-[var(--color-brand)]" : problem ? "ring-1 ring-[var(--color-accent)]/60" : ""
      }`}
    >
      {editable && (
        <button
          type="button"
          className="cursor-grab touch-none px-1 text-lg text-[var(--color-ink-soft)]"
          aria-label="Drag to reorder"
          {...((dragHandleProps?.attributes as Record<string, unknown>) ?? {})}
          {...((dragHandleProps?.listeners as Record<string, unknown>) ?? {})}
        >
          ⠿
        </button>
      )}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        {number != null && (
          <span className="mr-2 text-xs font-semibold tabular-nums text-[var(--color-ink-soft)]">Q{number}</span>
        )}
        <span className="mr-2" aria-hidden>
          {spec.icon}
        </span>
        <span className="font-medium">{question.prompt || spec.label}</span>
        {question.required && <span className="chip ml-2">Required</span>}
        {problem && (
          <span className="mt-1 block text-xs font-semibold text-[var(--color-accent)]">⚠ {problem}</span>
        )}
      </button>
      {editable && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            aria-label="Move question up"
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            aria-label="Move question down"
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            aria-label="Remove question"
            onClick={onRemove}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** Static ghost rendered in the DragOverlay — no useSortable, just the visuals. */
export function QuestionCardPreview({ question }: { question: SurveyQuestionDraft }) {
  return (
    <CardBody
      question={question}
      selected={false}
      editable={false}
      onSelect={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
    />
  );
}

export function SortableQuestionCard({
  question,
  number,
  problem,
  selected,
  editable,
  onSelect,
  onMove,
  onRemove,
}: {
  question: SurveyQuestionDraft;
  number?: number;
  problem?: string | null;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.key, data: { kind: "canvas" }, disabled: !editable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <CardBody
        question={question}
        number={number}
        problem={problem}
        selected={selected}
        editable={editable}
        dragHandleProps={{ attributes, listeners }}
        onSelect={onSelect}
        onMove={onMove}
        onRemove={onRemove}
      />
    </div>
  );
}
