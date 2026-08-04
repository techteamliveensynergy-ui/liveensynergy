"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { GENDER_OPTIONS, GENDER_SELF_DESCRIBE } from "@/lib/constants";

/**
 * Gender picker with an open "self-describe" branch (3 Aug standup — Sakshi
 * asked for the standard options plus a free-text option, for inclusivity).
 *
 * The free-text box only appears once "Prefer to self-describe" is picked, and
 * posts to its own field so the standard options stay aggregatable.
 */
export function GenderField({
  defaultGender,
  defaultSelfDescribe,
}: {
  defaultGender?: string | null;
  defaultSelfDescribe?: string | null;
}) {
  const [gender, setGender] = useState(defaultGender ?? "");
  const selfDescribing = gender === GENDER_SELF_DESCRIBE;

  return (
    <>
      <Field label="Gender" htmlFor="gender">
        <select
          id="gender"
          name="gender"
          className="select"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
        >
          <option value="">Prefer not to answer</option>
          {GENDER_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>

      {selfDescribing && (
        <Field
          label="How would you describe it?"
          htmlFor="gender_self_describe"
          hint="In your own words. Only ever used in aggregate, never shown to sponsors."
        >
          <input
            id="gender_self_describe"
            name="gender_self_describe"
            className="input"
            defaultValue={defaultSelfDescribe ?? ""}
          />
        </Field>
      )}
    </>
  );
}
