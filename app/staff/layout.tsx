// ─────────────────────────────────────────────────────────────────────────────
// Employee portal layout — everything under /staff.
//
// Mirrors app/app/layout.tsx deliberately: same shell, same force-dynamic, same
// unread counts. The only difference is the guard — `requireStaffPage` bounces
// a customer to /app rather than to the sign-in screen, because they ARE signed
// in, they just took a wrong turn.
//
// The guard lives here rather than on each page so a new screen added under
// /staff is protected the moment the file exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import AppShell from '@/components/app/AppShell';
import { requireStaffPage } from '@/lib/guards';
import { toPublicUser } from '@/lib/models';
import { unreadCount } from '@/lib/repo/notifications';
import { totalUnread } from '@/lib/repo/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Staff',
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = requireStaffPage('/staff');

  return (
    <AppShell
      user={toPublicUser(user)}
      unreadNotifications={unreadCount(user.id)}
      unreadMessages={totalUnread(user.id)}
    >
      {children}
    </AppShell>
  );
}
