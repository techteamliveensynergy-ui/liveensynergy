"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ErrorBanner } from "@/components/onboarding/parts";
import { createAnalysisReport, type AnalysisState } from "./actions";

function Submit({ aiReady }: { aiReady: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? (aiReady ? "Analysing… this can take a minute" : "Working out the figures…") : "Analyse"}
    </button>
  );
}

export function NewReportForm({
  campaigns,
  aiReady,
}: {
  campaigns: { id: string; label: string }[];
  aiReady: boolean;
}) {
  const [state, formAction] = useActionState<AnalysisState, FormData>(createAnalysisReport, {});
  return (
    <form action={formAction} className="card space-y-4 p-6">
      <ErrorBanner error={state.error} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Survey results (CSV)</span>
          <input type="file" name="file" accept=".csv,text/csv" required className="input" />
          <span className="field-hint">
            Anonymised, one row per respondent — e.g. a survey&apos;s &ldquo;One row per respondent&rdquo; download.
            Up to 4 MB. Columns that look personal (names, emails, phones, IDs) are removed before anything is
            analysed or sent.
          </span>
        </label>
        <label className="block">
          <span className="field-label">Campaign</span>
          <select name="campaign_id" className="select" defaultValue="">
            <option value="">None — analyse the survey on its own</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Gives the analysis its context: the brand, the event and what the brand wanted from it.
          </span>
        </label>
      </div>
      <label className="block">
        <span className="field-label">Report title (optional)</span>
        <input name="title" maxLength={200} className="input" placeholder="Defaults to the campaign's name" />
      </label>
      <label className="block">
        <span className="field-label">Anything to focus on? (optional)</span>
        <textarea
          name="instructions"
          rows={3}
          maxLength={2000}
          className="textarea"
          placeholder="e.g. Compare first-timers with returning fans; the brand cares most about purchase intent."
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-ink-soft)]">
          {aiReady
            ? "Figures are worked out here; only those figures and a sample of written answers go to OpenAI for the write-up."
            : "OpenAI isn't connected yet (OPENAI_API_KEY), so reports will have the figures and charts but no write-up."}
        </p>
        <Submit aiReady={aiReady} />
      </div>
    </form>
  );
}
