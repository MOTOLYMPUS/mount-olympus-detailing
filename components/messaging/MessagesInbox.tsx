'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The staff inbox: conversation list, search, and the new-conversation dialog.
//
// Client-side because it polls (see usePolling — there is no WebSocket server
// here) and because search is a live filter over an endpoint rather than a page
// navigation.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ConversationKind, ConversationSummary, Message, Role } from '@/lib/models';
import { Badge, EmptyState, buttonClass } from '@/components/ui';
import { usePolling } from './usePolling';

interface StaffMember {
  id: string;
  name: string;
  role: Role;
}

type SearchHit = Message & { conversationTitle: string };

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Direct rooms have no title — they are named after the other person. */
function label(c: ConversationSummary, meId: string): string {
  if (c.kind === 'direct') {
    const others = c.memberIds
      .map((id, i) => ({ id, name: c.memberNames[i] }))
      .filter((m) => m.id !== meId);
    return others.map((m) => m.name).join(', ') || 'Direct message';
  }
  return c.title || 'Untitled';
}

export default function MessagesInbox({
  meId,
  canAnnounce,
  initialConversations,
  staff,
}: {
  meId: string;
  canAnnounce: boolean;
  initialConversations: ConversationSummary[];
  staff: StaffMember[];
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      if (data?.ok) setConversations(data.conversations);
    } catch {
      // A failed poll is not worth an error banner — the next one will catch up.
    }
  }, []);

  usePolling(refresh);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const res = await fetch(`/api/messages/search?q=${encodeURIComponent(query.trim())}`);
    const data = await res.json();
    setResults(data?.ok ? data.results : []);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form onSubmit={runSearch} className="flex min-w-0 flex-1 items-center gap-2" role="search">
          <label htmlFor="message-search" className="sr-only">
            Search messages
          </label>
          <input
            id="message-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setResults(null);
            }}
            placeholder="Search messages…"
            className="min-w-0 flex-1 rounded-sm border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white placeholder:text-subtle focus:border-white/40 focus:outline-none"
          />
          <button type="submit" className={buttonClass('secondary', 'sm')}>
            Search
          </button>
        </form>
        <button type="button" onClick={() => setDialogOpen(true)} className={buttonClass('primary', 'sm')}>
          New
        </button>
      </div>

      {results !== null ? (
        <section aria-label="Search results">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
            {results.length} result{results.length === 1 ? '' : 's'}
            <button
              type="button"
              onClick={() => {
                setResults(null);
                setQuery('');
              }}
              className="ml-3 normal-case tracking-normal text-muted underline underline-offset-2 hover:text-white"
            >
              Clear
            </button>
          </p>
          {results.length === 0 ? (
            <EmptyState title="Nothing found" description="Try a different word or a shorter phrase." />
          ) : (
            <ul className="space-y-2">
              {results.map((hit) => (
                <li key={hit.id}>
                  <Link
                    href={`/staff/messages/${hit.conversationId}`}
                    className="block rounded-sm border border-white/10 bg-charcoal/40 p-4 transition-colors hover:border-white/25"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                      {hit.conversationTitle || 'Direct message'} · {when(hit.createdAt)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-white/90">{hit.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Start one with anyone on the team — a direct message, a group, or an announcement."
          action={
            <button type="button" onClick={() => setDialogOpen(true)} className={buttonClass('primary')}>
              New conversation
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/staff/messages/${c.id}`}
                className="block rounded-sm border border-white/10 bg-charcoal/40 p-4 transition-colors hover:border-white/25"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-white">{label(c, meId)}</span>
                  <span className="shrink-0 font-mono text-[11px] text-subtle">
                    {when(c.lastMessageAt)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    {c.lastMessage || 'No messages yet'}
                  </p>
                  {c.kind === 'announcement' && <Badge tone="info">Announcement</Badge>}
                  {c.unread > 0 && (
                    <span
                      className="shrink-0 rounded-full bg-apex px-2 py-0.5 font-mono text-[10px] text-white"
                      aria-label={`${c.unread} unread`}
                    >
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <NewConversationDialog
          staff={staff}
          canAnnounce={canAnnounce}
          onClose={() => setDialogOpen(false)}
          onCreated={(id) => router.push(`/staff/messages/${id}`)}
        />
      )}
    </>
  );
}

// ── New conversation ─────────────────────────────────────────────────────────

function NewConversationDialog({
  staff,
  canAnnounce,
  onClose,
  onCreated,
}: {
  staff: StaffMember[];
  canAnnounce: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [kind, setKind] = useState<ConversationKind>('direct');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, memberIds: selected, title }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Could not start that conversation.');
      onCreated(data.conversation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        className="w-full max-w-md rounded-sm border border-white/10 bg-obsidian p-5 shadow-card"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-conversation-title" className="font-display text-lg font-semibold text-white">
            New conversation
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-muted hover:text-white">
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Type
            </legend>
            <div className="flex gap-2">
              {(['direct', 'group', ...(canAnnounce ? (['announcement'] as const) : [])] as ConversationKind[]).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={clsx(
                      'rounded-sm border px-3 py-1.5 text-[12px] capitalize transition-colors',
                      kind === k
                        ? 'border-apex/60 bg-apex/10 text-white'
                        : 'border-white/15 text-muted hover:border-white/40'
                    )}
                  >
                    {k}
                  </button>
                )
              )}
            </div>
          </fieldset>

          {kind !== 'direct' && (
            <div>
              <label
                htmlFor="conversation-title"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest2 text-subtle"
              >
                Name
              </label>
              <input
                id="conversation-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-sm border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
              />
            </div>
          )}

          {kind !== 'announcement' && (
            <fieldset>
              <legend className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                {kind === 'direct' ? 'Who' : 'Members'}
              </legend>
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {staff.map((s) => {
                  const on = selected.includes(s.id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setSelected((prev) =>
                            kind === 'direct'
                              ? [s.id]
                              : on
                                ? prev.filter((id) => id !== s.id)
                                : [...prev, s.id]
                          )
                        }
                        className={clsx(
                          'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors',
                          on ? 'bg-apex/10 text-white' : 'text-muted hover:bg-white/5 hover:text-white'
                        )}
                      >
                        <span>{s.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                          {s.role}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          {kind === 'announcement' && (
            <p className="rounded-sm border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[12px] text-sky-100">
              Announcements go to everyone on the team.
            </p>
          )}

          {error && (
            <p role="alert" className="text-[13px] text-flare">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={buttonClass('ghost', 'sm')}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (kind !== 'announcement' && selected.length === 0)}
              className={buttonClass('primary', 'sm')}
            >
              {busy ? 'Starting…' : 'Start'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
