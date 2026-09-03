"use client";

import { newContradictionRuleDraft, questionSpec, type ContradictionRuleDraft, type SurveyQuestionDraft } from "@/lib/surveys";

/**
 * "If Q3 = Never, then Q7 can't be Within the last week" style rules — feeds
 * the `contradictions` quality signal (migration 0035). Deliberately small:
 * the build plan expects "typically none to three per survey", so this is a
 * plain repeatable-row list, not a builder of its own.
 */
export function ContradictionRulesEditor({
  questions,
  rules,
  editable,
  onChange,
}: {
  questions: SurveyQuestionDraft[];
  rules: ContradictionRuleDraft[];
  editable: boolean;
  onChange: (rules: ContradictionRuleDraft[]) => void;
}) {
  // Hidden fields aren't shown to the respondent and have no admin-known
  // value to compare against. Multi-value types (multiple_choice, ranking)
  // are excluded too: score_survey_response() compares a rule's value
  // against `answer #>> '{}'`, which for an array-valued answer is its raw
  // JSON text, not one selected option — a rule against either type could
  // never match a real answer.
  const eligible = questions.filter(
    (q) => questionSpec(q.type).hasPrompt && questionSpec(q.type).answerShape !== "string[]",
  );

  function update(key: string, patch: Partial<ContradictionRuleDraft>) {
    onChange(rules.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remove(key: string) {
    onChange(rules.filter((r) => r.key !== key));
  }

  function questionLabel(key: string): string {
    const index = eligible.findIndex((q) => q.key === key);
    if (index === -1) return "";
    const q = eligible[index];
    return `Q${index + 1}: ${q.prompt.trim() || "(untitled)"}`;
  }

  function valueInput(questionKey: string, value: string, onValueChange: (v: string) => void) {
    const question = eligible.find((q) => q.key === questionKey);
    if (question && question.options.length > 0) {
      return (
        <select
          className="select"
          disabled={!editable}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        >
          <option value="">Choose value…</option>
          {question.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className="input"
        disabled={!editable}
        placeholder="Exact answer value"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--color-ink)]">Contradiction rules</h3>
        {editable && (
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => onChange([...rules, newContradictionRuleDraft()])}
            disabled={eligible.length < 2}
          >
            + Add rule
          </button>
        )}
      </div>
      <p className="field-hint mb-4">
        Flag a response when two specific answers can&apos;t both be true — e.g. &quot;never
        attends&quot; and &quot;attended within the last week&quot;. Feeds the quality engine&apos;s
        contradictions signal.
      </p>

      {eligible.length < 2 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          Add at least two questions to define a contradiction rule.
        </p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">No contradiction rules defined.</p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.key}
              className="grid items-end gap-2 rounded-lg border border-[var(--color-ink)]/10 p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div className="space-y-2">
                <select
                  className="select"
                  disabled={!editable}
                  value={rule.questionAKey}
                  onChange={(e) =>
                    update(rule.key, { questionAKey: e.target.value, valueA: "" })
                  }
                >
                  <option value="">If question…</option>
                  {eligible
                    .filter((q) => q.key !== rule.questionBKey)
                    .map((q) => (
                      <option key={q.key} value={q.key}>
                        {questionLabel(q.key)}
                      </option>
                    ))}
                </select>
                {rule.questionAKey &&
                  valueInput(rule.questionAKey, rule.valueA, (v) =>
                    update(rule.key, { valueA: v }),
                  )}
              </div>

              <div className="space-y-2">
                <select
                  className="select"
                  disabled={!editable}
                  value={rule.questionBKey}
                  onChange={(e) =>
                    update(rule.key, { questionBKey: e.target.value, valueB: "" })
                  }
                >
                  <option value="">…then question</option>
                  {eligible
                    .filter((q) => q.key !== rule.questionAKey)
                    .map((q) => (
                      <option key={q.key} value={q.key}>
                        {questionLabel(q.key)}
                      </option>
                    ))}
                </select>
                {rule.questionBKey &&
                  valueInput(rule.questionBKey, rule.valueB, (v) =>
                    update(rule.key, { valueB: v }),
                  )}
              </div>

              {editable && (
                <button
                  type="button"
                  className="btn btn-ghost text-sm text-[var(--color-accent)]"
                  onClick={() => remove(rule.key)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
