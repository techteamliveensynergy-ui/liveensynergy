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
import { DirtyStateGuard } from "@/components/ui/DirtyStateGuard";
import type { SurveyQuestionType, SurveyTemplateLayoutMode } from "@/lib/types";
import {
  firstQuestionProblem,
  newRatingGroupDrafts,
  newRatingGroupRow,
  RATING_GROUP_SHARED_KEYS,
  newLikertQuestionDraft,
  newQuestionDraft,
  questionSpec,
  type ContradictionRuleDraft,
  type SurveyQuestionDraft,
} from "@/lib/surveys";
import { saveSurveyQuestions, type SurveyState } from "../actions";
import { QuestionPalette } from "./QuestionPalette";
import { QuestionCanvas } from "./QuestionCanvas";
import { QuestionInspector } from "./QuestionInspector";
import { LogicEditor } from "./LogicEditor";
import { QuestionCardPreview } from "./SortableQuestionCard";
import { ContradictionRulesEditor } from "./ContradictionRulesEditor";

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
  initialRules,
  editable,
  layoutMode,
}: {
  templateId: string;
  initialQuestions: SurveyQuestionDraft[];
  initialRules: ContradictionRuleDraft[];
  editable: boolean;
  layoutMode: SurveyTemplateLayoutMode;
}) {
  const dndId = useId();
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>(initialQuestions);
  const [rules, setRules] = useState<ContradictionRuleDraft[]>(initialRules);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialQuestions[0]?.key ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  // A pre-save warning goes stale the moment the admin edits anything.
  useEffect(() => setClientError(null), [questions]);
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

  function insertQuestion(created: SurveyQuestionDraft, beforeKey?: string) {
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

  function addQuestion(type: SurveyQuestionType, beforeKey?: string) {
    insertQuestion(newQuestionDraft(type), beforeKey);
  }

  function addLikertQuestion() {
    insertQuestion(newLikertQuestionDraft());
  }

  function addRatingGroup() {
    const rows = newRatingGroupDrafts();
    setQuestions((prev) => [...prev, ...rows]);
    setSelectedKey(rows[0].key);
    setDirty(true);
  }

  /** Adds an item right after the group's last row, so the group stays
   *  contiguous (only consecutive rows render as one card). */
  function addGroupRow(key: string) {
    const from = questions.find((q) => q.key === key);
    const groupId = from?.config.group_id;
    if (!from || !groupId) return;
    const lastIndex = questions.reduce((acc, q, i) => (q.config.group_id === groupId ? i : acc), -1);
    const count = questions.filter((q) => q.config.group_id === groupId).length;
    const row = newRatingGroupRow(from, `Item ${count + 1}`);
    const next = [...questions];
    next.splice(lastIndex + 1, 0, row);
    setQuestions(next);
    setSelectedKey(row.key);
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
    // Jumps that landed on the removed question go back to "next question".
    setQuestions((prev) =>
      prev
        .filter((q) => q.key !== key)
        .map((q) => {
          const logic = q.config.logic;
          if (!logic?.some((r) => r.goto === key)) return q;
          const kept = logic.filter((r) => r.goto !== key);
          const config = { ...q.config };
          if (kept.length) config.logic = kept;
          else delete config.logic;
          return { ...q, config };
        }),
    );
    setSelectedKey((current) => (current === key ? null : current));
    setRules((prev) => prev.filter((r) => r.questionAKey !== key && r.questionBKey !== key));
    setDirty(true);
  }

  function updateRules(next: ContradictionRuleDraft[]) {
    setRules(next);
    setDirty(true);
  }

  function updateQuestion(key: string, patch: Partial<SurveyQuestionDraft>) {
    setQuestions((prev) => {
      const target = prev.find((q) => q.key === key);
      const groupId = target?.type === "scale" ? target.config.group_id : undefined;
      return prev.map((q) => {
        if (q.key === key) return { ...q, ...patch };
        // A rating group's shared settings and help text follow the row being
        // edited onto every other row of the same group (FB-00028).
        if (!groupId || q.config.group_id !== groupId) return q;
        const sibling = { ...q };
        if (patch.help_text !== undefined) sibling.help_text = patch.help_text;
        if (patch.config) {
          const cfg = { ...q.config } as Record<string, unknown>;
          for (const k of RATING_GROUP_SHARED_KEYS) {
            if (k in patch.config) cfg[k] = (patch.config as Record<string, unknown>)[k];
            else delete cfg[k];
          }
          sibling.config = cfg as SurveyQuestionDraft["config"];
        }
        return sibling;
      });
    });
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
    // data-survey-unsaved lets the Publish form refuse while edits aren't saved.
    <div data-survey-unsaved={editable && dirty ? "true" : undefined}>
      <DirtyStateGuard
        dirty={editable && dirty}
        message="You have unsaved survey questions. Leave without saving them?"
      />
      <ErrorBanner error={clientError ?? state.error} />

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="grid gap-4 lg:grid-cols-[14rem_1fr_20rem]">
          <QuestionPalette
            onAdd={(type) => addQuestion(type)}
            onAddLikert={addLikertQuestion}
            onAddRatingGroup={addRatingGroup}
            disabled={!editable}
          />

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

          {/* Keyed per question so an upload's "Uploading…" state (and its
              disabled file picker) never carries over to the next question
              the admin opens — FB-00024. */}
          <div className="space-y-4">
            <QuestionInspector
              key={selected?.key ?? "none"}
              question={selected}
              editable={editable}
              layoutMode={layoutMode}
              onChange={(patch) => selected && updateQuestion(selected.key, patch)}
              onAddGroupRow={() => selected && addGroupRow(selected.key)}
            />
            {selected && (
              <LogicEditor
                key={`logic-${selected.key}`}
                questions={questions}
                question={selected}
                editable={editable}
                onChange={(config) => updateQuestion(selected.key, { config })}
              />
            )}
          </div>
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

      <div className="mt-4">
        <ContradictionRulesEditor
          questions={questions}
          rules={rules}
          editable={editable}
          onChange={updateRules}
        />
      </div>

      {editable && (
        <form
          action={formAction}
          onSubmit={(e) => {
            // Catch an invalid question here and open it, rather than a
            // round trip that returns "Question N: …" with nothing on screen
            // pointing at question N (FB-00027).
            const problem = firstQuestionProblem(questions);
            if (problem) {
              e.preventDefault();
              setClientError(problem.message);
              setSelectedKey(problem.key);
              return;
            }
            setClientError(null);
          }}
          className="mt-6 flex flex-wrap items-center justify-end gap-3"
        >
          <input type="hidden" name="template_id" value={templateId} />
          <input
            type="hidden"
            name="questions"
            value={JSON.stringify(questions)}
            readOnly
          />
          <input
            type="hidden"
            name="contradiction_rules"
            value={JSON.stringify(rules)}
            readOnly
          />
          {dirty && <span className="chip">Unsaved changes</span>}
          <SaveButton dirty={dirty} />
        </form>
      )}
    </div>
  );
}
