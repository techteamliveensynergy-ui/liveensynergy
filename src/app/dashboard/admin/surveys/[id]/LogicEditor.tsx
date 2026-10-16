"use client";

import { offersOther, otherLabel, SURVEY_OTHER_VALUE, type SurveyQuestionDraft } from "@/lib/surveys";
import { canBranch, LOGIC_END, logicRules, type SurveyLogicRule } from "@/lib/survey-logic";
import type { SurveyQuestionConfig } from "@/lib/types";

const NEXT = "";

/**
 * Skip logic for one question (0071, 14 Oct standup): per answer, where the
 * respondent goes next — a later question or the end — plus an "everyone
 * else" jump, which is also how a branch re-joins the main path (put it on
 * the branch's last question). Rules are stored in config.logic; the order
 * written here (answers first, the catch-all last) is the order they're
 * checked in. See src/lib/survey-logic.ts.
 */
export function LogicEditor({
  questions,
  question,
  editable,
  onChange,
}: {
  questions: SurveyQuestionDraft[];
  question: SurveyQuestionDraft;
  editable: boolean;
  onChange: (config: SurveyQuestionConfig) => void;
}) {
  if (!canBranch(question)) return null;

  const index = questions.findIndex((q) => q.key === question.key);
  // Later questions a jump may land on: not hidden fields, and only the
  // first row of a rating group (the group shows as one card).
  const targets = questions
    .map((q, i) => ({ q, i }))
    .filter(
      ({ q, i }) =>
        i > index &&
        q.type !== "hidden_field" &&
        !(q.type === "scale" && q.config.group_id && questions[i - 1]?.config.group_id === q.config.group_id),
    );

  const rules = logicRules(question);
  const always = rules.find((r) => r.op === "always");
  const ranges = rules.filter((r) => r.op === "between");
  const byValue = new Map(
    rules.filter((r) => r.op === "equals" || r.op === "includes").map((r) => [r.value ?? "", r.goto]),
  );

  const isChoice = ["single_choice", "yes_no", "dropdown", "multiple_choice"].includes(question.type);
  const op: SurveyLogicRule["op"] = question.type === "multiple_choice" ? "includes" : "equals";
  const answerOptions = isChoice
    ? [
        ...question.options.filter((o) => o.value.trim()),
        ...(offersOther(question) ? [{ label: otherLabel(question.config), value: SURVEY_OTHER_VALUE }] : []),
      ]
    : [];

  function save(next: { byValue?: Map<string, string>; ranges?: SurveyLogicRule[]; always?: string }) {
    const values = next.byValue ?? byValue;
    const rangeRules = next.ranges ?? ranges;
    const alwaysGoto = next.always ?? always?.goto ?? NEXT;
    const list: SurveyLogicRule[] = [
      // Answer rules in option order, so "first match wins" reads top-down.
      ...answerOptions
        .filter((o) => values.get(o.value))
        .map((o) => ({ op, value: o.value, goto: values.get(o.value)! })),
      ...rangeRules,
      ...(alwaysGoto ? [{ op: "always" as const, goto: alwaysGoto }] : []),
    ];
    const config = { ...question.config };
    if (list.length) config.logic = list;
    else delete config.logic;
    onChange(config);
  }

  const targetSelect = (value: string, onPick: (v: string) => void, label: string) => (
    <select
      className="select text-sm"
      value={value}
      disabled={!editable}
      aria-label={label}
      onChange={(e) => onPick(e.target.value)}
    >
      <option value={NEXT}>Next question</option>
      {targets.map(({ q, i }) => (
        <option key={q.key} value={q.key}>
          Q{i + 1}: {(q.type === "scale" && q.config.group_id ? q.config.group_prompt : q.prompt)?.slice(0, 50) || "(untitled)"}
        </option>
      ))}
      <option value={LOGIC_END}>End of survey</option>
    </select>
  );

  // Scales and number questions branch on a range of the answer.
  const ranged = question.type === "scale" || question.type === "number";
  const min = question.config.min ?? (question.type === "scale" ? 1 : 0);
  const max = question.config.max ?? (question.type === "scale" ? 5 : 10);

  return (
    <div className="card space-y-3 p-5">
      <div>
        <p className="text-sm font-semibold">Skip logic</p>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Send people to a different question depending on their answer. Jumps only go forward. To join two
          paths back up, set &ldquo;Everyone else&rdquo; on the last question of the first path to the
          question where they meet.
        </p>
      </div>

      {answerOptions.map((o) => (
        <label key={o.value} className="block text-sm">
          <span className="text-xs text-[var(--color-ink-soft)]">
            {question.type === "multiple_choice" ? "If they pick" : "If they answer"} &ldquo;{o.label}&rdquo;
          </span>
          {targetSelect(
            byValue.get(o.value) ?? NEXT,
            (v) => {
              const next = new Map(byValue);
              if (v) next.set(o.value, v);
              else next.delete(o.value);
              save({ byValue: next });
            },
            `Where "${o.label}" goes`,
          )}
        </label>
      ))}
      {question.type === "multiple_choice" && answerOptions.length > 0 && (
        <p className="text-xs text-[var(--color-ink-soft)]">
          With several picks, the first option in this list that has a jump wins.
        </p>
      )}

      {ranged && (
        <div className="space-y-2">
          {ranges.map((r, n) => (
            <div key={n} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-xs text-[var(--color-ink-soft)]">If</span>
              <input
                type="number"
                className="input w-16"
                value={r.min ?? ""}
                min={min}
                max={max}
                disabled={!editable}
                aria-label="From"
                onChange={(e) => {
                  const next = ranges.map((x, k) => (k === n ? { ...x, min: Number(e.target.value) } : x));
                  save({ ranges: next });
                }}
              />
              <span className="text-xs">to</span>
              <input
                type="number"
                className="input w-16"
                value={r.max ?? ""}
                min={min}
                max={max}
                disabled={!editable}
                aria-label="To"
                onChange={(e) => {
                  const next = ranges.map((x, k) => (k === n ? { ...x, max: Number(e.target.value) } : x));
                  save({ ranges: next });
                }}
              />
              {targetSelect(
                r.goto,
                (v) => {
                  const next = v
                    ? ranges.map((x, k) => (k === n ? { ...x, goto: v } : x))
                    : ranges.filter((_, k) => k !== n);
                  save({ ranges: next });
                },
                "Where this range goes",
              )}
              {editable && (
                <button
                  type="button"
                  className="text-xs text-[var(--color-accent)]"
                  onClick={() => save({ ranges: ranges.filter((_, k) => k !== n) })}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() =>
                save({ ranges: [...ranges, { op: "between", min, max: min, goto: targets[0]?.q.key ?? LOGIC_END }] })
              }
            >
              + Add a range
            </button>
          )}
        </div>
      )}

      <label className="block text-sm">
        <span className="text-xs text-[var(--color-ink-soft)]">
          {answerOptions.length || ranged ? "Everyone else" : "After this question"}
        </span>
        {targetSelect(always?.goto ?? NEXT, (v) => save({ always: v }), "Where everyone else goes")}
      </label>

      {rules.length > 0 && questions.some((q, i) => i > index && q.type === "attention_check") && (
        <p className="rounded-lg bg-[var(--color-gold)]/40 px-3 py-2 text-xs">
          Tip: put attention checks where everyone sees them. One that a branch skips simply isn&apos;t scored.
        </p>
      )}
    </div>
  );
}
