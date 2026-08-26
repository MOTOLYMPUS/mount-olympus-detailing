'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Profile and password forms.
//
// Note what is NOT here: role, account status, and email address. Role and
// status are administrative and live in the admin screens; email is the
// account identifier and changing it needs a verification flow that does not
// exist yet, so offering the field would be a lie. See the audit.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InputField } from '@/components/Field';
import { Alert, buttonClass } from '@/components/ui';
import { PublicUser } from '@/lib/models';

export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address);
  const [smsConsent, setSmsConsent] = useState(user.smsConsent);

  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setBanner('');
    setSaved(false);
    setErrors({});

    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, address, smsConsent }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? {});
        if (!Object.keys(data.errors ?? {}).length) {
          setBanner(data.error ?? 'We could not save that.');
        }
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setBanner('You appear to be offline. Your changes were not saved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {banner && <Alert tone="danger">{banner}</Alert>}
      {saved && <Alert tone="positive">Saved.</Alert>}

      <InputField label="Full name" value={name} onChange={setName} required autoComplete="name" error={errors.name} />

      <InputField
        label="Email"
        value={user.email}
        onChange={() => {}}
        disabled
        hint="Your email is your sign-in. Contact us if you need it changed."
      />

      <InputField
        label="Mobile"
        type="tel"
        value={phone}
        onChange={setPhone}
        required
        autoComplete="tel"
        inputMode="tel"
        error={errors.phone}
      />

      <InputField
        label="Default service address"
        value={address}
        onChange={setAddress}
        maxLength={200}
        autoComplete="street-address"
        hint="Pre-filled when you book mobile service. You can always change it per booking."
      />

      <label className="flex cursor-pointer items-start gap-3 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={smsConsent}
          onChange={(e) => setSmsConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4001A]"
        />
        <span>
          Text me booking confirmations and reminders. Message and data rates may apply; reply STOP
          at any time.
        </span>
      </label>

      <button type="submit" disabled={pending} className={buttonClass('primary')}>
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

// ── Password ─────────────────────────────────────────────────────────────────

export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setBanner('');

    if (password !== confirm) {
      setErrors({ confirm: 'Those passwords do not match.' });
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? {});
        if (!Object.keys(data.errors ?? {}).length) {
          setBanner(data.error ?? 'We could not change your password.');
        }
        return;
      }

      // The API revokes every session including this one, so there is nothing
      // to stay on — send them to sign in with the new password.
      router.replace('/login?changed=1');
      router.refresh();
    } catch {
      setBanner('You appear to be offline.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {banner && <Alert tone="danger">{banner}</Alert>}

      <Alert tone="info">
        Changing your password signs you out on every device — including this one.
      </Alert>

      <PasswordInput label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" error={errors.current} />
      <PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" error={errors.password} hint="At least 10 characters." />
      <PasswordInput label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={errors.confirm} />

      <button type="submit" disabled={pending} className={buttonClass('secondary')}>
        {pending ? 'Updating…' : 'Change password'}
      </button>
    </form>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const id = `pf-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
        {label}
      </label>
      <input
        id={id}
        type="password"
        className="input-field"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        required
      />
      {hint && !error && <p className="text-[12px] text-subtle">{hint}</p>}
      {error && (
        <p className="text-[12px] text-flare" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
