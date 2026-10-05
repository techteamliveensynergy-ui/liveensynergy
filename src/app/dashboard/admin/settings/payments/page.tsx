import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { maskKey, type PaymentMode } from "@/lib/payment-credentials";
import {
  ModeSwitchForm,
  ReverifyForm,
  SecretKeyForm,
  WebhookSecretForm,
} from "./CredentialForms";

export const metadata = { title: "Payment settings · Admin" };

/** Masked status only — payment_credentials_status() never returns ciphertext. */
interface CredentialStatus {
  mode: PaymentMode;
  has_secret_key: boolean;
  secret_key_last4: string | null;
  secret_key_kind: string | null;
  has_webhook_secret: boolean;
  webhook_secret_last4: string | null;
  stripe_account_id: string | null;
  stripe_account_name: string | null;
  verified_at: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

interface AuditRow {
  action: string;
  mode: string | null;
  detail: string | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  save_secret_key: "Saved secret key",
  save_webhook_secret: "Saved webhook secret",
  verify: "Re-verified key",
  set_mode: "Changed mode",
};

export default async function PaymentSettingsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [credResult, settingsResult, auditResult] = await Promise.all([
    supabase.rpc("payment_credentials_status"),
    supabase.rpc("payment_settings_status"),
    supabase
      .from("payment_settings_audit")
      .select("action, mode, detail, created_at, profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (credResult.error || settingsResult.error) {
    return (
      <div>
        <PageHeader title="Payment settings" />
        <p className="card p-6 text-sm text-[var(--color-ink-soft)]">
          Payment settings aren&apos;t set up on this database yet — migration
          0050 needs to be applied.
        </p>
      </div>
    );
  }

  const creds = (credResult.data ?? []) as CredentialStatus[];
  const credFor = (m: PaymentMode) => creds.find((c) => c.mode === m) ?? null;
  const settings = ((settingsResult.data ?? []) as {
    active_mode: PaymentMode;
    changed_at: string | null;
    changed_by_name: string | null;
  }[])[0];
  const activeMode: PaymentMode = settings?.active_mode ?? "test";
  const audit = (auditResult.data ?? []) as unknown as AuditRow[];

  const live = credFor("live");
  const test = credFor("test");
  const liveReady = !!live?.has_secret_key && !!live.verified_at;
  const accountMismatch =
    !!test?.stripe_account_id &&
    !!live?.stripe_account_id &&
    test.stripe_account_id !== live.stripe_account_id;

  return (
    <div>
      <PageHeader
        title="Payment settings"
        subtitle="Stripe keys for test and live, and which one is active. Keys are stored encrypted in Supabase Vault and can never be viewed again — only replaced."
      />

      <div
        className={`mb-6 rounded-2xl px-5 py-4 text-sm font-semibold ${
          activeMode === "live"
            ? "bg-[var(--color-brand)] text-white"
            : "bg-[var(--color-gold)] text-[var(--color-ink)]"
        }`}
      >
        {activeMode === "live"
          ? "LIVE mode — payments are real."
          : "TEST mode — payments are not real."}
        {settings?.changed_at && (
          <span className="ml-2 font-normal opacity-80">
            Set {formatDateTime(settings.changed_at)}
            {settings.changed_by_name ? ` by ${settings.changed_by_name}` : ""}.
          </span>
        )}
      </div>

      <p className="mb-6 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
        Nothing charges through Stripe yet — invoices are still marked paid by
        hand. These keys will be used when Stripe invoicing is switched on. Use
        Stripe <strong>restricted keys</strong> with only the access invoicing
        needs.
      </p>

      {accountMismatch && (
        <p className="mb-6 rounded-xl bg-[var(--color-gold)]/50 px-4 py-3 text-sm text-[var(--color-ink)]">
          The test and live keys belong to different Stripe accounts (
          {test?.stripe_account_id} vs {live?.stripe_account_id}). Check that
          this is intended.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {(["test", "live"] as PaymentMode[]).map((mode) => {
          const c = credFor(mode);
          return (
            <section key={mode} className="card space-y-5 p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  {mode === "live" ? "Live" : "Test"}
                </h2>
                {activeMode === mode && (
                  <span className="rounded-full bg-[var(--color-sage)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-olive-deep)]">
                    Active
                  </span>
                )}
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="field-label">Secret key</dt>
                  <dd className="font-mono">
                    {c?.has_secret_key
                      ? `${maskKey(mode, c.secret_key_kind, c.secret_key_last4)} · ${c.secret_key_kind ?? "secret"}`
                      : "Not set"}
                  </dd>
                  {c?.verified_at && (
                    <dd className="text-xs text-[var(--color-ink-soft)]">
                      Verified {formatDateTime(c.verified_at)}
                      {c.stripe_account_id
                        ? ` · ${c.stripe_account_name ? `${c.stripe_account_name} ` : ""}(${c.stripe_account_id})`
                        : ""}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="field-label">Webhook signing secret</dt>
                  <dd className="font-mono">
                    {c?.has_webhook_secret ? `whsec_••••${c.webhook_secret_last4 ?? "????"}` : "Not set"}
                  </dd>
                </div>
                {c?.updated_at && (
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Last changed {formatDateTime(c.updated_at)}
                    {c.updated_by_name ? ` by ${c.updated_by_name}` : ""}
                  </p>
                )}
              </dl>

              <div className="space-y-4 border-t border-black/10 pt-4">
                <SecretKeyForm mode={mode} disabled={false} hasKey={!!c?.has_secret_key} />
                {c?.has_secret_key && <ReverifyForm mode={mode} disabled={false} />}
                <WebhookSecretForm mode={mode} disabled={false} hasSecret={!!c?.has_webhook_secret} />
              </div>
            </section>
          );
        })}
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">Active mode</h2>
        <div className="mt-3">
          <ModeSwitchForm current={activeMode} liveReady={liveReady} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">Change log</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Every change is recorded here and every admin is notified. Key values
          are never logged.
        </p>
        {audit.length === 0 ? (
          <p className="card mt-3 p-5 text-sm text-[var(--color-ink-soft)]">No changes yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {audit.map((a, i) => (
              <li key={i} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span>
                  <span className="font-semibold">{ACTION_LABELS[a.action] ?? a.action}</span>
                  {a.mode ? ` · ${a.mode}` : ""}
                  {a.detail ? ` · ${a.detail}` : ""}
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {a.profiles?.full_name ?? "Unknown admin"} · {formatDateTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
