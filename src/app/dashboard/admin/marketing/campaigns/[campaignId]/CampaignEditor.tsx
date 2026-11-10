"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { PendingSubmit } from "@/components/ui/PendingSubmit";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import {
  fillMergeFields,
  MAX_STEPS,
  MIN_STEPS,
  type BrandTokens,
  type CampaignContent,
  type ContentBlock,
} from "@/lib/marketing/blocks";
import { renderCampaignEmail } from "@/lib/marketing/render";
import {
  changeMarketingCampaign,
  saveMarketingCampaign,
  scheduleMarketingCampaign,
  sendMarketingTest,
  generateMarketingDraft,
  type MarketingState,
} from "../../actions";

export interface EditorCampaign {
  id: string;
  name: string;
  subject: string;
  preview_text: string;
  content: CampaignContent;
  segment: { type: "all" | "events"; event_ids?: string[] };
}

const BLOCK_LABEL: Record<ContentBlock["type"], string> = {
  hero: "Hero (headline, text, image)",
  steps: "Steps (2–5)",
  promo: "Promo code",
  cta: "Button / link",
};

function newBlock(type: ContentBlock["type"]): ContentBlock {
  switch (type) {
    case "hero":
      return { type: "hero", headline: "", body: "" };
    case "steps":
      return { type: "steps", title: "", steps: [{ lead: "", text: "" }, { lead: "", text: "" }] };
    case "promo":
      return { type: "promo", code: "", discount: "" };
    case "cta":
      return { type: "cta", label: "", url: "", style: "button" };
  }
}

