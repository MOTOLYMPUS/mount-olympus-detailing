'use client';

// ─────────────────────────────────────────────────────────────────────────────
// App navigation.
//
// Two presentations of ONE list of links: a sidebar on desktop, a bottom tab
// bar on mobile. Bottom tabs rather than a hamburger because this is installed
// as an app and thumbs reach the bottom of a phone, not the top-left corner.
//
// The link set is derived from the user's role, so an employee never sees an
// admin tab they would only get a 403 from.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Role } from '@/lib/models';
import { usePrefersReducedMotion } from '@/lib/useDialog';

// ─────────────────────────────────────────────────────────────────────────────
// THE ACTIVE INDICATOR
//
// The highlight behind the current tab is ONE element that Framer Motion moves
// between list items via `layoutId`, rather than a background that appears on
// one item and disappears from another. The difference matters: the sliding
// element is a continuous object the eye tracks from the old tab to the new
// one, which is the thing that makes an app feel built rather than assembled.
//
// Two DISTINCT layoutIds, not one. The sidebar and the tab bar are both in the
// DOM at every viewport — only CSS hides one — so a shared layoutId would give
// Framer two live claimants for the same element and it would fly between the
// sidebar and the bottom bar on every navigation.
//
// 260ms, and 0ms under reduced motion. The nav is the most-clicked surface in
// the app; anything slower puts a wait in front of every screen change.
// ─────────────────────────────────────────────────────────────────────────────

function indicatorTransition(reduced: boolean) {
  return reduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 480, damping: 42, mass: 0.7 };
}

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Shown on the tab as a small count — unread messages, etc. */
  badge?: number;
}

const icon = (path: string) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
);

const ICONS = {
  home: icon('M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5'),
  calendar: icon('M8 2v4M16 2v4M3 9h18M4 6h16v15H4z'),
  garage: icon('M3 21V9l9-6 9 6v12M7 21v-6h10v6'),
  chat: icon('M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z'),
  // Lightbulb — the advisor gives tips and suggestions, so a bulb reads truer
  // than a speech bubble now that there is no back-and-forth chat behind it.
  advice: icon('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.3 2.2h4.6c.2-.9.7-1.7 1.3-2.2A6 6 0 0 0 12 3z'),
  user: icon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
  clipboard: icon('M9 3h6v3H9zM7 5H5v16h14V5h-2'),
  chart: icon('M4 20V10M10 20V4M16 20v-7M22 20H2'),
  cog: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6V2a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 14 3.7'),
  users: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9'),
};

export function navFor(role: Role, counts: { messages?: number } = {}): NavItem[] {
  const customer: NavItem[] = [
    { href: '/app', label: 'Home', icon: ICONS.home },
    { href: '/app/appointments', label: 'Bookings', icon: ICONS.calendar },
    { href: '/app/garage', label: 'Garage', icon: ICONS.garage },
    { href: '/app/assistant', label: 'Advice', icon: ICONS.advice },
    { href: '/app/profile', label: 'Profile', icon: ICONS.user },
  ];

  if (role === 'customer') return customer;

  const staff: NavItem[] = [
    { href: '/staff', label: 'Today', icon: ICONS.home },
    { href: '/staff/schedule', label: 'Schedule', icon: ICONS.calendar },
    { href: '/staff/jobs', label: 'Jobs', icon: ICONS.clipboard },
    { href: '/staff/messages', label: 'Messages', icon: ICONS.chat, badge: counts.messages },
    { href: '/app/profile', label: 'Profile', icon: ICONS.user },
  ];

  if (role === 'employee') return staff;

  // Managers and above swap the profile tab for the business view; the profile
  // is still reachable from the header menu.
  return [
    { href: '/admin', label: 'Business', icon: ICONS.chart },
    { href: '/admin/schedule', label: 'Schedule', icon: ICONS.calendar },
    { href: '/admin/customers', label: 'Customers', icon: ICONS.users },
    { href: '/staff/messages', label: 'Messages', icon: ICONS.chat, badge: counts.messages },
    { href: '/admin/settings', label: 'Settings', icon: ICONS.cog },
  ];
}

function isActive(pathname: string, href: string): boolean {
  // Exact match for the section roots, prefix match for everything below them,
  // so /app/appointments/123 still highlights "Bookings" but /app/garage does
  // not also highlight "Home".
  if (href === '/app' || href === '/staff' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();

  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 border-r border-white/10 lg:block">
      <ul className="sticky top-0 space-y-1 p-4">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'group relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors duration-200',
                  active ? 'text-white' : 'text-muted hover:bg-white/5 hover:text-white'
                )}
              >
                {active && (
                  // The travelling highlight. aria-hidden and behind the label:
                  // `aria-current` above is what actually announces the state.
                  <motion.span
                    layoutId="sidebar-active-tab"
                    aria-hidden="true"
                    transition={indicatorTransition(reduced)}
                    className="absolute inset-0 rounded-sm border-l-2 border-apex bg-apex/10"
                  />
                )}
                <span className={clsx('relative', active ? 'text-flare' : '')}>{item.icon}</span>
                <span className="relative flex-1">{item.label}</span>
                {!!item.badge && (
                  <span className="relative rounded-full bg-apex px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();

  return (
    <nav
      aria-label="Main"
      // pb-[env(safe-area-inset-bottom)] keeps the tabs clear of the iPhone
      // home indicator once the app is installed to the home screen. THIS MUST
      // NOT BE REMOVED — without it the last row of tabs sits under the
      // indicator and the bottom few pixels stop taking taps.
      //
      // Kept on `bg-obsidian/95` rather than switched to `.glass`: this bar
      // sits directly over the scrolling list, and a translucent glass panel
      // there would let list text ghost through under the tab labels. The tab
      // bar is a control surface, not a decorative one.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-obsidian/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors duration-200',
                  active ? 'text-flare' : 'text-subtle'
                )}
              >
                {active && (
                  // A 2px rule that slides along the top edge of the bar. On a
                  // phone this reads at a glance without the tint that would
                  // otherwise fight the icon colour.
                  <motion.span
                    layoutId="tabbar-active-tab"
                    aria-hidden="true"
                    transition={indicatorTransition(reduced)}
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-apex"
                  />
                )}
                {item.icon}
                <span className="font-mono uppercase tracking-wider">{item.label}</span>
                {!!item.badge && (
                  <span className="absolute right-1/2 top-1.5 translate-x-3 rounded-full bg-apex px-1 font-mono text-[9px] text-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
