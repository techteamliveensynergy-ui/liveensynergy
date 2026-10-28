"use client";

import { useState } from "react";
import type { SurveyQuestionDraft } from "@/lib/surveys";
import type { SurveyQuestionConfig } from "@/lib/types";
import {
  SENSITIVE_CATEGORIES,
  sensitiveFlags,
  unacknowledgedFlags,
  type SensitiveAck,
} from "@/lib/survey-sensitive";

/**
 * Warns while a question is being written that it may collect special-
 * category or identifying data (GitHub #54). A warning, never a block: the
 * admin confirms with a reason, stored on the question, and the warning
 * returns only if a rewording picks up a new category.
 */
export function SensitiveDataNotice({
  question,
  editable,
  onChange,
}: {
  question: SurveyQuestionDraft;
  editable: boolean;
  onChange: (patch: Partial<SurveyQuestionDraft>) => void;
}) {
  const flags = sensitiveFlags(question);
  const ack = question.config.sensitive_ack as SensitiveAck | undefined;
  const open = unacknowledgedFlags(flags, ack);
  const [reason, setReason] = useState(ack?.reason ?? "");

  if (flags.length === 0) return null;

  const labels = flags.map((f) => SENSITIVE_CATEGORIES[f].label);

  if (open.length === 0) {
    return (
      <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-xs text-[var(--color-olive-deep)]">
        Sensitive topic acknowledged ({labels.join(", ")}): {ack?.reason}
      </p>
    );
  }

  function acknowledge() {
    const next: SurveyQuestionConfig = {
      ...question.config,
      sensitive_ack: { flags, reason: reason.trim(), at: new Date().toISOString() },
    };
    onChange({ config: next });
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-pink)] p-3 text-sm">
      <p className="font-semibold text-[var(--color-accent)]">This may collect special-category or identifying data</p>
      <p className="text-[var(--color-ink)]">
        It mentions: <strong>{open.map((f) => SENSITIVE_CATEGORIES[f].label).join(", ")}</strong>. Under UK GDPR you
        need an Article 9 condition (usually explicit consent) for special-category data, and it must be covered in
        the survey terms. Check with your data-protection lead — this is a word check, not legal advice.
      </p>
      {editable && (
        <>
          <textarea
            className="textarea text-sm"
            rows={2}
            placeholder="Why it's needed and how it's covered (e.g. 'Optional; explicit consent wording in survey terms v2')"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button type="button" className="btn btn-ghost text-sm" disabled={!reason.trim()} onClick={acknowledge}>
            Acknowledge — this is intended
          </button>
          <p className="field-hint">Saved with the question when you save the survey.</p>
        </>
      )}
    </div>
  );
}
