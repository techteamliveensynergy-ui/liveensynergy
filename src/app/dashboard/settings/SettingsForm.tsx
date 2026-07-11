"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import {
  ErrorBanner,
  SuccessBanner,
} from "@/components/onboarding/parts";
import { updateAccount, type SettingsState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function SettingsForm({ fullName }: { fullName: string }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateAccount,
    {},
  );
  return (
    <form action={formAction} className="card grid gap-4 p-6">
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />
      <Field label="Full name" htmlFor="full_name" required>
        <input
          id="full_name"
          name="full_name"
          className="input"
          defaultValue={fullName}
          required
        />
      </Field>
      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
