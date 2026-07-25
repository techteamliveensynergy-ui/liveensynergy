import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import { signedUrlFor } from "@/lib/storage";
import type { Conversation, Message } from "@/lib/types";
import { startSupportThread } from "./actions";
import { Composer } from "./Composer";

export const metadata = { title: "Messages" };

type ConversationRow = Conversation & {
  event_listings: { id: string; name: string } | null;
  campaigns: { id: string; reference: string } | null;
};

type Tab = "partner" | "support";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; tab?: string; notice?: string }>;
}) {
  const { profile } = await requireProfile();
  const { c: activeId, tab: rawTab, notice } = await searchParams;
  const supabase = await createClient();

  const { data: convData } = await supabase
    .from("conversations")
    .select("*, event_listings(id, name), campaigns(id, reference)")
    .order("created_at", { ascending: false });
  const all = (convData ?? []) as ConversationRow[];

  const partnerThreads = all.filter((c) => c.kind !== "support");
  const supportThreads = all.filter((c) => c.kind === "support");

  // A deep link to a specific conversation should select the right tab too.
  const linked = activeId ? all.find((x) => x.id === activeId) : null;
  const tab: Tab =
    linked?.kind === "support"
      ? "support"
      : rawTab === "support"
        ? "support"
        : "partner";

  const conversations = tab === "support" ? supportThreads : partnerThreads;
  const active = linked ?? conversations[0] ?? null;

  let messages: Message[] = [];
  let attachmentUrls: (string | null)[] = [];
  if (active) {
    const { data: msgData } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", active.id)
      .order("created_at", { ascending: true });
    messages = (msgData ?? []) as Message[];
    attachmentUrls = await Promise.all(
      messages.map((m) => signedUrlFor(m.attachment_url)),
    );
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Chat with sponsors, artists and organisers — or with the Live·En·Synergy team."
      />

      {notice === "enquiry" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Enquiry sent. Our team reviews every match and will be in touch within
          48 hours — you can keep chatting here in the meantime.
        </p>
      )}
      {notice === "support" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          You&apos;re now in a thread with the Live·En·Synergy team. We respond
          within 48 hours.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <TabLink
          href="/dashboard/messages"
          label="With artists & sponsors"
          count={partnerThreads.length}
          active={tab === "partner"}
        />
        <TabLink
          href="/dashboard/messages?tab=support"
          label="With Live·En·Synergy team"
          count={supportThreads.length}
          active={tab === "support"}
        />
      </div>

      {conversations.length === 0 ? (
        tab === "support" ? (
          <div className="card p-10 text-center">
            <div className="text-4xl" aria-hidden>
              🛟
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">
              No thread with our team yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">
              Questions about a match, a campaign or a confirmed sponsorship?
              Start a thread and we&apos;ll reply within 48 hours.
            </p>
            <form action={startSupportThread} className="mt-5">
              <button type="submit" className="btn btn-primary">
                Message the team
              </button>
            </form>
          </div>
        ) : (
          <EmptyState
            icon="💬"
            title="No conversations yet"
            body="Conversations start when a brand reaches out about an event. Discover events to get connected."
            cta={{ href: "/dashboard/discover", label: "Discover events" }}
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* Conversation list */}
          <aside className="h-fit">
            <div className="card divide-y divide-black/5 overflow-hidden">
              {conversations.map((conv) => {
                const isActive = active?.id === conv.id;
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
                    <p className="truncate">{threadTitle(conv)}</p>
                    <p className="truncate text-xs text-[var(--color-ink-soft)]">
                      {conv.kind === "support"
                        ? "Live·En·Synergy team"
                        : conv.brand_profile_id === profile!.id
                          ? "You reached out"
                          : "Incoming enquiry"}
                    </p>
                  </Link>
                );
              })}
            </div>
            {tab === "support" && (
              <form action={startSupportThread} className="mt-3">
                <button type="submit" className="btn btn-ghost w-full text-sm">
                  + New thread with the team
                </button>
              </form>
            )}
          </aside>

          {/* Thread */}
          <section className="card flex min-h-[420px] flex-col">
            {active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-5 py-3">
                  <p className="font-semibold">{threadTitle(active)}</p>
                  {/* Opens in a new tab so the thread isn't lost. */}
                  {active.event_listings && (
                    <a
                      href={`/dashboard/events/${active.event_listings.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[var(--color-brand-dark)] hover:underline"
                    >
                      Event details ↗
                    </a>
                  )}
                  {active.campaigns && (
                    <a
                      href={`/dashboard/campaigns/${active.campaigns.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[var(--color-brand-dark)] hover:underline"
                    >
                      Campaign details ↗
                    </a>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {messages.length === 0 ? (
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      No messages yet — say hello 👋
                    </p>
                  ) : (
                    messages.map((m, i) => {
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
                            {attachmentUrls[i] && (
                              <a
                                href={attachmentUrls[i]!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold underline ${
                                  mine ? "bg-white/15" : "bg-white"
                                }`}
                              >
                                📎 {m.attachment_name ?? "Attachment"}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <Composer conversationId={active.id} />
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

function threadTitle(conv: ConversationRow) {
  if (conv.subject) return conv.subject;
  if (conv.campaigns) return `Campaign ${conv.campaigns.reference}`;
  if (conv.event_listings) return conv.event_listings.name;
  return conv.kind === "support" ? "Live·En·Synergy team" : "Direct message";
}

function TabLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[var(--color-ink)] text-white"
          : "bg-[var(--color-mist)] text-[var(--color-ink-soft)] hover:bg-black/5"
      }`}
    >
      {label}
      <span className="ml-2 opacity-70">{count}</span>
    </Link>
  );
}
