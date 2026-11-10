"use client";

import { useActionState } from "react";
import { PendingSubmit } from "@/components/ui/PendingSubmit";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { changeMarketingCampaign, duplicateMarketingCampaign, type MarketingState } from "../../actions";

/** One form per operation, so no named submit buttons share a form (L12). */
function Op({
  campaignId,
  op,
  label,
  pending,
  confirm,
  className = "btn btn-ghost text-sm",
}: {
  campaignId: string;
  op: string;
  label: string;
  pending: string;
  confirm?: { title: string; body: string; confirmLabel: string; danger?: boolean };
  className?: string;
}) {
  const [state, action] = useActionState<MarketingState, FormData>(changeMarketingCampaign, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="op" value={op} />
      {confirm ? (
        <ConfirmSubmit
          label={label}
          pendingLabel={pending}
          className={className}
          title={confirm.title}
          body={<p>{confirm.body}</p>}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
        />
      ) : (
        <PendingSubmit label={label} pendingLabel={pending} className={className} />
      )}
      {state.error && (
        <div role="alert" className="text-sm text-[var(--color-accent)]">
          <p>{state.error}</p>
          {state.problems && (
            <ul className="list-disc pl-5">
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.message && <p className="text-sm font-semibold">✓ {state.message}</p>}
    </form>
  );
}

export function CampaignControls({ campaignId, status, started }: { campaignId: string; status: string; started: boolean }) {
  const [dupState, dupAction] = useActionState<MarketingState, FormData>(duplicateMarketingCampaign, {});
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold text-[var(--color-ink)]">Actions</h2>
      <div className="flex flex-wrap items-start gap-3">
        {status === "scheduled" && (
          <Op campaignId={campaignId} op="unschedule" label="Unschedule to edit" pending="Working…" className="btn btn-primary text-sm" />
        )}
        {(status === "scheduled" || status === "sending") && (
          <Op campaignId={campaignId} op="pause" label="Pause" pending="Pausing…" className="btn btn-dark text-sm" />
        )}
        {status === "paused" && (
          <Op
            campaignId={campaignId}
            op="resume"
            label={started ? "Resume sending" : "Resume (send now)"}
            pending="Resuming…"
            className="btn btn-primary text-sm"
            confirm={{
              title: "Resume this campaign?",
              body: started
                ? "Sending continues with the people not yet emailed. Anyone who unsubscribed meanwhile is skipped."
                : "It wasn't started yet, so it starts now.",
              confirmLabel: "Yes, resume",
            }}
          />
        )}
        {["scheduled", "paused"].includes(status) && (
          <Op
            campaignId={campaignId}
            op="cancel"
            label="Cancel campaign"
            pending="Cancelling…"
            confirm={{
              title: "Cancel this campaign?",
              body:
                status === "scheduled"
                  ? "It won't be sent. You can duplicate it later."
                  : "Nobody else is emailed. Emails already sent can't be recalled.",
              confirmLabel: "Yes, cancel it",
              danger: true,
            }}
          />
        )}
        {status === "sending" && (
          <p className="text-sm text-[var(--color-ink-soft)]">Pause first to cancel. Refresh the page to see progress.</p>
        )}
        <form action={dupAction} className="space-y-1">
          <input type="hidden" name="campaign_id" value={campaignId} />
          <PendingSubmit label="Duplicate as new draft" pendingLabel="Copying…" className="btn btn-ghost text-sm" />
          {dupState.error && <p className="text-sm text-[var(--color-accent)]">{dupState.error}</p>}
        </form>
      </div>
    </section>
  );
}
