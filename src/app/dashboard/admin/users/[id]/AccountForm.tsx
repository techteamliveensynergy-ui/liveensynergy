"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import { ROLE_LABELS } from "@/lib/constants";
import type { Plan, Profile } from "@/lib/types";
import { updateUserAccount, type AdminState } from "../../actions";

const ALL_ROLES = ["brand", "artist", "event", "audience", "admin"] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save account"}
    </button>
  );
}

export function AccountForm({
  user,
  plans,
}: {
  user: Profile;
  plans: Plan[];
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(
    updateUserAccount,
    {},
  );

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input type="hidden" name="user_id" value={user.id} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <input
            id="full_name"
            name="full_name"
            className="input"
            defaultValue={user.full_name ?? ""}
          />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          hint="Display only — this does not change their sign-in email."
        >
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            defaultValue={user.email ?? ""}
          />
        </Field>
        <Field label="Role" htmlFor="role" required>
          <select
            id="role"
            name="role"
            className="select"
            defaultValue={user.role}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plan" htmlFor="plan_id">
          <select
            id="plan_id"
            name="plan_id"
            className="select"
            defaultValue={user.plan_id ?? ""}
          >
            <option value="">No plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="onboarding_completed"
          defaultChecked={user.onboarding_completed}
          className="h-4 w-4"
        />
        Onboarding completed
      </label>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
