// ─────────────────────────────────────────────────────────────────────────────
// /admin/settings/tax — the business tax profile.
//
// requireRolePage('admin'): tax data, same floor as /admin/expenses. Loads the
// current profile on the server and hands it to one client editor, like
// /admin/settings, so no field ever flashes blank.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { Alert, LinkButton, PageHeader } from '@/components/ui';
import TaxProfileEditor from '@/components/admin/TaxProfileEditor';
import { requireRolePage } from '@/lib/guards';
import { getSchedulingConfig, getTaxProfile } from '@/lib/repo/settings';
import { todayIso } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tax profile',
  robots: { index: false, follow: false },
};

export default async function TaxProfilePage() {
  await requireRolePage('admin', '/admin/settings/tax');

  const profile = getTaxProfile();
  const thisYear = todayIso(getSchedulingConfig().timezone).slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Tax profile"
        description="The business facts your Schedule C needs, the address every trip starts from, and the IRS mileage rate for each year."
        action={<LinkButton href="/admin/mileage">Mileage log</LinkButton>}
      />

      {!profile.baseAddress && (
        <div className="mb-6">
          <Alert tone="warning" title="Add your business address">
            Completed mobile jobs log a round trip from this address. Until it is set, those trips are
            saved without miles and flagged for you to fill in.
          </Alert>
        </div>
      )}
      {!(thisYear in profile.mileageRates) && (
        <div className="mb-6">
          <Alert tone="warning" title={`No mileage rate for ${thisYear}`}>
            Standard-mileage vehicles show no deduction for {thisYear} until you add the IRS rate below.
          </Alert>
        </div>
      )}

      <TaxProfileEditor profile={profile} />

      <p className="mt-6 text-[12px] leading-relaxed text-subtle">
        This organises your records for your tax preparer. It is not tax advice.
      </p>
    </>
  );
}
