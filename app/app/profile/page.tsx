import { requirePage } from '@/lib/guards';
import { toPublicUser } from '@/lib/models';
import { ROLE_LABEL } from '@/lib/rbac';
import { PasswordForm, ProfileForm } from '@/components/account/ProfileForm';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import PushToggle from '@/components/pwa/PushToggle';
import { Card, CardTitle, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile & settings' };

export default function ProfilePage() {
  const user = requirePage('/app/profile');

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        eyebrow={ROLE_LABEL[user.role]}
        title="Profile & settings"
        description="Your contact details, how we reach you, and how the app behaves on this device."
      />

      <Card>
        <CardTitle>Your details</CardTitle>
        <ProfileForm user={toPublicUser(user)} />
      </Card>

      <Card>
        <CardTitle>Notifications</CardTitle>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Push notifications tell you about booking confirmations, reminders, and when your vehicle
          is ready — without needing the app open.
        </p>
        <PushToggle />
      </Card>

      <Card>
        <CardTitle>Install the app</CardTitle>
        <InstallPrompt variant="inline" />
      </Card>

      <Card>
        <CardTitle>Password</CardTitle>
        <PasswordForm />
      </Card>
    </div>
  );
}
