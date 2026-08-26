// ─────────────────────────────────────────────────────────────────────────────
// /staff/messages — the team inbox.
//
// requireStaffPage() runs here rather than relying on a section layout, so this
// screen is protected on its own terms. Data is read server-side for first
// paint; the client component takes over polling from there.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import MessagesInbox from '@/components/messaging/MessagesInbox';
import { PageHeader } from '@/components/ui';
import { requireStaffPage } from '@/lib/guards';
import { STAFF_ROLES } from '@/lib/models';
import { canManage } from '@/lib/rbac';
import { listConversations } from '@/lib/repo/messages';
import { listUsers } from '@/lib/repo/users';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
};

export default function StaffMessagesPage() {
  const user = requireStaffPage('/staff/messages');

  // Only staff can ever be a messaging target — customers must not appear here.
  const staff = listUsers({ roles: [...STAFF_ROLES], activeOnly: true, limit: 200 })
    .filter((u) => u.id !== user.id)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));

  // Width only — app/staff/layout.tsx already supplies the page padding through
  // AppShell, and repeating it here doubles the gutters.
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="Internal"
        title="Messages"
        description="Direct messages, group threads, and team announcements."
      />
      <MessagesInbox
        meId={user.id}
        canAnnounce={canManage(user.role)}
        initialConversations={listConversations(user.id)}
        staff={staff}
      />
    </div>
  );
}
