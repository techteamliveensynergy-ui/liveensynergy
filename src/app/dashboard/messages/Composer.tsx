"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { FileDrop } from "@/components/ui/FileDrop";
import { ATTACHMENT_HINT } from "@/lib/upload-limits";
import { sendMessage, type MessageState } from "./actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, formAction] = useActionState<MessageState, FormData>(
    sendMessage,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const sentCount = useRef(0);

  // Clear the composer only once the action came back clean — a failed send
  // used to wipe what you typed, which is what made messages feel "lost".
  useEffect(() => {
    if (!state.error) {
      sentCount.current += 1;
      if (sentCount.current > 1) formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 border-t border-black/10 p-3"
    >
      <input type="hidden" name="conversation_id" value={conversationId} />

      {state.error && (
        <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          name="body"
          className="input flex-1"
          placeholder="Type a message…"
          autoComplete="off"
        />
        <SendButton />
      </div>

      <FileDrop
        name="attachment"
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,video/*"
        preview={false}
        hint={ATTACHMENT_HINT}
        label="Attach a file — images, docs or video"
      />
    </form>
  );
}
