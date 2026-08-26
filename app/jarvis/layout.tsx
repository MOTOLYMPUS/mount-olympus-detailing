// ─────────────────────────────────────────────────────────────────────────────
// /jarvis — the owner's console.
//
// Manager and above, matching /admin: Jarvis reads revenue, customer records,
// and employee performance, and a technician has no business here. The two
// screens that change agent behaviour — memory and settings — raise the floor
// themselves, exactly as /admin/settings does.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import { requireRolePage } from '@/lib/guards';
import { toPublicUser } from '@/lib/models';
import { unreadCount } from '@/lib/repo/notifications';
import { totalUnread } from '@/lib/repo/messages';
import { pendingCount } from '@/lib/jarvis/approvals';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jarvis',
  robots: { index: false, follow: false },
};

const TABS = [
  { href: '/jarvis', label: 'Console' },
  { href: '/jarvis/approvals', label: 'Approvals' },
  { href: '/jarvis/activity', label: 'Activity' },
  { href: '/jarvis/memory', label: 'Memory' },
  { href: '/jarvis/settings', label: 'Settings' },
];

export default function JarvisLayout({ children }: { children: React.ReactNode }) {
  const user = requireRolePage('manager', '/jarvis');
  const pending = pendingCount();

  return (
    <AppShell
      user={toPublicUser(user)}
      unreadNotifications={unreadCount(user.id)}
      unreadMessages={totalUnread(user.id)}
    >
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-px">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative rounded-t-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            {tab.label}
            {tab.href === '/jarvis/approvals' && pending > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                {pending}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
