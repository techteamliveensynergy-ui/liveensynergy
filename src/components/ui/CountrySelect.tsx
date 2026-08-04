"use client";

import { useId } from "react";
import { COUNTRIES } from "@/lib/countries";

/**
 * Searchable country picker.
 *
 * A native `<input list>` + `<datalist>` rather than a `<select>` or a
 * combobox library: you can type to filter (which is what was asked for), it
 * needs no JavaScript to work, and it stays consistent with the plain-CSS
 * `.input` primitives the rest of the forms use.
 *
 * The trade-off is that the browser doesn't enforce the list, so a typo can
 * still be submitted. `list` + `pattern`-free is deliberate — rejecting an
 * unlisted country would lock out anyone whose country we've spelled
 * differently. The suggestions do the work of keeping the data tidy.
 */
export function CountrySelect({
  id,
  name = "country_of_residence",
  defaultValue,
  required = false,
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const generatedId = useId();
  const listId = `${generatedId}-countries`;

  return (
    <>
      <input
        id={id ?? name}
        name={name}
        className="input"
        list={listId}
        required={required}
        autoComplete="country-name"
        placeholder="Start typing…"
        defaultValue={defaultValue ?? ""}
      />
      <datalist id={listId}>
        {COUNTRIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
