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
  selected,
  editable,
  dragHandleProps,
  onSelect,
  onMove,
  onRemove,
}: {
  question: SurveyQuestionDraft;
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
      className={`card flex items-center gap-3 p-3 ${selected ? "ring-2 ring-[var(--color-brand)]" : ""}`}
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
      <button type="button" className="flex-1 text-left" onClick={onSelect}>
        <span className="mr-2" aria-hidden>
          {spec.icon}
        </span>
        <span className="font-medium">{question.prompt || spec.label}</span>
        {question.required && <span className="chip ml-2">Required</span>}
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
  selected,
  editable,
  onSelect,
  onMove,
  onRemove,
}: {
  question: SurveyQuestionDraft;
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
