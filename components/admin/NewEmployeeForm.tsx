'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Hire someone.
//
// THE ROLE LIST IS NOT BUILT HERE. It is passed in, already filtered by
// `assignableRoles(actor.role)` on the server, and the API filters it AGAIN on
// submit. A <select> is a suggestion, not a control — anyone can post whatever
// value they like — so the client copy exists purely so the admin is not
// offered an option that will be refused.
//
// The generated password is shown ONCE, in a panel that stays until dismissed.
// It is never stored recoverably, so there is no second chance to read it; the
// UI says so explicitly rather than letting an admin close the tab and find out.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, buttonClass } from '@/components/ui';
import { InputField, SelectField } from '@/components/Field';
import { Role } from '@/lib/models';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/rbac';

export default function NewEmployeeForm({ roles }: { roles: Role[] }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<string>(roles.includes('employee') ? 'employee' : (roles[0] ?? ''));
  const [rate, setRate] = useState('');

  async function submit() {
    setPending(true);
    setBanner('');
    setFieldErrors({});

    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          role,
          // The admin types dollars per hour; the column is cents.
          hourlyRate: rate ? Math.round(Number(rate) * 100) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setFieldErrors(data.errors ?? {});
        if (!Object.keys(data.errors ?? {}).length) {
          setBanner(data.error ?? 'That did not work. Please try again.');
        }
        return;
      }

      setCreated({ name, email, password: data.initialPassword });
      setName('');
      setEmail('');
      setPhone('');
      setRate('');
      setOpen(false);
      router.refresh();
    } catch {
      setBanner('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (roles.length === 0) {
    return (
      <Alert tone="warning">
        Your role cannot grant any staff role, so you cannot add people. An administrator can.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {created && (
        <Alert tone="positive" title={`${created.name} can now sign in`}>
          <p>
            Give them this one-time password in person or by phone — never by email, and it is not
            shown again:
          </p>
          <p className="my-2 select-all rounded-sm border border-white/20 bg-obsidian px-3 py-2 font-mono text-base text-white">
            {created.password}
          </p>
          <p>
            Username is {created.email}. They should change it after their first sign-in; you can
            also send them a reset link from their profile.
          </p>
          <button type="button" onClick={() => setCreated(null)} className={buttonClass('ghost', 'sm', 'mt-2 px-0')}>
            Dismiss
          </button>
        </Alert>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass('primary', 'sm')}>
          Add a staff member
        </button>
      ) : (
        <div className="space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
          {banner && <Alert tone="danger">{banner}</Alert>}

          <div className="grid gap-3 sm:grid-cols-2">
            <InputField label="Full name" value={name} onChange={setName} required error={fieldErrors.name} />
            <InputField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="off"
              error={fieldErrors.email}
            />
            <InputField label="Phone" type="tel" value={phone} onChange={setPhone} />
            <InputField
              label="Hourly rate (USD)"
              value={rate}
              onChange={setRate}
              inputMode="numeric"
              hint="Leave blank for salaried staff."
            />
            <SelectField
              label="Role"
              value={role}
              onChange={setRole}
              required
              error={fieldErrors.role}
              placeholder="Choose a role"
              hint={role ? ROLE_DESCRIPTION[role as Role] : 'You can only grant roles below your own.'}
              options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !name || !email || !role}
              onClick={submit}
              className={buttonClass('primary', 'sm')}
            >
              {pending ? 'Creating…' : 'Create account'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'sm')}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
