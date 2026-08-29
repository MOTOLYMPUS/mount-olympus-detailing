// ─────────────────────────────────────────────────────────────────────────────
// Customer app layout — everything under /app.
//
// The guard runs here rather than in each page, so a new screen added under
// /app is protected by default. `force-dynamic` is required: this layout reads
// the session cookie, and a statically rendered shell would serve one user's
// name to everyone.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import AppShell from '@/components/app/AppShell';
import { requirePage } from '@/lib/guards';
import { toPublicUser } from '@/lib/models';
import { unreadCount } from '@/lib/repo/notifications';
import { totalUnread } from '@/lib/repo/messages';
import { isStaff } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My account',
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage('/app');

  return (
    <AppShell
      user={toPublicUser(user)}
      unreadNotifications={unreadCount(user.id)}
      unreadMessages={isStaff(user.role) ? totalUnread(user.id) : 0}
    >
      {children}
    </AppShell>
  );
}
