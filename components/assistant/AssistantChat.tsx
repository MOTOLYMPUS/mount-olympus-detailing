'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The assistant chat.
//
// A client component because it owns a live transcript, a growing textarea, and
// pending state — none of which a server component can hold.
//
// ACCESSIBILITY, deliberately rather than incidentally:
//   • The transcript is role="log" + aria-live="polite", so a screen reader
//     announces new replies without interrupting whatever is being read.
//   • Every control is a real <button>. Nothing here is a clickable div.
//   • Enter sends, Shift+Enter is a newline — and the hint says so, because a
//     textarea that swallows Enter is otherwise a trap.
//   • prefers-reduced-motion turns the typing indicator's animation off; the
//     indicator itself stays, so the state is still conveyed.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AssistantConversation } from '@/lib/models';
import { buttonClass } from '@/components/ui';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Set on the assistant turn that triggered a hand-over to the team. */
  escalated?: boolean;
}

const STARTERS = [
  'What is the difference between a wash and a full detail?',
  'How much is a ceramic coating for a 3-row SUV?',
  'My boat gelcoat is chalky — what do you recommend?',
  'How often should I have my car detailed?',
];

export default function AssistantChat({
  signedIn,
  initialConversations,
  configured,
}: {
  signedIn: boolean;
  initialConversations: AssistantConversation[];
  configured: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Kept so a failed send can be retried without retyping. */
  const [lastFailed, setLastFailed] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-grow the textarea. Reset to auto first or it only ever gets taller.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending]);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || pending) return;

      setError(null);
      setLastFailed(null);
      setDraft('');
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      setPending(true);

      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            conversationId,
            // Anonymous visitors carry their own history: nothing is stored
            // server-side for them (see lib/repo/assistant.ts).
            history: signedIn ? undefined : messages,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error ?? 'That did not go through.');
        }

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply, escalated: !!data.escalated },
        ]);

        if (data.conversationId && data.conversationId !== conversationId) {
          setConversationId(data.conversationId);
          setConversations((prev) =>
            prev.some((c) => c.id === data.conversationId)
              ? prev
              : [
                  {
                    id: data.conversationId,
                    userId: null,
                    title: data.title || message.slice(0, 60),
                    escalated: !!data.escalated,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                  ...prev,
                ]
          );
        }
      } catch (e) {
        // Roll the user's message back out of the transcript and offer a retry,
        // rather than leaving a question sitting there with no answer coming.
        setMessages((prev) => prev.slice(0, -1));
        setLastFailed(message);
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        setPending(false);
      }
    },
    [conversationId, messages, pending, signedIn]
  );

  async function openConversation(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/assistant/${id}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Could not open that conversation.');
      setConversationId(id);
      setMessages(
        data.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          content: m.content,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that conversation.');
    }
  }

  async function removeConversation(id: string) {
    try {
      await fetch(`/api/assistant/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch {
      setError('Could not delete that conversation.');
    }
  }

  function startNew() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex gap-6">
      {signedIn && (
        <aside className="hidden w-56 shrink-0 lg:block">
          <button type="button" onClick={startNew} className={buttonClass('secondary', 'sm', 'w-full')}>
            New conversation
          </button>
          <ul className="mt-3 space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openConversation(c.id)}
                  aria-current={conversationId === c.id ? 'true' : undefined}
                  className={clsx(
                    'min-w-0 flex-1 truncate rounded-sm px-2.5 py-2 text-left text-[13px] transition-colors',
                    conversationId === c.id
                      ? 'bg-apex/10 text-white'
                      : 'text-muted hover:bg-white/5 hover:text-white'
                  )}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => removeConversation(c.id)}
                  aria-label={`Delete conversation: ${c.title}`}
                  className="rounded-sm px-1.5 py-1 text-subtle opacity-0 transition hover:text-flare focus:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!configured && (
          <div
            className="mb-4 rounded-sm border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] text-amber-100"
            role="status"
          >
            The assistant is not connected yet. Ask anyway and we will point you at the
            quickest way to get a real answer.
          </div>
        )}

        {/* The transcript. role="log" + polite so replies are announced without
            cutting off whatever the screen reader is currently saying. */}
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation with the assistant"
          className="min-h-[45vh] flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {messages.length === 0 && (
            <div className="py-8">
              <p className="font-display text-lg font-semibold text-white">
                Ask about anything we do.
              </p>
              <p className="mt-2 max-w-md text-sm text-muted">
                Services, prices, what a coating actually does, how often to book. Answers come
                from our own price list.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-white/15 px-3.5 py-1.5 text-left text-[12px] text-muted transition-colors hover:border-white/40 hover:text-white"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div className={clsx('max-w-[85%] sm:max-w-[75%]')}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  {m.role === 'user' ? 'You' : 'Assistant'}
                </p>
                <div
                  className={clsx(
                    'whitespace-pre-wrap rounded-sm px-4 py-3 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-apex/15 text-white'
                      : 'border border-white/10 bg-charcoal/40 text-white/90'
                  )}
                >
                  {m.content}
                </div>

                {m.escalated && (
                  <p className="mt-2 rounded-sm border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[12px] text-sky-100">
                    We have passed this to the team — they will be in touch. For anything
                    urgent, call or text us.
                  </p>
                )}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-sm border border-white/10 bg-charcoal/40 px-4 py-3">
                <span className="sr-only">The assistant is typing.</span>
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      // motion-safe: the dots stop bouncing when the reader has
                      // asked for reduced motion — the indicator still shows.
                      className="h-1.5 w-1.5 rounded-full bg-subtle motion-safe:animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {error && (
          <div className="mt-4 rounded-sm border border-apex/40 bg-apex/5 px-4 py-3 text-sm text-red-100" role="alert">
            <p>{error}</p>
            {lastFailed && (
              <button
                type="button"
                onClick={() => send(lastFailed)}
                className="mt-2 underline underline-offset-2 hover:no-underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="mt-4 border-t border-white/10 pt-4"
        >
          <label htmlFor="assistant-input" className="sr-only">
            Your message
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="assistant-input"
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder="Ask about a service, a price, or your vehicle…"
              aria-describedby="assistant-input-hint"
              className="flex-1 resize-none rounded-sm border border-white/15 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-subtle focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className={buttonClass('primary', 'md')}
            >
              {pending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p id="assistant-input-hint" className="mt-2 text-[11px] text-subtle">
            Enter to send · Shift + Enter for a new line.
            {!signedIn && ' Sign in to keep your conversation history.'}
          </p>
        </form>
      </div>
    </div>
  );
}
