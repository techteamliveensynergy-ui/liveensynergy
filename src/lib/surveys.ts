import type {
  SurveyQuestionConfig,
  SurveyQuestionOption,
  SurveyQuestionType,
} from "./types";
import type { FieldSpec } from "./admin-user-fields";

/**
 * Declarative catalogue of question types, mirroring the pattern
 * `admin-user-fields.ts` uses for role profiles: one source of truth the
 * Palette, the Inspector's per-type config fields, and the save-time
 * validator all read, instead of an 11-branch switch copied into each.
 */

export interface SurveyQuestionSpec {
  type: SurveyQuestionType;
  label: string;
  icon: string; // emoji glyph, matching NavItem's convention
  hint: string;
  /** Renders an options editor (add/remove/reorder label+value rows). */
  hasOptions: boolean;
  /** Whether this type shows a prompt field — false only for hidden_field. */
  hasPrompt: boolean;
  configFields: FieldSpec[];
}

/**
 * Whitelist of profile columns a `hidden_field` question may map to.
 * Declared before `SURVEY_QUESTION_TYPES` on purpose — that const's own
 * initializer reads this synchronously at module-eval time, so declaring it
 * afterwards is a real temporal-dead-zone bug (`next build` catches it,
 * `tsc --noEmit` alone doesn't).
 */
export const HIDDEN_FIELD_SOURCES: { value: string; label: string }[] = [
  { value: "profiles.full_name", label: "Full name" },
  { value: "profiles.email", label: "Email" },
  { value: "audience_members.phone", label: "Phone" },
  { value: "audience_members.country_of_residence", label: "Country of residence" },
  { value: "audience_members.gender", label: "Gender" },
];

export const SURVEY_QUESTION_TYPES: readonly SurveyQuestionSpec[] = [
  {
    type: "single_choice",
    label: "Single choice",
    icon: "🔘",
    hint: "Pick one option from a list.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [],
  },
  {
    type: "multiple_choice",
    label: "Multiple choice",
    icon: "☑️",
    hint: "Pick any number of options.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [
      { name: "min_select", label: "Minimum selections", type: "text" },
      { name: "max_select", label: "Maximum selections", type: "text" },
    ],
  },
  {
    type: "scale",
    label: "Rating / scale",
    icon: "📏",
    hint: "A numeric scale, e.g. 1–5.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [
      { name: "min", label: "Minimum", type: "text" },
      { name: "max", label: "Maximum", type: "text" },
      { name: "step", label: "Step", type: "text" },
      { name: "min_label", label: "Label at minimum", type: "text" },
      { name: "max_label", label: "Label at maximum", type: "text" },
    ],
  },
  {
    type: "yes_no",
    label: "Yes / No",
    icon: "✅",
    hint: "A single yes/no gate.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [],
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: "🔽",
    hint: "Pick one option from a select list.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [],
  },
  {
    type: "short_text",
    label: "Short text",
    icon: "✏️",
    hint: "A single-line answer.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [{ name: "max_length", label: "Max length", type: "text" }],
  },
  {
    type: "long_text",
    label: "Long text",
    icon: "📝",
    hint: "A paragraph-length answer.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [{ name: "max_length", label: "Max length", type: "text" }],
  },
  {
    type: "ranking",
    label: "Ranking",
    icon: "🔀",
    hint: "Respondent drags options into order.",
    hasOptions: true,
    hasPrompt: true,
    configFields: [],
  },
  {
    type: "number",
    label: "Number / slider",
    icon: "🔢",
    hint: "A numeric value within a range.",
    hasOptions: false,
    hasPrompt: true,
    configFields: [
      { name: "min", label: "Minimum", type: "text" },
      { name: "max", label: "Maximum", type: "text" },
      { name: "step", label: "Step", type: "text" },
    ],
  },
  {
    type: "attention_check",
    label: "Attention check",
    icon: "🎯",
    hint: "Scored, not reported to the brand — did they follow instructions?",
    hasOptions: true,
    hasPrompt: true,
    configFields: [
      {
        name: "expected_answer",
        label: "Expected answer (option value)",
        type: "text",
        hint: "Never shown to the brand; used only to score the response.",
      },
    ],
  },
  {
    type: "hidden_field",
    label: "Hidden / system field",
    icon: "🙈",
    hint: "Never rendered — prefilled from the respondent's own profile.",
    hasOptions: false,
    hasPrompt: false,
    configFields: [
      {
        name: "profile_field",
        label: "Profile field",
        type: "select",
        options: HIDDEN_FIELD_SOURCES.map((s) => s.value),
      },
    ],
  },
] as const;

