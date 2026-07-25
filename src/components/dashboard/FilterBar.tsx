import Link from "next/link";

export interface FilterField {
  /** Query-string key, also the input's `name`. */
  name: string;
  label: string;
  /** `select` renders `options`; everything else is a native input type. */
  type: "text" | "month" | "date" | "select";
  placeholder?: string;
  options?: readonly string[];
  value?: string;
}

/**
 * A plain GET form — filtering is a navigation, so it works without JS and the
 * filtered view stays linkable and shareable.
 */
export function FilterBar({
  action,
  fields,
  active,
}: {
  action: string;
  fields: FilterField[];
  /** True when any filter is applied, so we can offer a reset. */
  active?: boolean;
}) {
  return (
    <form
      method="get"
      action={action}
      className="card mb-5 flex flex-wrap items-end gap-3 p-4"
    >
      {fields.map((f) => (
        <div key={f.name} className="min-w-[10rem] flex-1">
          <label className="field-label" htmlFor={`filter-${f.name}`}>
            {f.label}
          </label>
          {f.type === "select" ? (
            <select
              id={`filter-${f.name}`}
              name={f.name}
              className="select"
              defaultValue={f.value ?? ""}
            >
              <option value="">All</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`filter-${f.name}`}
              name={f.name}
              type={f.type}
              className="input"
              placeholder={f.placeholder}
              defaultValue={f.value ?? ""}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
        {active && (
          <Link href={action} className="btn btn-ghost">
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

/** Narrows a set of rows to a `YYYY-MM` month on the given date field. */
export function matchesMonth(value: string | null, month: string | undefined) {
  if (!month) return true;
  if (!value) return false;
  return value.slice(0, 7) === month;
}

/** Case-insensitive "contains", treating an empty needle as "no filter". */
export function matchesText(
  haystack: (string | null | undefined)[],
  needle: string | undefined,
) {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => (h ?? "").toLowerCase().includes(q));
}
