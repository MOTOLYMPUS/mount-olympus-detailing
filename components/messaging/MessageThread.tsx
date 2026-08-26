'use client';

// ─────────────────────────────────────────────────────────────────────────────
// One conversation: transcript, composer, attachments, read receipts.
//
// Polls for new messages (see usePolling — no WebSocket server exists here).
// Opening the thread and every subsequent poll also mark it read server-side,
// which is what keeps the unread badge in the nav honest while it is open.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Attachment, Conversation, Message } from '@/lib/models';
import { buttonClass } from '@/components/ui';
import { usePolling } from './usePolling';

interface Receipt {
  userId: string;
  name: string;
  lastReadAt: string | null;
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function MessageThread({
  meId,
  conversation,
  initialMessages,
  initialReceipts,
  memberNames,
}: {
  meId: string;
  conversation: Conversation;
  initialMessages: Message[];
  initialReceipts: Receipt[];
  /** userId → display name, so a sender can be labelled without a second fetch. */
  memberNames: Record<string, string>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${conversation.id}`);
      const data = await res.json();
      if (data?.ok) {
        setMessages(data.messages);
        setReceipts(data.receipts);
      }
    } catch {
      // Silent: a dropped poll self-heals on the next tick.
    }
  }, [conversation.id]);

  usePolling(refresh);

  async function attach(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('scope', 'messages');
      Array.from(files).forEach((f) => form.append('file', f));

      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'That upload failed.');

      setAttachments((prev) => [
        ...prev,
        ...data.files.map((f: { url: string; mime: string; size: number; key: string }) => ({
          url: f.url,
          name: f.key.split('/').pop() ?? 'image',
          contentType: f.mime,
          size: f.size,
        })),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && !attachments.length) || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${conversation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft, attachments }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Message not sent.');

      setMessages((prev) => [...prev, data.message]);
      setDraft('');
      setAttachments([]);
    } catch (e) {
      // The draft is intentionally NOT cleared on failure — retyping a message
      // the app lost is the fastest way to make people stop using it.
      setError(e instanceof Error ? e.message : 'Message not sent.');
    } finally {
      setSending(false);
    }
  }

  // "Seen by" = members whose watermark is at or past the newest message.
  const lastAt = messages.length ? messages[messages.length - 1].createdAt : null;
  const seenBy = lastAt
    ? receipts.filter((r) => r.userId !== meId && r.lastReadAt && r.lastReadAt >= lastAt)
    : [];

  return (
    <div className="flex h-[calc(100vh-14rem)] flex-col">
      <div
        role="log"
        aria-live="polite"
        aria-label={`Messages in ${conversation.title || 'this conversation'}`}
        className="flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-subtle">No messages yet. Say something.</p>
        )}

        {messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className="max-w-[85%] sm:max-w-[70%]">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  {mine ? 'You' : (memberNames[m.senderId ?? ''] ?? 'Someone')} · {time(m.createdAt)}
                </p>
                <div
                  className={clsx(
                    'rounded-sm px-3.5 py-2.5 text-sm leading-relaxed',
                    mine ? 'bg-apex/15 text-white' : 'border border-white/10 bg-charcoal/40 text-white/90'
                  )}
                >
                  {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}

                  {m.attachments.length > 0 && (
                    <ul className={clsx('flex flex-wrap gap-2', m.body && 'mt-2')}>
                      {m.attachments.map((a) => (
                        <li key={a.url}>
                          <a href={a.url} target="_blank" rel="noreferrer" className="block">
                            {/* Uploads are image-only (lib/uploads.ts sniffs and
                                rejects anything else), so a thumbnail is safe. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={a.url}
                              alt={a.name}
                              className="h-24 w-24 rounded-sm border border-white/10 object-cover"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {m.mentions.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest2 text-sky-400">
                    Mentioned: {m.mentions.map((id) => memberNames[id] ?? 'someone').join(', ')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {seenBy.length > 0 && (
        <p className="pt-2 text-right font-mono text-[10px] uppercase tracking-widest2 text-subtle">
          Seen by {seenBy.map((r) => r.name).join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-sm border border-apex/40 bg-apex/5 px-3 py-2 text-[13px] text-red-100">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li key={a.url} className="flex items-center gap-2 rounded-sm border border-white/15 px-2 py-1">
              <span className="max-w-[10rem] truncate text-[12px] text-muted">{a.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                aria-label={`Remove attachment ${a.name}`}
                className="text-subtle hover:text-flare"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={send} className="mt-3 border-t border-white/10 pt-3">
        <label htmlFor="message-body" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="message-body"
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Message the team… use @name to mention someone"
            aria-describedby="message-hint"
            className="flex-1 resize-none rounded-sm border border-white/15 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-subtle focus:border-white/40 focus:outline-none"
          />

          <input
            ref={fileRef}
            id="message-attachment"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => attach(e.target.files)}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={buttonClass('secondary', 'md')}
          >
            {uploading ? 'Uploading…' : 'Attach'}
          </button>

          <button
            type="submit"
            disabled={sending || (!draft.trim() && !attachments.length)}
            className={buttonClass('primary', 'md')}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p id="message-hint" className="mt-2 text-[11px] text-subtle">
          Enter to send · Shift + Enter for a new line · images only.
        </p>
      </form>
    </div>
  );
}
