// ─────────────────────────────────────────────────────────────────────────────
// /admin/settings — business configuration.
//
// requireRolePage('admin'). These fields decide when the business can be
// booked and what a member pays; a manager running today's schedule has no
// reason to be able to close the calendar for the next three months.
//
// The page loads the current values on the server and hands them to one client
// editor. Doing it the other way — an empty form that fetches on mount — would
// show blank inputs for a moment, and a blank number field on a settings screen
// looks like a value of zero.
// ─────────────────────────────────────────────────────────────────────────────

import { Alert, LinkButton, PageHeader } from '@/components/ui';
import SettingsEditor from '@/components/admin/SettingsEditor';
import { requireRolePage } from '@/lib/guards';
import {
  getSchedulingConfig,
  listHolidays,
  listServiceAreas,
} from '@/lib/repo/settings';
import { listPlans } from '@/lib/repo/loyalty';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  requireRolePage('admin', '/admin/settings');

  const config = getSchedulingConfig();

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Opening hours, scheduling policy, closures, service areas and membership plans."
        action={<LinkButton href="/admin/pricing">Edit pricing</LinkButton>}
      />

      <Alert tone="warning" title="These take effect immediately">
        Every field here feeds the live booking calendar. Shortening the buffer or the notice period
        changes what customers can book the moment you save — there is no draft state.
      </Alert>

      <div className="mt-6">
        <SettingsEditor
          config={config}
          holidays={listHolidays()}
          // Retired areas are included so they can be seen, not just their
          // absence inferred.
          areas={listServiceAreas(false)}
          plans={listPlans(false)}
        />
      </div>
    </>
  );
}
