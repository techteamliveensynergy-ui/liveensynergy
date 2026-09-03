"use client";

import { Field } from "@/components/ui/Field";
import { HIDDEN_FIELD_SOURCES, questionSpec, type SurveyQuestionDraft } from "@/lib/surveys";
import type { SurveyQuestionConfig } from "@/lib/types";
import { OptionListEditor } from "./OptionListEditor";

const NUMERIC_CONFIG_KEYS = new Set([
  "min",
  "max",
  "step",
  "min_select",
  "max_select",
  "max_length",
]);

export function QuestionInspector({
  question,
  editable,
  onChange,
}: {
  question: SurveyQuestionDraft | null;
  editable: boolean;
  onChange: (patch: Partial<SurveyQuestionDraft>) => void;
}) {
  if (!question) {
    return (
      <div className="card p-5 text-sm text-[var(--color-ink-soft)]">
        Select a question to edit it, or add one from the palette.
      </div>
    );
  }

  const spec = questionSpec(question.type);

  function setConfig(name: string, value: string) {
    const next = { ...question!.config } as Record<string, unknown>;
    if (value === "") {
      delete next[name];
    } else if (NUMERIC_CONFIG_KEYS.has(name)) {
      const n = Number(value);
      if (Number.isFinite(n)) next[name] = n;
      else delete next[name];
    } else {
      next[name] = value;
    }
    onChange({ config: next as SurveyQuestionConfig });
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-soft)]">
        <span aria-hidden>{spec.icon}</span>
        <span>{spec.label}</span>
      </div>

      {spec.hasPrompt && (
        <Field label="Prompt" htmlFor="q-prompt" required>
          <textarea
            id="q-prompt"
            className="textarea"
            disabled={!editable}
            value={question.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
          />
        </Field>
      )}

      <Field label="Help text" htmlFor="q-help">
        <input
          id="q-help"
          className="input"
          disabled={!editable}
          value={question.help_text}
          onChange={(e) => onChange({ help_text: e.target.value })}
        />
      </Field>

      {question.type !== "hidden_field" && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            disabled={!editable}
            checked={question.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
      )}

      {spec.hasOptions && (
        <OptionListEditor
          options={question.options}
          editable={editable}
          onChange={(options) => onChange({ options })}
        />
      )}

      {spec.configFields.map((field) => {
        const selectOptions =
          field.name === "profile_field"
            ? HIDDEN_FIELD_SOURCES
            : (field.options ?? []).map((o) => ({ value: o, label: o }));
        const rawValue = (question.config as Record<string, unknown>)[field.name];

        return (
          <Field key={field.name} label={field.label} htmlFor={`q-${field.name}`} hint={field.hint}>
            {field.type === "select" ? (
              <select
                id={`q-${field.name}`}
                className="select"
                disabled={!editable}
                value={String(rawValue ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              >
                <option value="">Choose…</option>
                {selectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`q-${field.name}`}
                type={NUMERIC_CONFIG_KEYS.has(field.name) ? "number" : "text"}
                className="input"
                disabled={!editable}
                value={String(rawValue ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
