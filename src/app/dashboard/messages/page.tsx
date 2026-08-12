import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import { signedUrlFor } from "@/lib/storage";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import {
  formatDateTime,
  formatDayLabel,
  formatTime,
  timeAgo,
} from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import { startSupportThread } from "./actions";
import { Composer } from "./Composer";
import { NewAdminThread } from "./NewAdminThread";

export const metadata = { title: "Messages" };

type ConversationRow = Conversation & {
  event_listings: { id: string; name: string } | null;
  campaigns: { id: string; reference: string } | null;
};

type Tab = "partner" | "support";

interface Party {
  id: string;
  full_name: string | null;
  role: Role;
}

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

  // Who's who. Every message rendered identically because the only signal was
  // "did I send this?" — which tells an admin reading someone else's thread
  // nothing at all (10 Aug standup). Names are read in one go for every thread
  // on the page; a viewer who isn't a party sees them through the
  // "read my conversation peer" policy added in 0023.
  const partyIds = [
    ...new Set(
      all.flatMap((c) => [c.brand_profile_id, c.partner_profile_id]),
    ),
  ];
  const { data: partyRows } = partyIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", partyIds)
    : { data: [] };
  const parties = new Map(
    ((partyRows ?? []) as Party[]).map((p) => [p.id, p]),
  );

  // When each thread last had a message, for the list. One query for every
  // thread on the page rather than one per thread: newest first, then keep the
  // first sighting of each conversation.
  const { data: activityRows } = all.length
    ? await supabase
        .from("messages")
        .select("conversation_id, created_at")
        .in(
          "conversation_id",
          all.map((c) => c.id),
        )
        .order("created_at", { ascending: false })
    : { data: [] };

  const lastMessageAt = new Map<string, string>();
  for (const row of (activityRows ?? []) as {
    conversation_id: string;
    created_at: string;
  }[]) {
    if (!lastMessageAt.has(row.conversation_id)) {
      lastMessageAt.set(row.conversation_id, row.created_at);
    }
  }

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

  // Everyone an admin can start a conversation with. Admins are excluded —
  // the thread shape is "a user and the team", so an admin-to-admin one would
  // land in the wrong inbox at both ends.
  const isAdmin = profile!.role === "admin";
  const { data: contactRows } = isAdmin
    ? await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .neq("role", "admin")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    : { data: [] };
  const contactProfiles = (contactRows ?? []) as (Party & {
    email: string | null;
  })[];

  // Label everyone by the act or brand, not just the account holder's name.
  //
  // `profiles.full_name` alone put two entries reading "Sakshi Gulati" in the
  // picker — one a brand, one an artist — with nothing to tell them apart, and
  // no sign of "Northwave Coffee" anywhere. People here are known by what they
  // represent.
  //
  // Read through the `public_*_profiles` views rather than the role tables:
  // those are owner-only under RLS, but the views are granted to `anon,
  // authenticated` (they back the public profile pages), so this works for the
  // brand and the artist too — not just an admin — with no new permission.
  const nameIds = [...new Set([...partyIds, ...contactProfiles.map((c) => c.id)])];
  const [{ data: brandNames }, { data: artistNames }, { data: organiserNames }] =
    nameIds.length
      ? await Promise.all([
          supabase
            .from("public_brand_profiles")
            .select("profile_id, brand_name")
            .in("profile_id", nameIds),
          supabase
            .from("public_artist_profiles")
            .select("profile_id, artist_name")
            .in("profile_id", nameIds),
          supabase
            .from("public_organiser_profiles")
            .select("profile_id, event_name")
            .in("profile_id", nameIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const workspaceName = new Map<string, string>([
    ...((brandNames ?? []) as { profile_id: string; brand_name: string }[]).map(
      (b) => [b.profile_id, b.brand_name] as const,
    ),
    ...((artistNames ?? []) as { profile_id: string; artist_name: string }[]).map(
      (a) => [a.profile_id, a.artist_name] as const,
    ),
    ...(
      (organiserNames ?? []) as { profile_id: string; event_name: string }[]
    ).map((e) => [e.profile_id, e.event_name] as const),
  ]);

  const contacts = contactProfiles.map((p) => {
    const person = p.full_name || p.email || "Unnamed account";
    const workspace = workspaceName.get(p.id);
    return {
      id: p.id,
      name: workspace && workspace !== person ? `${workspace} — ${person}` : person,
      roleLabel: ROLE_LABELS[p.role] ?? p.role,
    };
  });

  /**
   * Best available label for a party: yourself, the team, the act or brand,
   * their own name, or their role as a fallback.
   *
   * Admins are always "Live·En·Synergy team" to everyone but themselves — a
   * support thread is with the team, not with a named member of staff, and
   * that's how the rest of the product already words it.
   *
   * The act/brand name comes first because that's how a thread is actually
   * identified in conversation: "Northwave Coffee" means something that
   * "Brand Tester" does not — to the team and to the artist alike.
   */
  function partyLabel(id: string | null | undefined) {
    if (!id) return "Someone";
    if (id === profile!.id) return "You";
    const party = parties.get(id);
    if (party?.role === "admin") return "Live·En·Synergy team";
    const workspace = workspaceName.get(id);
    if (workspace) return workspace;
    if (party?.full_name) return party.full_name;
    if (party?.role) return ROLE_LABELS[party.role];
    return "Someone";
  }

  const viewerIsParty =
    !!active &&
    (active.brand_profile_id === profile!.id ||
      active.partner_profile_id === profile!.id);

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
      {notice === "admin-thread" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Thread open. Send the first message below — it reaches them under
          &ldquo;With Live·En·Synergy team&rdquo;.
        </p>
      )}

      {isAdmin && <NewAdminThread people={contacts} />}

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
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate">{threadTitle(conv)}</p>
                      {/* When this thread was last active — otherwise a list
                          of threads gives no sense of what's current. */}
                      <span
                        className="shrink-0 text-[11px] font-normal text-[var(--color-ink-soft)]"
                        title={
                          lastMessageAt.has(conv.id)
                            ? formatDateTime(lastMessageAt.get(conv.id))
                            : `Started ${formatDateTime(conv.created_at)}`
                        }
                      >
                        {lastMessageAt.has(conv.id)
                          ? timeAgo(lastMessageAt.get(conv.id))
                          : "No messages"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[var(--color-ink-soft)]">
                      {/* Someone watching a thread they aren't in — an admin —
                          needs to know whose it is, not whether it was
                          incoming. */}
                      {conv.brand_profile_id === profile!.id ||
                      conv.partner_profile_id === profile!.id
                        ? conv.kind === "support"
                          ? "Live·En·Synergy team"
                          : conv.brand_profile_id === profile!.id
                            ? "You reached out"
                            : "Incoming enquiry"
                        : `${partyLabel(conv.brand_profile_id)} ↔ ${partyLabel(
                            conv.partner_profile_id,
                          )}`}
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
                  <div className="min-w-0">
                    <p className="font-semibold">{threadTitle(active)}</p>
                    <p className="truncate text-xs text-[var(--color-ink-soft)]">
                      {partyLabel(active.brand_profile_id)} ↔{" "}
                      {partyLabel(active.partner_profile_id)}
                    </p>
                  </div>
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
                      // A date heading whenever the day changes, so a thread
                      // spanning weeks reads as a conversation with gaps
                      // rather than one undated run.
                      const previous = messages[i - 1];
                      const newDay =
                        !previous ||
                        new Date(previous.created_at).toDateString() !==
                          new Date(m.created_at).toDateString();
                      // Watching someone else's thread, "mine" is never true,
                      // so the two speakers have to be told apart some other
                      // way: the brand side goes right, the partner left, and
                      // every message is captioned with who said it.
                      const right = viewerIsParty
                        ? mine
                        : m.sender_profile_id === active.brand_profile_id;
                      return (
                        <div key={m.id}>
                          {newDay && (
                            <div className="my-3 flex items-center gap-3">
                              <span className="h-px flex-1 bg-black/10" />
                              <span className="text-xs font-semibold text-[var(--color-ink-soft)]">
                                {formatDayLabel(m.created_at)}
                              </span>
                              <span className="h-px flex-1 bg-black/10" />
                            </div>
                          )}
                          <div
                            className={`flex flex-col ${right ? "items-end" : "items-start"}`}
                          >
                          <p className="mb-0.5 px-1 text-xs font-medium text-[var(--color-ink-soft)]">
                            {partyLabel(m.sender_profile_id)}
                            <span
                              className="ml-2 font-normal"
                              title={formatDateTime(m.created_at)}
                            >
                              {formatTime(m.created_at)}
                            </span>
                          </p>
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                              right
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
                                  right ? "bg-white/15" : "bg-white"
                                }`}
                              >
                                📎 {m.attachment_name ?? "Attachment"}
                              </a>
                            )}
                          </div>
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
