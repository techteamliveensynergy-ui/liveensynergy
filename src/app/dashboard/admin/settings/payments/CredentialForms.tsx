"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  reverifySecretKey,
  saveSecretKey,
  saveWebhookSecret,
  setPaymentMode,
  type PaymentSettingsState,
} from "./actions";

type Mode = "test" | "live";

function Submit({ label, pendingLabel, disabled, variant = "primary" }: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-ghost"} text-sm`}
      disabled={disabled || pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function Result({ state }: { state: PaymentSettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-lg bg-[var(--color-sage)]/60 px-3 py-2 text-sm text-[var(--color-olive-deep)]">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Write-only: the input is a password field, never pre-filled, and React
 * resets the form after the action runs — the key leaves the browser once and
 * is never sent back.
 */
export function SecretKeyForm({ mode, disabled, hasKey }: { mode: Mode; disabled: boolean; hasKey: boolean }) {
  const [state, action] = useActionState<PaymentSettingsState, FormData>(saveSecretKey, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="mode" value={mode} />
      <label className="field-label" htmlFor={`secret_key_${mode}`}>
        {hasKey ? "Replace secret key" : "Secret key"}
      </label>
      <input
        id={`secret_key_${mode}`}
        name="secret_key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="input font-mono text-sm"
        placeholder={`rk_${mode}_… (restricted key recommended)`}
        disabled={disabled}
        required
      />
      <Submit label="Save & verify with Stripe" pendingLabel="Checking with Stripe…" disabled={disabled} />
      <Result state={state} />
    </form>
  );
}

export function WebhookSecretForm({ mode, disabled, hasSecret }: { mode: Mode; disabled: boolean; hasSecret: boolean }) {
  const [state, action] = useActionState<PaymentSettingsState, FormData>(saveWebhookSecret, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="mode" value={mode} />
      <label className="field-label" htmlFor={`webhook_secret_${mode}`}>
        {hasSecret ? "Replace webhook signing secret" : "Webhook signing secret"}
      </label>
      <input
        id={`webhook_secret_${mode}`}
        name="webhook_secret"
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="input font-mono text-sm"
        placeholder="whsec_…"
        disabled={disabled}
        required
      />
      <Submit label="Save secret" pendingLabel="Saving…" disabled={disabled} variant="ghost" />
      <Result state={state} />
    </form>
  );
}

export function ReverifyForm({ mode, disabled }: { mode: Mode; disabled: boolean }) {
  const [state, action] = useActionState<PaymentSettingsState, FormData>(reverifySecretKey, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="mode" value={mode} />
      <Submit label="Re-verify with Stripe" pendingLabel="Checking…" disabled={disabled} variant="ghost" />
      <Result state={state} />
    </form>
  );
}

export function ModeSwitchForm({ current, liveReady }: { current: Mode; liveReady: boolean }) {
  const [state, action] = useActionState<PaymentSettingsState, FormData>(setPaymentMode, {});
  const target: Mode = current === "live" ? "test" : "live";
  const blocked = target === "live" && !liveReady;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="mode" value={target} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        {target === "live"
          ? "Switch to Live: new invoices will use the live Stripe account and real money."
          : "Switch back to Test: new invoices will use the test Stripe account — no real money moves."}
      </p>
      {blocked && (
        <p className="text-sm text-[var(--color-accent)]">
          Save and verify a live secret key first.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirm"
          className="input w-40 font-mono text-sm"
          placeholder={`Type ${target.toUpperCase()}`}
          autoComplete="off"
          disabled={blocked}
          required
        />
        <Submit
          label={`Switch to ${target === "live" ? "Live" : "Test"}`}
          pendingLabel="Switching…"
          disabled={blocked}
          variant={target === "live" ? "primary" : "ghost"}
        />
      </div>
      <Result state={state} />
    </form>
  );
}
