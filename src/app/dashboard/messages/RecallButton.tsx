"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { recallMessage, type MessageState } from "./actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
    >
      {pending ? "Recalling…" : "Recall"}
    </button>
  );
}

/**
 * "Recall" under the viewer's own message while it can still be unsent
 * (#56). Shown disabled once the other side has seen it, so the option
 * doesn't silently vanish. The database re-checks everything.
 */
export function RecallButton({ messageId, seen }: { messageId: string; seen: boolean }) {
  const [state, formAction] = useActionState<MessageState, FormData>(recallMessage, {});
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => {
        if (!window.confirm("Recall this message? It will be removed for both of you.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="message_id" value={messageId} />
      <span title={seen ? "Already seen, so it can't be recalled" : "Remove this message for both of you"}>
        <Submit disabled={seen} />
      </span>
      {state.error && <span className="ml-2 text-[var(--color-accent)]">{state.error}</span>}
    </form>
  );
}
