// ─────────────────────────────────────────────────────────────────────────────
// /app/assistant — the AI detailing assistant.
//
// A server component that does the data fetch and hands the result to one client
// component. The conversation list is read here rather than fetched from the
// browser so the sidebar is populated on first paint, with no loading flash.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import AssistantChat from '@/components/assistant/AssistantChat';
import { PageHeader } from '@/components/ui';
import { aiConfigured } from '@/lib/ai';
import { requirePage } from '@/lib/guards';
import { listConversations } from '@/lib/repo/assistant';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Assistant',
  robots: { index: false, follow: false },
};

export default function AssistantPage() {
  const user = requirePage('/app/assistant');

  return (
    <>
      <PageHeader
        eyebrow="Ask us anything"
        title="Detailing assistant"
        description="Answers come from our own service and price list — not from guesswork. Anything it cannot answer goes straight to the team."
      />
      <AssistantChat
        signedIn
        initialConversations={listConversations(user.id)}
        configured={aiConfigured()}
      />
    </>
  );
}
