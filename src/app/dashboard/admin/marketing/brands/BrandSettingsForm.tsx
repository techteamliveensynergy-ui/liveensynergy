"use client";

import { useActionState } from "react";
import { PendingSubmit } from "@/components/ui/PendingSubmit";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { DEFAULT_ACCENT, type BrandTokens } from "@/lib/marketing/blocks";
import { saveBrandMarketingSettings, setBrandMarketingPause, type MarketingState } from "../actions";

type Own = {
  logo_url: string;
  accent_color: string;
  background: "light" | "dark";
  font_stack: string;
  footer_legal: string;
  physical_address: string;
  reply_to: string;
};

function Msg({ state }: { state: MarketingState }) {
  if (state.error) return <p role="alert" className="text-sm text-[var(--color-accent)]">{state.error}</p>;
  if (state.message) return <p className="text-sm font-semibold">✓ {state.message}</p>;
  return null;
}

export function BrandSettingsForm({
  brandId,
  brandName,
  own,
  effective,
}: {
  brandId: string;
  brandName: string;
  own: Own;
  effective: BrandTokens;
}) {
  const [state, action] = useActionState<MarketingState, FormData>(saveBrandMarketingSettings, {});
  return (
    <form action={action} className="card space-y-4 p-4" key={brandId}>
      <input type="hidden" name="brand_id" value={brandId} />
      <h2 className="font-semibold text-[var(--color-ink)]">{brandName}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="field-label">Logo (https:// image)</span>
          <input name="logo_url" defaultValue={own.logo_url} maxLength={1000} className="input mt-1" />
          <span className="field-hint">Blank uses the profile logo{effective.logo_url && !own.logo_url ? " (set)" : ""}.</span>
        </label>
        <label className="block text-sm">
          <span className="field-label">Accent colour</span>
          <input name="accent_color" defaultValue={own.accent_color} placeholder={DEFAULT_ACCENT} pattern="#[0-9a-fA-F]{6}" className="input mt-1 font-mono" />
          <span className="field-hint">Buttons and the promo box. Text on it turns black or white automatically.</span>
        </label>
        <label className="block text-sm">
          <span className="field-label">Background</span>
          <select name="background" defaultValue={own.background} className="select mt-1">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <span className="field-hint">Inboxes in dark mode get the dark version either way.</span>
        </label>
        <label className="block text-sm">
          <span className="field-label">Font stack</span>
          <input name="font_stack" defaultValue={own.font_stack} placeholder={effective.font_stack} maxLength={200} className="input mt-1" />
          <span className="field-hint">Email-safe fonts only, e.g. Georgia, serif.</span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="field-label">Physical postal address (required to send)</span>
        <textarea name="physical_address" defaultValue={own.physical_address} maxLength={300} rows={2} className="textarea mt-1" />
        <span className="field-hint">
          The law (UK PECR / US CAN-SPAM) requires it in every marketing email.
          {!own.physical_address && effective.physical_address ? ` Currently using the company address: “${effective.physical_address}”.` : ""}
          {!effective.physical_address ? " None on file — campaigns for this brand can't be sent until one is added." : ""}
        </span>
      </label>
      <label className="block text-sm">
        <span className="field-label">Footer legal line (optional)</span>
        <input name="footer_legal" defaultValue={own.footer_legal} maxLength={500} className="input mt-1" placeholder="© Brand Ltd, registered in England no. 01234567" />
      </label>
      <label className="block text-sm">
        <span className="field-label">Reply-to address</span>
        <input name="reply_to" type="email" defaultValue={own.reply_to} maxLength={254} className="input mt-1" placeholder={effective.reply_to ?? ""} />
        <span className="field-hint">Where replies go. Blank uses the brand&rsquo;s manager or billing email.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <PendingSubmit label="Save brand settings" pendingLabel="Saving…" className="btn btn-primary text-sm" />
        <Msg state={state} />
      </div>
    </form>
  );
}

export function BrandPauseForm({ brandId, paused }: { brandId: string; paused: boolean }) {
  const [state, action] = useActionState<MarketingState, FormData>(setBrandMarketingPause, {});
  return (
    <form action={action} className="card space-y-3 p-4" key={`${brandId}-${paused}`}>
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="op" value={paused ? "resume" : "pause"} />
      <h2 className="font-semibold text-[var(--color-ink)]">{paused ? "Resume sending" : "Pause all sending for this brand"}</h2>
      {!paused && (
        <label className="block text-sm">
          <span className="field-label">Why (other admins see this)</span>
          <input name="reason" maxLength={300} className="input mt-1" placeholder="e.g. brand asked us to hold promotions" />
        </label>
      )}
      <ConfirmSubmit
        label={paused ? "Resume sending" : "Pause sending"}
        pendingLabel="Working…"
        className={paused ? "btn btn-primary text-sm" : "btn btn-dark text-sm"}
        title={paused ? "Resume this brand's sending?" : "Pause this brand's sending?"}
        body={
          <p>
            {paused
              ? "New campaigns can be scheduled again. Paused campaigns stay paused until you resume each one."
              : "Its scheduled and sending campaigns pause straight away, and none can be scheduled until you resume."}
          </p>
        }
        confirmLabel={paused ? "Yes, resume" : "Yes, pause"}
        danger={!paused}
      />
      <Msg state={state} />
    </form>
  );
}