function Result({ state }: { state: MarketingState }) {
  if (state.error) {
    return (
      <div role="alert" className="text-sm text-[var(--color-accent)]">
        <p>{state.error}</p>
        {state.problems && (
          <ul className="mt-1 list-disc pl-5">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (state.message) return <p className="text-sm font-semibold text-[var(--color-ink)]">✓ {state.message}</p>;
  return null;
}

export function CampaignEditor({
  campaign,
  tokens,
  events,
  audienceCount,
  problems,
  adminEmail,
  adminFirstName,
  aiConfigured,
}: {
  campaign: EditorCampaign;
  tokens: BrandTokens;
  events: { id: string; label: string }[];
  audienceCount: number;
  /** What stops the SAVED version being sent (server-checked). */
  problems: string[];
  adminEmail: string;
  adminFirstName: string | null;
  /** OPENAI_API_KEY is set, so "Generate with AI" can run. */
  aiConfigured: boolean;
}) {
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [previewText, setPreviewText] = useState(campaign.preview_text);
  const [content, setContent] = useState<CampaignContent>(campaign.content);
  const [segmentType, setSegmentType] = useState<"all" | "events">(campaign.segment.type);
  const [eventIds, setEventIds] = useState<string[]>(campaign.segment.event_ids ?? []);
  const [dark, setDark] = useState(tokens.background === "dark");

  // "Generate with AI": the draft replaces the words and blocks as UNSAVED
  // changes (partner logo kept), so the admin reviews it in the preview first.
  const [genState, genAction] = useActionState<MarketingState, FormData>(generateMarketingDraft, {});
  useEffect(() => {
    const d = genState.draft;
    if (!d) return;
    setSubject(d.subject);
    setPreviewText(d.preview_text);
    setContent((c) => ({
      partner_name: d.content.partner_name ?? c.partner_name,
      partner_logo_url: c.partner_logo_url,
      blocks: d.content.blocks,
    }));
  }, [genState]);
  const existingPromo = content.blocks.find((b) => b.type === "promo");
  const existingCta = content.blocks.find((b) => b.type === "cta");
  // Open the panel on a blank campaign; fixed after mount so it doesn't snap shut when a draft arrives.
  const [startsEmpty] = useState(
    () => !campaign.subject.trim() && !campaign.content.blocks.some((b) => b.type === "hero" && (b.headline.trim() || b.body.trim())),
  );
  const hasWords = !!subject.trim() || content.blocks.some((b) => (b.type === "hero" ? b.headline.trim() || b.body.trim() : b.type !== "cta"));

  const snapshot = useMemo(
    () => JSON.stringify({ name, subject, previewText, content, segmentType, eventIds: [...eventIds].sort() }),
    [name, subject, previewText, content, segmentType, eventIds],
  );
  const [savedSnap, setSavedSnap] = useState(() =>
    JSON.stringify({
      name: campaign.name,
      subject: campaign.subject,
      previewText: campaign.preview_text,
      content: campaign.content,
      segmentType: campaign.segment.type,
      eventIds: [...(campaign.segment.event_ids ?? [])].sort(),
    }),
  );
  // What was in the form when Save was pressed — becomes "saved" on success.
  const submitted = useRef<string | null>(null);
  const [saveState, saveAction] = useActionState<MarketingState, FormData>(saveMarketingCampaign, {});
  useEffect(() => {
    if (saveState.message && submitted.current) setSavedSnap(submitted.current);
  }, [saveState]);
  const dirty = snapshot !== savedSnap;

  const [testState, testAction] = useActionState<MarketingState, FormData>(sendMarketingTest, {});
  const [schedState, schedAction] = useActionState<MarketingState, FormData>(scheduleMarketingCampaign, {});
  const [nowState, nowAction] = useActionState<MarketingState, FormData>(scheduleMarketingCampaign, {});
  const [cancelState, cancelAction] = useActionState<MarketingState, FormData>(changeMarketingCampaign, {});

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const html = useMemo(
    () =>
      renderCampaignEmail({
        subject,
        previewText,
        content,
        tokens,
        firstName: adminFirstName,
        unsubscribeUrl: "https://example.invalid/unsubscribe-preview",
        forceDark: dark,
      }).html,
    [subject, previewText, content, tokens, adminFirstName, dark],
  );

  const setBlock = (i: number, b: ContentBlock) => setContent((c) => ({ ...c, blocks: c.blocks.map((x, j) => (j === i ? b : x)) }));
  const move = (i: number, d: -1 | 1) =>
    setContent((c) => {
      const blocks = [...c.blocks];
      const j = i + d;
      if (j < 0 || j >= blocks.length) return c;
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...c, blocks };
    });
  const remove = (i: number) => setContent((c) => ({ ...c, blocks: c.blocks.filter((_, j) => j !== i) }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
      {/* ------------------------------------------------------------- editor */}
      <div className="space-y-5">
        <details className="card p-4" open={startsEmpty}>
          <summary className="cursor-pointer font-semibold text-[var(--color-ink)]">✨ Generate with AI</summary>
          {!aiConfigured ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              AI writing isn&rsquo;t set up yet (it uses the same OpenAI key as survey reports, <code>OPENAI_API_KEY</code>). You can still
              write the email below.
            </p>
          ) : (
            <form
              action={genAction}
              onSubmit={(e) => {
                if (hasWords && !window.confirm("Replace the current subject, preview text and blocks with a new draft? Nothing is saved until you press Save.")) {
                  e.preventDefault();
                }
              }}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <input type="hidden" name="partner_name" value={content.partner_name ?? ""} />
              {segmentType === "events" && eventIds.map((id) => <input key={id} type="hidden" name="event_ids" value={id} />)}
              <label className="block text-sm">
                <span className="field-label">What&rsquo;s the email about?</span>
                <textarea
                  name="brief"
                  required
                  minLength={15}
                  maxLength={2000}
                  rows={3}
                  className="textarea mt-1"
                  placeholder="e.g. Thank people who came to the Camden show and offer them JH Audio in-ear monitors at a discount this month."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="field-label">Tone</span>
                  <select name="tone" defaultValue="friendly" className="select mt-1">
                    <option value="friendly">Friendly</option>
                    <option value="premium">Premium</option>
                    <option value="energetic">Energetic</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="field-label">Promo code (optional)</span>
                  <input name="promo_code" defaultValue={existingPromo?.type === "promo" ? existingPromo.code : ""} maxLength={40} className="input mt-1 font-mono" />
                </label>
                <label className="block text-sm">
                  <span className="field-label">Worth</span>
                  <input
                    name="promo_discount"
                    defaultValue={existingPromo?.type === "promo" ? existingPromo.discount : ""}
                    maxLength={80}
                    className="input mt-1"
                    placeholder="20% off"
                  />
                </label>
                <label className="block text-sm">
                  <span className="field-label">Expiry (optional)</span>
                  <input
                    name="promo_expiry"
                    defaultValue={existingPromo?.type === "promo" ? existingPromo.expiry ?? "" : ""}
                    maxLength={80}
                    className="input mt-1"
                    placeholder="Ends 31 December"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="field-label">Button link (https://, optional)</span>
                  <input name="link_url" defaultValue={existingCta?.type === "cta" ? existingCta.url : ""} maxLength={1000} className="input mt-1" />
                </label>
              </div>
              <input type="hidden" name="link_label" value={existingCta?.type === "cta" ? existingCta.label : ""} />
              <p className="field-hint">
                The AI writes the words only. The code, what it&rsquo;s worth, the expiry and the link are used exactly as you type them —
                it never makes up an offer. You&rsquo;ll see the draft in the preview before anything is saved.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <PendingSubmit label={hasWords ? "Rewrite draft" : "Generate draft"} pendingLabel="Writing… (up to a minute)" className="btn btn-dark text-sm" />
                <Result state={genState} />
              </div>
            </form>
          )}
        </details>
        <form
          action={saveAction}
          onSubmit={() => {
            submitted.current = snapshot;
          }}
          className="space-y-5"
        >
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <input type="hidden" name="content" value={JSON.stringify(content)} />

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold text-[var(--color-ink)]">Envelope</h2>
            <label className="block text-sm">
              <span className="field-label">Campaign name (team only)</span>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="input mt-1" />
            </label>
            <label className="block text-sm">
              <span className="field-label">Subject line</span>
              <input
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="input mt-1"
                placeholder="e.g. Your 20% off from {{first_name}}'s favourite gig"
              />
              <span className="field-hint">From: “{tokens.brand_name}”. Use {"{{first_name}}"} to greet people by name (“there” when unknown).</span>
            </label>
            <label className="block text-sm">
              <span className="field-label">Preview text</span>
              <input
                name="preview_text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                maxLength={200}
                className="input mt-1"
                placeholder="The line inboxes show after the subject"
              />
            </label>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold text-[var(--color-ink)]">Who gets it</h2>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="segment_type" value="all" checked={segmentType === "all"} onChange={() => setSegmentType("all")} className="mt-1" />
              <span>Everyone subscribed to {tokens.brand_name}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="segment_type"
                value="events"
                checked={segmentType === "events"}
                onChange={() => setSegmentType("events")}
                className="mt-1"
              />
              <span>Only people who agreed at these events:</span>
            </label>
            {segmentType === "events" && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-black/10 p-2">
                {events.length === 0 && <p className="text-sm text-[var(--color-ink-soft)]">This brand has no events yet.</p>}
                {events.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="event_ids"
                      value={e.id}
                      checked={eventIds.includes(e.id)}
                      onChange={(ev) => setEventIds((ids) => (ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id)))}
                    />
                    {e.label}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-[var(--color-ink-soft)]">
              Saved audience right now: <strong>{audienceCount}</strong> {audienceCount === 1 ? "person" : "people"} (subscribed, not
              unsubscribed or bounced). Save to update. The list is taken again when sending starts, and each batch re-checks it.
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold text-[var(--color-ink)]">Co-brand header (optional)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="field-label">Partner name</span>
                <input
                  value={content.partner_name ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, partner_name: e.target.value || undefined }))}
                  maxLength={80}
                  className="input mt-1"
                  placeholder="e.g. JH Audio"
                />
              </label>
              <label className="block text-sm">
                <span className="field-label">Partner logo (https:// image)</span>
                <input
                  value={content.partner_logo_url ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, partner_logo_url: e.target.value || undefined }))}
                  maxLength={1000}
                  className="input mt-1"
                />
              </label>
            </div>
          </section>

          {content.blocks.map((b, i) => (
            <section key={i} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-[var(--color-ink)]">
                  {i + 1}. {BLOCK_LABEL[b.type]}
                </h2>
                <div className="flex gap-1 text-xs">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="btn btn-ghost px-2 py-1 text-xs" aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === content.blocks.length - 1}
                    className="btn btn-ghost px-2 py-1 text-xs"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => remove(i)} className="btn btn-ghost px-2 py-1 text-xs text-[var(--color-accent)]">
                    Remove
                  </button>
                </div>
              </div>
              <BlockFields block={b} onChange={(nb) => setBlock(i, nb)} />
            </section>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--color-ink-soft)]">Add:</span>
            {(Object.keys(BLOCK_LABEL) as ContentBlock["type"][]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setContent((c) => ({ ...c, blocks: [...c.blocks, newBlock(t)] }))}
                className="btn btn-ghost text-xs"
                disabled={content.blocks.length >= 10}
              >
                + {BLOCK_LABEL[t].split(" (")[0]}
              </button>
            ))}
          </div>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-black/10 bg-[var(--color-mist)] px-1 py-3">
            <PendingSubmit label={dirty ? "Save draft" : "Saved"} pendingLabel="Saving…" className="btn btn-primary text-sm" />
            {dirty && <span className="text-xs text-[var(--color-accent)]">Unsaved changes</span>}
            <Result state={saveState} />
          </div>
        </form>

        {/* ------------------------------------------------- test + schedule */}
        <section className="card space-y-4 p-4">
          <h2 className="font-semibold text-[var(--color-ink)]">Test and send</h2>
          {dirty && <p className="text-sm text-[var(--color-accent)]">Save your changes first — tests and sends use the saved version.</p>}
          {!dirty && problems.length > 0 && (
            <div className="text-sm">
              <p className="font-semibold text-[var(--color-ink)]">Before this can be sent:</p>
              <ul className="mt-1 list-disc pl-5 text-[var(--color-accent)]">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <form action={testAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <label className="block text-sm">
              <span className="field-label">Send a test to</span>
              <input name="to" defaultValue={adminEmail} className="input mt-1" placeholder="you@example.com, colleague@example.com" />
              <span className="field-hint">Up to 5 addresses. Subject starts with [TEST]; the unsubscribe link works for your own account.</span>
            </label>
            {dirty ? (
              <button type="button" disabled className="btn btn-ghost text-sm">
                Send test
              </button>
            ) : (
              <PendingSubmit label="Send test" pendingLabel="Sending…" className="btn btn-ghost text-sm" />
            )}
            <div className="sm:col-span-2">
              <Result state={testState} />
            </div>
          </form>

          <form action={schedAction} className="grid gap-2 border-t border-black/10 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <label className="block text-sm">
              <span className="field-label">Schedule for (UK time)</span>
              <input type="datetime-local" name="scheduled_at" className="input mt-1" />
            </label>
            {dirty ? (
              <button type="button" disabled className="btn btn-primary text-sm">
                Schedule
              </button>
            ) : (
              <PendingSubmit label="Schedule" pendingLabel="Scheduling…" className="btn btn-primary text-sm" />
            )}
            <div className="sm:col-span-2">
              <Result state={schedState} />
            </div>
          </form>

          <div className="flex flex-wrap items-start gap-3 border-t border-black/10 pt-4">
            <form action={nowAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <input type="hidden" name="when" value="now" />
              {dirty ? (
                <button type="button" disabled className="btn btn-dark text-sm">
                  Send now
                </button>
              ) : (
                <ConfirmSubmit
                  label="Send now"
                  pendingLabel="Starting…"
                  className="btn btn-dark text-sm"
                  title={`Send “${subject || campaign.name}” now?`}
                  body={
                    <p>
                      It goes to about {audienceCount} {audienceCount === 1 ? "person" : "people"} subscribed to {tokens.brand_name}, in
                      batches. You can pause it while it sends, but emails already sent can&rsquo;t be recalled.
                    </p>
                  }
                  confirmLabel="Yes, send it"
                />
              )}
            </form>
            <form action={cancelAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <input type="hidden" name="op" value="cancel" />
              <ConfirmSubmit
                label="Cancel campaign"
                pendingLabel="Cancelling…"
                className="btn btn-ghost text-sm"
                title="Cancel this draft?"
                body={<p>It stays in the list as cancelled. You can duplicate it later.</p>}
                confirmLabel="Yes, cancel it"
                danger
              />
            </form>
            <div className="w-full">
              <Result state={nowState} />
              <Result state={cancelState} />
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------ preview */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-[var(--color-ink)]">Preview</h2>
          <div className="flex gap-1 text-xs" role="group" aria-label="Preview colour scheme">
            <button type="button" onClick={() => setDark(false)} aria-pressed={!dark} className={`btn text-xs ${!dark ? "btn-dark" : "btn-ghost"}`}>
              Light
            </button>
            <button type="button" onClick={() => setDark(true)} aria-pressed={dark} className={`btn text-xs ${dark ? "btn-dark" : "btn-ghost"}`}>
              Dark
            </button>
          </div>
        </div>
        <div className="mb-2 rounded border border-black/10 bg-white p-3 text-sm">
          <p>
            <span className="text-[var(--color-ink-soft)]">From:</span> <strong>{tokens.brand_name}</strong>
          </p>
          <p>
            <span className="text-[var(--color-ink-soft)]">Subject:</span> {subject ? fillMergeFields(subject, { first_name: adminFirstName }) : <em className="text-[var(--color-accent)]">no subject yet</em>}
          </p>
          {previewText && <p className="text-[var(--color-ink-soft)]">{fillMergeFields(previewText, { first_name: adminFirstName })}</p>}
        </div>
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox=""
          className="h-[75vh] w-full rounded border border-black/10 bg-white"
        />
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          Shown with your first name. Links are disabled in the preview. Inboxes differ — send a test before scheduling.
        </p>
      </div>
    </div>
  );
}

function BlockFields({ block, onChange }: { block: ContentBlock; onChange: (b: ContentBlock) => void }) {
  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="field-label">Headline</span>
            <input value={block.headline} onChange={(e) => onChange({ ...block, headline: e.target.value })} maxLength={150} className="input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="field-label">Body text</span>
            <textarea
              value={block.body}
              onChange={(e) => onChange({ ...block, body: e.target.value })}
              maxLength={1500}
              rows={4}
              className="textarea mt-1"
              placeholder="Hi {{first_name}}, …"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="field-label">Image (https://, optional)</span>
              <input
                value={block.image_url ?? ""}
                onChange={(e) => onChange({ ...block, image_url: e.target.value || undefined })}
                maxLength={1000}
                className="input mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="field-label">Image description (alt text)</span>
              <input
                value={block.image_alt ?? ""}
                onChange={(e) => onChange({ ...block, image_alt: e.target.value || undefined })}
                maxLength={200}
                className="input mt-1"
              />
            </label>
          </div>
        </div>
      );
    case "steps":
      return (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="field-label">Title (optional)</span>
            <input
              value={block.title ?? ""}
              onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
              maxLength={100}
              className="input mt-1"
              placeholder="How it works"
            />
          </label>
          {block.steps.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <label className="block text-sm">
                <span className="field-label">Step {i + 1} — bold lead</span>
                <input
                  value={s.lead}
                  onChange={(e) => onChange({ ...block, steps: block.steps.map((x, j) => (j === i ? { ...x, lead: e.target.value } : x)) })}
                  maxLength={80}
                  className="input mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="field-label">Detail</span>
                <input
                  value={s.text}
                  onChange={(e) => onChange({ ...block, steps: block.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  maxLength={200}
                  className="input mt-1"
                />
              </label>
              <button
                type="button"
                onClick={() => onChange({ ...block, steps: block.steps.filter((_, j) => j !== i) })}
                disabled={block.steps.length <= MIN_STEPS}
                className="btn btn-ghost px-2 py-1 text-xs"
              >
                Remove
              </button>
            </div>
          ))}
          {block.steps.length < MAX_STEPS && (
            <button type="button" onClick={() => onChange({ ...block, steps: [...block.steps, { lead: "", text: "" }] })} className="btn btn-ghost text-xs">
              + Add step
            </button>
          )}
        </div>
      );
    case "promo":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="field-label">Code</span>
            <input
              value={block.code}
              onChange={(e) => onChange({ ...block, code: e.target.value.toUpperCase() })}
              maxLength={40}
              className="input mt-1 font-mono"
              placeholder="SUMMER20"
            />
          </label>
          <label className="block text-sm">
            <span className="field-label">Worth</span>
            <input value={block.discount} onChange={(e) => onChange({ ...block, discount: e.target.value })} maxLength={80} className="input mt-1" placeholder="20% off" />
          </label>
          <label className="block text-sm">
            <span className="field-label">Expiry (optional)</span>
            <input
              value={block.expiry ?? ""}
              onChange={(e) => onChange({ ...block, expiry: e.target.value || undefined })}
              maxLength={80}
              className="input mt-1"
              placeholder="Ends 31 August"
            />
          </label>
          <p className="field-hint sm:col-span-3">One shared code for everyone who receives this campaign.</p>
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <label className="block text-sm">
            <span className="field-label">Button text</span>
            <input value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} maxLength={60} className="input mt-1" placeholder="Shop now" />
          </label>
          <label className="block text-sm">
            <span className="field-label">Link (https://)</span>
            <input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} maxLength={1000} className="input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="field-label">Style</span>
            <select
              value={block.style}
              onChange={(e) => onChange({ ...block, style: e.target.value === "link" ? "link" : "button" })}
              className="select mt-1"
            >
              <option value="button">Button</option>
              <option value="link">Text link</option>
            </select>
          </label>
        </div>
      );
  }
}
