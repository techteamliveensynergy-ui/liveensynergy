import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import type { Conversation, Message } from "@/lib/types";
import { sendMessage } from "./actions";

export const metadata = { title: "Messages" };

type ConversationRow = Conversation & {
  event_listings: { name: string } | null;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { profile } = await requireProfile();
  const { c: activeId } = await searchParams;
  const supabase = await createClient();

  const { data: convData } = await supabase
    .from("conversations")
    .select("*, event_listings(name)")
    .order("created_at", { ascending: false });
  const conversations = (convData ?? []) as ConversationRow[];

  const active =
    conversations.find((x) => x.id === activeId) ?? conversations[0] ?? null;

  let messages: Message[] = [];
  if (active) {
    const { data: msgData } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", active.id)
      .order("created_at", { ascending: true });
    messages = (msgData ?? []) as Message[];
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Chat directly with sponsors, artists and organisers."
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No conversations yet"
          body="Conversations start when a brand reaches out about an event. Discover events to get connected."
          cta={{ href: "/dashboard/discover", label: "Discover events" }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* Conversation list */}
          <aside className="card h-fit divide-y divide-black/5 overflow-hidden">
            {conversations.map((conv) => {
              const isActive = active?.id === conv.id;
              const title = conv.event_listings?.name ?? "Direct message";
              return (
                <Link
                  key={conv.id}
                  href={`/dashboard/messages?c=${conv.id}`}
                  className={`block px-4 py-3 text-sm transition ${
                    isActive
                      ? "bg-[var(--color-mist)] font-semibold"
                      : "hover:bg-[var(--color-mist)]"
                  }`}
                >
                  <p className="truncate">{title}</p>
                  <p className="truncate text-xs text-[var(--color-ink-soft)]">
                    {conv.brand_profile_id === profile!.id
                      ? "You reached out"
                      : "Incoming enquiry"}
                  </p>
                </Link>
              );
            })}
          </aside>

          {/* Thread */}
          <section className="card flex min-h-[420px] flex-col">
            {active ? (
              <>
                <div className="border-b border-black/5 px-5 py-3">
                  <p className="font-semibold">
                    {active.event_listings?.name ?? "Direct message"}
                  </p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {messages.length === 0 ? (
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      No messages yet — say hello 👋
                    </p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.sender_profile_id === profile!.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                              mine
                                ? "bg-[var(--color-brand)] text-white"
                                : "bg-[var(--color-mist)] text-[var(--color-ink)]"
                            }`}
                          >
                            {m.body}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <form
                  action={sendMessage}
                  className="flex items-center gap-2 border-t border-black/5 p-3"
                >
                  <input
                    type="hidden"
                    name="conversation_id"
                    value={active.id}
                  />
                  <input
                    name="body"
                    className="input flex-1"
                    placeholder="Type a message…"
                    autoComplete="off"
                    required
                  />
                  <button type="submit" className="btn btn-primary">
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-[var(--color-ink-soft)]">
                Select a conversation
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