export function questionSpec(type: SurveyQuestionType): SurveyQuestionSpec {
  const spec = SURVEY_QUESTION_TYPES.find((s) => s.type === type);
  if (!spec) throw new Error(`Unknown survey question type: ${type}`);
  return spec;
}

/** The client-side draft shape while a template is being edited/dragged. */
export interface SurveyQuestionDraft {
  /** Stable identity for dnd-kit and React keys: the row id, or a client uuid for new rows. */
  key: string;
  /** Set once the row has been saved at least once. */
  id: string | null;
  type: SurveyQuestionType;
  prompt: string;
  help_text: string;
  options: SurveyQuestionOption[];
  config: SurveyQuestionConfig;
  required: boolean;
}

function newDraftKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sensible per-type defaults for a freshly added question. */
export function newQuestionDraft(type: SurveyQuestionType): SurveyQuestionDraft {
  const spec = questionSpec(type);
  const base: SurveyQuestionDraft = {
    key: newDraftKey(),
    id: null,
    type,
    prompt: spec.hasPrompt ? "" : "",
    help_text: "",
    options: spec.hasOptions
      ? [
          { label: "Option 1", value: "option_1" },
          { label: "Option 2", value: "option_2" },
        ]
      : [],
    config: {},
    required: type !== "hidden_field",
  };

  if (type === "scale") {
    base.config = { min: 1, max: 5, min_label: "Not at all", max_label: "Extremely" };
  } else if (type === "number") {
    base.config = { min: 0, max: 10, step: 1 };
  } else if (type === "yes_no") {
    base.options = [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ];
  }

  return base;
}

export function questionRowToDraft(
  q: import("./types").SurveyQuestion,
): SurveyQuestionDraft {
  return {
    key: q.id,
    id: q.id,
    type: q.type,
    prompt: q.prompt ?? "",
    help_text: q.help_text ?? "",
    options: q.options ?? [],
    config: q.config ?? {},
    required: q.required,
  };
}

/**
 * Shared by the client (inline warnings) and the server action (authoritative
 * — the save payload is client-authored JSON, so the server must not trust
 * it as-is). Returns the first problem found, or null if the draft is valid.
 */
export function validateQuestions(drafts: SurveyQuestionDraft[]): string | null {
  if (drafts.length === 0) return "Add at least one question.";

  for (const [i, d] of drafts.entries()) {
    const n = i + 1;
    const spec = SURVEY_QUESTION_TYPES.find((s) => s.type === d.type);
    if (!spec) return `Question ${n}: unknown question type.`;
    if (spec.hasPrompt && !d.prompt.trim()) {
      return `Question ${n}: prompt is required.`;
    }
    if (spec.hasOptions) {
      const options = d.options.filter((o) => o.label.trim() && o.value.trim());
      if (options.length < 2) {
        return `Question ${n}: needs at least two options.`;
      }
      const values = options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
        return `Question ${n}: option values must be unique.`;
      }
    }
    if (d.type === "attention_check" && !d.config.expected_answer) {
      return `Question ${n}: set the expected answer for the attention check.`;
    }
    if (d.type === "hidden_field") {
      const source = d.config.profile_field;
      if (!source || !HIDDEN_FIELD_SOURCES.some((s) => s.value === source)) {
        return `Question ${n}: pick which profile field this hidden field maps to.`;
      }
    }
  }
  return null;
}
