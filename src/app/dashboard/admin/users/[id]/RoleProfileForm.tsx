"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import {
  SOCIAL_FIELD_KEYS,
  type FieldSpec,
  type RoleProfileSpec,
} from "@/lib/admin-user-fields";
import type { Role } from "@/lib/constants";
import { updateUserRoleProfile, type AdminState } from "../../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}

type Record_ = Record<string, unknown>;

function value(record: Record_ | null, name: string): string {
  const v = record?.[name];
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function Control({ field, record }: { field: FieldSpec; record: Record_ | null }) {
  const id = `rp-${field.name}`;
  const defaultValue = value(record, field.name);

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
        <input
          type="checkbox"
          name={field.name}
          defaultChecked={record?.[field.name] === true}
          className="h-4 w-4"
        />
        {field.label}
      </label>
    );
  }

  return (
    <Field label={field.label} htmlFor={id} hint={field.hint}>
      {field.type === "textarea" ? (
        <textarea
          id={id}
          name={field.name}
          className="textarea"
          defaultValue={defaultValue}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          name={field.name}
          className="select"
          defaultValue={defaultValue}
        >
          <option value="">Not set</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.name}
          type={
            field.type === "list" || field.type === "text" ? "text" : field.type
          }
          className="input"
          defaultValue={defaultValue}
        />
      )}
    </Field>
  );
}

/**
 * Renders the editable role profile from a spec, so brands / artists /
 * organisers / audience members all share one implementation.
 */
export function RoleProfileForm({
  userId,
  role,
  spec,
  record,
}: {
  userId: string;
  role: Role;
  spec: RoleProfileSpec;
  record: Record_ | null;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(
    updateUserRoleProfile,
    {},
  );

  const socials = (record?.social_links ?? null) as Record<
    string,
    string
  > | null;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="role" value={role} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      {!record && (
        <p className="rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          This user hasn&apos;t completed their {spec.label.toLowerCase()} yet.
          Saving here will create it on their behalf.
        </p>
      )}

      {spec.sections.map((section) => (
        <section key={section.title} className="card p-6">
          <div className="mb-5">
            <h3 className="font-display text-base font-semibold text-[var(--color-ink)]">
              {section.title}
            </h3>
            {section.description && (
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                {section.description}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}>
                <Control field={field} record={record} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {spec.hasSocials && (
        <section className="card p-6">
          <h3 className="mb-5 font-display text-base font-semibold text-[var(--color-ink)]">
            Social links
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_FIELD_KEYS.map((key) => (
              <Field
                key={key}
                label={key === "x" ? "X (Twitter)" : key}
                htmlFor={`social_${key}`}
              >
                <input
                  id={`social_${key}`}
                  name={`social_${key}`}
                  type="text"
                  inputMode="url"
                  className="input capitalize-none"
                  defaultValue={socials?.[key] ?? ""}
                />
              </Field>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
