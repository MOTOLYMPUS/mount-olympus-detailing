import Link from 'next/link';
import { requirePage } from '@/lib/guards';
import { listNotifications, markRead } from '@/lib/repo/notifications';
import { relativeTime } from '@/lib/timezone';
import { Card, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await requirePage('/app/notifications');

  // Read the list BEFORE marking it read, so the "new" highlight survives this
  // render — otherwise opening the page would clear the very indicator that
  // tells the user what is new.
  const notifications = listNotifications(user.id, 60);
  markRead(user.id);

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Activity" title="Notifications" />

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Booking confirmations, reminders, and job updates will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-white">{n.title}</p>
                  {!n.readAt && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-apex" aria-label="Unread" />
                  )}
                </div>
                {n.body && <p className="mt-1 text-[13px] leading-relaxed text-muted">{n.body}</p>}
                <p className="mt-1.5 text-[11px] text-subtle">{relativeTime(n.createdAt)}</p>
              </>
            );

            return (
              <Card as="li" key={n.id} className="p-4">
                {n.url ? (
                  <Link href={n.url} className="block transition-opacity hover:opacity-80">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
