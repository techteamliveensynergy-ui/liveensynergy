"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/countries";

/**
 * Searchable country dropdown.
 *
 * This was a native `<input list>` + `<datalist>` to start with, on the
 * reasoning that it needs no JavaScript. In practice browsers render that
 * suggestion popup wherever they like — it appeared off to the side of the
 * field rather than beneath it, and looked nothing like the rest of the form.
 * So it's a proper combobox: type to filter, click or use the arrow keys to
 * choose, and the list is a panel anchored under the input.
 *
 * The visible input carries the submitted value, so an unlisted country typed
 * by hand still saves. Rejecting anything off-list would lock out anyone whose
 * country we happen to have spelled differently.
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
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const query = value.trim().toLowerCase();
  // An exact match means they've already chosen — show the whole list again so
  // the field can be changed, rather than one lonely option.
  const isExact = COUNTRIES.some((c) => c.toLowerCase() === query);
  const matches =
    query === "" || isExact
      ? COUNTRIES
      : COUNTRIES.filter((c) => c.toLowerCase().includes(query));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the keyboard-highlighted option in view while arrowing through.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (country: string) => {
    setValue(country);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id ?? name}
        name={name}
        className="input"
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Start typing, or pick from the list"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            // Choosing must never submit the form it sits in.
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg"
        >
          {matches.map((country, i) => (
            <li
              key={country}
              role="option"
              aria-selected={country === value}
              // mousedown, not click: the input's blur would otherwise close
              // the list before the click ever lands.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(country);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3.5 py-1.5 text-sm ${
                i === active
                  ? "bg-[var(--color-mist)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-soft)]"
              } ${country === value ? "font-semibold" : ""}`}
            >
              {country}
            </li>
          ))}
        </ul>
      )}

      {open && matches.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-[var(--color-ink-soft)] shadow-lg">
          No country matches “{value.trim()}”.
        </div>
      )}
    </div>
  );
}
