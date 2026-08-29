// ─────────────────────────────────────────────────────────────────────────────
// /staff/messages/[id] — one thread.
//
// isMember() is checked HERE as well as in the API. The page guard is the second
// line of defence (see lib/guards.ts) but it is the one that decides whether
// this screen renders at all — a non-member gets notFound(), which is the same
// answer the API gives, so neither surface confirms the room exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import MessageThread from '@/components/messaging/MessageThread';
import { PageHeader } from '@/components/ui';
import { requireStaffPage } from '@/lib/guards';
import {
  getConversation,
  isMember,
  listMessages,
  markConversationRead,
  memberIds,
  readReceipts,
} from '@/lib/repo/messages';
import { getUser } from '@/lib/repo/users';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Conversation',
  robots: { index: false, follow: false },
};

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage(`/staff/messages/${(await params).id}`);

  const conversation = getConversation((await params).id);
  if (!conversation || !isMember(conversation.id, user.id)) notFound();

  const ids = memberIds(conversation.id);
  const memberNames: Record<string, string> = {};
  for (const id of ids) memberNames[id] = getUser(id)?.name ?? 'Former member';

  const messages = listMessages(conversation.id);
  const receipts = readReceipts(conversation.id);

  // Rendering the thread is what marks it read. Done after readReceipts() so
  // the "seen by" row reflects the state the other members were in when the
  // page loaded, not our own read a millisecond ago.
  markConversationRead(conversation.id, user.id);

  const title =
    conversation.kind === 'direct'
      ? ids.filter((id) => id !== user.id).map((id) => memberNames[id]).join(', ')
      : conversation.title;

  // Width only — the staff layout already supplies the page padding.
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/staff/messages"
        className="mb-4 inline-block font-mono text-[11px] uppercase tracking-widest2 text-subtle hover:text-white"
      >
        ← All messages
      </Link>
      <PageHeader
        title={title || 'Conversation'}
        description={`${ids.length} member${ids.length === 1 ? '' : 's'}`}
      />
      <MessageThread
        meId={user.id}
        conversation={conversation}
        initialMessages={messages}
        initialReceipts={receipts}
        memberNames={memberNames}
      />
    </div>
  );
}
