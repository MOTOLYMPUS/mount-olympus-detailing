// ─────────────────────────────────────────────────────────────────────────────
// Admin / business layout — everything under /admin.
//
// The floor is 'manager'. The two screens that need more (settings, employees)
// call `requireRolePage('admin')` themselves — a layout cannot express "admin
// for these two children, manager for the rest", and pushing the whole section
// to admin would lock a manager out of the schedule they are employed to run.
//
// `requireRolePage` redirects rather than 403s, and `homeFor()` sends a
// technician who followed an /admin link to /staff. Being told "no" is useless
// when there is an obvious right answer.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import AppShell from '@/components/app/AppShell';
import { requireRolePage } from '@/lib/guards';
import { toPublicUser } from '@/lib/models';
import { unreadCount } from '@/lib/repo/notifications';
import { totalUnread } from '@/lib/repo/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Business',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = requireRolePage('manager', '/admin');

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
