'use client';

// ─────────────────────────────────────────────────────────────────────────────
// App header: brand lockup, notification bell, and the account menu.
//
// Sign-out is a POST, not a link. A GET logout can be triggered by any image
// tag on any site the user visits, which is a real (if petty) CSRF.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { business } from '@/lib/business';
import { PublicUser } from '@/lib/models';
import { ROLE_LABEL, isAdmin } from '@/lib/rbac';
import { usePrefersReducedMotion } from '@/lib/useDialog';

export default function AppHeader({
  user,
  unreadNotifications,
}: {
  user: PublicUser;
  unreadNotifications: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  // Close on outside click and on Escape — both are expected of a menu, and
  // without the Escape handler a keyboard user can be trapped in it.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // refresh() clears the cached server components that were rendered for the
    // signed-in user; without it the next render can briefly show their data.
    router.replace('/login');
    router.refresh();
  }

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    // `glass` rather than a flat translucent bar. This is the one surface in
    // the app that can afford `backdrop-filter`: it is a fixed-height strip
    // that never scrolls its own content, so the compositor re-samples a small
    // constant region instead of a long list on every frame.
    //
    // The obsidian scrim below is NOT redundant. `glass` is a near-transparent
    // white tint, and blurring a white card scrolling underneath still leaves a
    // pale wash — which is where `text-muted` (#B4B4B4) would drop under 4.5:1.
    // The scrim guarantees an effective floor of ~60% obsidian behind the
    // header text no matter what is passing beneath it. Content is `relative`
    // so it sits above the scrim.
    //
    // `.glass` supplies the 1px hairline itself (a full-perimeter border), so
    // there is no `border-b` here — adding one would double the bottom line.
    <header className="glass sticky top-0 z-30">
      <div className="pointer-events-none absolute inset-0 bg-obsidian/60" aria-hidden="true" />

      <div className="relative flex items-center gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/app"
          className="font-display text-[13px] font-bold tracking-tightest transition-opacity duration-200 hover:opacity-80"
        >
          <span className="text-white">{business.logo.lead}</span>{' '}
          <span className="text-flare">{business.logo.tail}</span>
        </Link>

        <div className="flex-1" />

        <Link
          href="/app/notifications"
          className="relative rounded-sm p-2 text-muted transition-colors duration-200 hover:bg-white/5 hover:text-white"
          aria-label={
            unreadNotifications
              ? `Notifications, ${unreadNotifications} unread`
              : 'Notifications'
          }
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {unreadNotifications > 0 && (
            // The unread dot gets a soft apex halo rather than a hard 2px
            // circle — a box-shadow set once at rest, never animated.
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-apex shadow-[0_0_0_3px_rgba(212,0,26,0.18)]"
              aria-hidden="true"
            />
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            // duration-200: this is UI feedback, not a reveal. Anything past
            // ~300ms on a control the user clicks all day reads as lag.
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-full border font-mono text-[11px] text-white transition-all duration-200 ease-apex hover:bg-white/5',
              open ? 'border-apex/70 bg-apex/10' : 'border-white/20 hover:border-white/50'
            )}
          >
            {initials || '?'}
          </button>

          {open && (
            <motion.div
              role="menu"
              // The menu grows out of the avatar it belongs to instead of
              // materialising in place. 140ms and transform/opacity only —
              // fast enough that it never delays the click that follows, and
              // collapsed to nothing when the user asks for reduced motion.
              initial={reduced ? false : { opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-11 w-56 origin-top-right rounded-sm border border-white/10 bg-charcoal p-1.5 shadow-glass"
            >
              <div className="border-b border-white/10 px-3 py-2.5">
                <p className="truncate text-sm text-white">{user.name}</p>
                <p className="truncate text-[12px] text-subtle">{user.email}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest2 text-flare">
                  {ROLE_LABEL[user.role]}
                </p>
              </div>

              <Link
                href="/app/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-sm px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                Profile & settings
              </Link>
              {/* Scheduling settings (hours, buffers, travel) used to be a
                  bottom tab for owners; it lives here now so the admin tab
                  bar stays at four tabs on a phone. Admin-gated to match the
                  page itself (requireRolePage('admin')). */}
              {isAdmin(user.role) && (
                <Link
                  href="/admin/settings"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block rounded-sm px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
                >
                  Manage calendar
                </Link>
              )}
              <Link
                href="/"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-sm px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                Main website
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-flare transition-colors hover:bg-apex/10"
              >
                Sign out
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
}
