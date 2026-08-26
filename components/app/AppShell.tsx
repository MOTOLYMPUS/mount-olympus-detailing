'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The chrome every signed-in screen sits inside.
//
// A client component only because the nav needs `usePathname()` to highlight
// the current tab. The PAGES it wraps stay server components — the shell takes
// `children` rather than rendering them, so nothing below it is pulled into the
// client bundle.
//
// AMBIENT BACKDROP — AND WHY IT IS THE WEAKEST ONE IN THE CODEBASE.
// This is a utility app. A technician opens a job with wet hands in a driveway
// and an owner checks revenue between jobs; neither is here to look at
// particles. So the shell gets `intensity="subtle"` (texture at 40% opacity,
// mesh at 40%) with the photo layer OFF, and nothing else — no motes, no
// parallax, no light sweep. Just enough to stop a full-viewport #050505 from
// reading as a void, and to kill the gradient banding that flat dark panels
// show on 8-bit displays.
//
// It is `fixed`, not `absolute`, so it does not scroll: a texture that slides
// under a long list is motion in the reader's peripheral vision on every scroll
// event, which is exactly the hostility the brief warns about. Fixed means the
// backdrop is a single composited layer the scroll never touches.
//
// `-z-10 isolate` — `isolate` contains Backdrop's own internal `-z-10` layers
// inside this wrapper, and `-z-10` puts the wrapper behind the shell's content.
// The root <div> intentionally has NO background: <body> already paints
// obsidian (which propagates to the canvas, below negative-z content), and a
// background here would paint over this layer and hide it entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { PublicUser } from '@/lib/models';
import Backdrop from '@/components/visual/Backdrop';
import AppHeader from './AppHeader';
import { Sidebar, TabBar, navFor } from './AppNav';

export default function AppShell({
  user,
  unreadNotifications,
  unreadMessages,
  children,
}: {
  user: PublicUser;
  unreadNotifications: number;
  unreadMessages: number;
  children: React.ReactNode;
}) {
  const items = navFor(user.role, { messages: unreadMessages });

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 isolate" aria-hidden="true">
        <Backdrop texture="carbon" photo={false} mesh grain intensity="subtle" />
      </div>

      <a href="#app-main" className="skip-link">
        Skip to content
      </a>

      <AppHeader user={user} unreadNotifications={unreadNotifications} />

      <div className="mx-auto flex w-full max-w-7xl">
        <Sidebar items={items} />

        {/* pb-24 clears the mobile tab bar; lg:pb-12 drops it once the tabs are
            replaced by the sidebar. */}
        <main id="app-main" className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      <TabBar items={items} />
    </div>
  );
}
