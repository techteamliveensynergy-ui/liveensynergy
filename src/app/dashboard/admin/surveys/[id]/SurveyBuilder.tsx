"use client";

import { useEffect, useId, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ErrorBanner } from "@/components/onboarding/parts";
import type { SurveyQuestionType } from "@/lib/types";
import { newQuestionDraft, questionSpec, type SurveyQuestionDraft } from "@/lib/surveys";
import { saveSurveyQuestions, type SurveyState } from "../actions";
import { QuestionPalette } from "./QuestionPalette";
import { QuestionCanvas } from "./QuestionCanvas";
import { QuestionInspector } from "./QuestionInspector";
import { QuestionCardPreview } from "./SortableQuestionCard";

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </button>
  );
}

type ActiveDrag =
  | { kind: "palette"; type: SurveyQuestionType }
  | { kind: "question"; draft: SurveyQuestionDraft }
  | null;

export function SurveyBuilder({
  templateId,
  initialQuestions,
  editable,
}: {
  templateId: string;
  initialQuestions: SurveyQuestionDraft[];
  editable: boolean;
}) {
  const dndId = useId();
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>(initialQuestions);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialQuestions[0]?.key ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [state, formAction] = useActionState<SurveyState, FormData>(
    saveSurveyQuestions,
    {},
  );

  useEffect(() => {
    if (state.success) setDirty(false);
  }, [state]);

  const sensors = useSensors(
    // A movement threshold, not an instant grab — without it the pointer
    // sensor swallows the click that click-to-add / select depend on.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addQuestion(type: SurveyQuestionType, beforeKey?: string) {
    const created = newQuestionDraft(type);
    setQuestions((prev) => {
      const index = beforeKey ? prev.findIndex((q) => q.key === beforeKey) : -1;
      const insertAt = index === -1 ? prev.length : index;
      const next = [...prev];
      next.splice(insertAt, 0, created);
      return next;
    });
    setSelectedKey(created.key);
    setDirty(true);
  }

  function moveQuestion(key: string, direction: -1 | 1) {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
    setDirty(true);
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
    setSelectedKey((current) => (current === key ? null : current));
    setDirty(true);
  }

  function updateQuestion(key: string, patch: Partial<SurveyQuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
    setDirty(true);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { kind: "palette"; type: SurveyQuestionType }
      | undefined;
    if (data?.kind === "palette") {
      setActiveDrag({ kind: "palette", type: data.type });
      return;
    }
    const draft = questions.find((q) => q.key === event.active.id);
    if (draft) setActiveDrag({ kind: "question", draft });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const data = active.data.current as
      | { kind: "palette"; type: SurveyQuestionType }
      | undefined;

    if (data?.kind === "palette") {
      addQuestion(data.type, String(over.id));
      return;
    }

    if (active.id !== over.id) {
      setQuestions((prev) => {
        const oldIndex = prev.findIndex((q) => q.key === active.id);
        const newIndex = prev.findIndex((q) => q.key === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
      setDirty(true);
    }
  }

  const selected = questions.find((q) => q.key === selectedKey) ?? null;

  return (
    <div>
      <ErrorBanner error={state.error} />

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="grid gap-4 lg:grid-cols-[14rem_1fr_20rem]">
          <QuestionPalette onAdd={(type) => addQuestion(type)} disabled={!editable} />

          <SortableContext
            items={questions.map((q) => q.key)}
            strategy={verticalListSortingStrategy}
          >
            <QuestionCanvas
              questions={questions}
              selectedKey={selectedKey}
              editable={editable}
              onSelect={setSelectedKey}
              onMove={moveQuestion}
              onRemove={removeQuestion}
            />
          </SortableContext>

          <QuestionInspector
            question={selected}
            editable={editable}
            onChange={(patch) => selected && updateQuestion(selected.key, patch)}
          />
        </div>

        <DragOverlay>
          {activeDrag?.kind === "palette" ? (
            <div className="card cursor-grabbing px-3 py-2 text-sm font-medium shadow-lg">
              {questionSpec(activeDrag.type).icon} {questionSpec(activeDrag.type).label}
            </div>
          ) : activeDrag?.kind === "question" ? (
            <QuestionCardPreview question={activeDrag.draft} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {editable && (
        <form action={formAction} className="mt-6 flex items-center justify-end gap-3">
          <input type="hidden" name="template_id" value={templateId} />
          <input
            type="hidden"
            name="questions"
            value={JSON.stringify(questions)}
            readOnly
          />
          {dirty && <span className="chip">Unsaved changes</span>}
          <SaveButton dirty={dirty} />
        </form>
      )}
    </div>
  );
}
