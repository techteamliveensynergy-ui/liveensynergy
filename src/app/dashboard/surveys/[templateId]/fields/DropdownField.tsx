"use client";

import { offersOther, otherLabel, SURVEY_OTHER_VALUE } from "@/lib/surveys";
import { OtherInput } from "./OtherInput";
import type { FieldProps } from "./types";

export function DropdownField({ question, value, onChange, otherText = "", onOtherTextChange }: FieldProps) {
  const other = offersOther(question);
  return (
    <>
      <select
        className="select"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {(question.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {other && <option value={SURVEY_OTHER_VALUE}>{otherLabel(question.config)}</option>}
      </select>
      {other && value === SURVEY_OTHER_VALUE && onOtherTextChange && (
        <OtherInput label={otherLabel(question.config)} value={otherText} onChange={onOtherTextChange} />
      )}
    </>
  );
}
