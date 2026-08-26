'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Sign in, register, and password reset forms.
//
// All four share one submit helper so error handling, the disabled state, and
// the field-error shape behave identically. The API returns
// `{ ok:false, error, errors:{field:message} }`; `errors` maps to the inputs
// and `error` renders as a banner.
//
// Note there is no client-side password strength meter. The server owns the
// policy (lib/auth.ts) — duplicating it in the browser means two rules that
// drift apart, and the browser's copy is not a security control anyway.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { InputField } from '@/components/Field';
import { Alert, buttonClass } from '@/components/ui';

interface ApiFailure {
  error?: string;
  errors?: Record<string, string>;
}

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(
    url: string,
    body: unknown,
    method = 'POST'
  ): Promise<{ ok: boolean; data: any }> {
    setPending(true);
    setBanner('');
    setFieldErrors({});

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const failure = data as ApiFailure;
        setFieldErrors(failure.errors ?? {});
        // Only show the banner when there is no field error to point at,
        // otherwise the same problem is reported twice.
        if (!Object.keys(failure.errors ?? {}).length) {
          setBanner(failure.error ?? 'Something went wrong. Please try again.');
        }
        return { ok: false, data };
      }
      return { ok: true, data };
    } catch {
      setBanner('We could not reach the server. Check your connection and try again.');
      return { ok: false, data: null };
    } finally {
      setPending(false);
    }
  }

  return { submit, pending, banner, fieldErrors, setBanner };
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

// ── Sign in ──────────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { submit, pending, banner, fieldErrors } = useSubmit();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // `next` comes from the URL, so it is attacker-controllable. Only same-origin
  // ABSOLUTE PATHS are honoured — "//evil.com" and "https://evil.com" are both
  // rejected, which is what stops this being an open redirect.
  const rawNext = params.get('next') ?? '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await submit('/api/auth/login', { email, password });
    if (!ok) return;

    const role = data.user?.role ?? 'customer';
    const home = role === 'customer' ? '/app' : role === 'employee' ? '/staff' : '/admin';
    router.replace(next || home);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Wrap>
        {banner && <Alert tone="danger">{banner}</Alert>}

        <InputField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={fieldErrors.password}
        />

        <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="flex items-center justify-between text-[13px]">
          <Link href="/forgot-password" className="text-muted underline-offset-4 hover:text-white hover:underline">
            Forgot password?
          </Link>
          <Link href="/register" className="text-muted underline-offset-4 hover:text-white hover:underline">
            Create an account
          </Link>
        </div>
      </Wrap>
    </form>
  );
}

// ── Register ─────────────────────────────────────────────────────────────────

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { submit, pending, banner, fieldErrors } = useSubmit();

  const [name, setName] = useState('');
  // Prefilled when someone arrives from the estimate flow (`?email=`), so they
  // register with the same address the estimate was filed under — which is how
  // the estimate (and the vehicle seeded from it) links to the new account.
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [referralCode, setReferralCode] = useState(params.get('ref') ?? '');

  // Same safe same-origin check as LoginForm: `next` is attacker-controllable,
  // so only an absolute in-app path is honoured — "//evil.com" is rejected.
  // This is what lets the estimate flow hand a new customer straight into
  // /app/book after signup.
  const rawNext = params.get('next') ?? '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { ok } = await submit('/api/auth/register', {
      name,
      email,
      phone,
      password,
      smsConsent,
      referralCode,
    });
    if (!ok) return;
    router.replace(next || '/app');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Wrap>
        {banner && <Alert tone="danger">{banner}</Alert>}

        <InputField label="Full name" value={name} onChange={setName} autoComplete="name" required error={fieldErrors.name} />
        <InputField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required error={fieldErrors.email} />
        <InputField
          label="Mobile"
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          inputMode="tel"
          required
          error={fieldErrors.phone}
          hint="So we can reach you about your booking."
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={fieldErrors.password}
          hint="At least 10 characters. A short phrase works well."
        />
        <InputField
          label="Referral code"
          value={referralCode}
          onChange={setReferralCode}
          maxLength={8}
          hint="Optional — if a friend sent you, they get rewarded."
        />

        {/* TCPA: consent must be an explicit, unchecked-by-default opt-in.
            The estimate flow already works this way; so does this. */}
        <label className="flex cursor-pointer items-start gap-3 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4001A]"
          />
          <span>
            Text me booking confirmations and reminders. Message and data rates may apply; reply
            STOP at any time.
          </span>
        </label>

        <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
          {pending ? 'Creating your account…' : 'Create account'}
        </button>

        <p className="text-center text-[13px] text-muted">
          Already have an account?{' '}
          <Link href="/login" className="underline-offset-4 hover:text-white hover:underline">
            Sign in
          </Link>
        </p>
      </Wrap>
    </form>
  );
}

// ── Forgot password ──────────────────────────────────────────────────────────

export function ForgotPasswordForm() {
  const { submit, pending, banner, fieldErrors } = useSubmit();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { ok } = await submit('/api/auth/password', { email });
    // The endpoint answers identically whether or not the account exists, so
    // the UI must too — showing "sent" only on success would leak the
    // difference the API works hard to hide.
    if (ok) setSent(true);
  }

  if (sent) {
    return (
      <Wrap>
        <Alert tone="positive" title="Check your email">
          If that address has an account, a reset link is on its way. It expires in one hour.
        </Alert>
        <Link href="/login" className={buttonClass('secondary', 'md', 'w-full')}>
          Back to sign in
        </Link>
      </Wrap>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Wrap>
        {banner && <Alert tone="danger">{banner}</Alert>}
        <InputField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required error={fieldErrors.email} />
        <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
          {pending ? 'Sending…' : 'Send reset link'}
        </button>
        <Link href="/login" className="text-center text-[13px] text-muted underline-offset-4 hover:text-white hover:underline">
          Back to sign in
        </Link>
      </Wrap>
    </form>
  );
}

// ── Reset password ───────────────────────────────────────────────────────────

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { submit, pending, banner, fieldErrors } = useSubmit();

  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMismatch('');
    if (password !== confirm) {
      setMismatch('Those passwords do not match.');
      return;
    }
    const { ok } = await submit('/api/auth/password', { token, password }, 'PUT');
    if (ok) router.replace('/login?reset=1');
  }

  if (!token) {
    return (
      <Wrap>
        <Alert tone="danger" title="That link is not valid">
          Reset links expire after an hour and can only be used once. Request a new one.
        </Alert>
        <Link href="/forgot-password" className={buttonClass('primary', 'md', 'w-full')}>
          Request a new link
        </Link>
      </Wrap>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Wrap>
        {banner && <Alert tone="danger">{banner}</Alert>}
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={fieldErrors.password}
          hint="At least 10 characters."
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={mismatch}
        />
        <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
          {pending ? 'Updating…' : 'Set new password'}
        </button>
      </Wrap>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A password input with a reveal toggle.
//
// components/Field.tsx has no password variant and adding `type="password"`
// there would mean adding the toggle there too, for a control only these four
// forms use. Kept local instead.
// ─────────────────────────────────────────────────────────────────────────────

function PasswordField({
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
  const [visible, setVisible] = useState(false);
  const id = `pw-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
        {label}
        <span className="ml-1 text-flare" aria-hidden="true">
          *
        </span>
      </label>

      <div className="relative">
        <input
          id={id}
          className="input-field pr-16"
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 font-mono text-[11px] uppercase tracking-wider text-subtle transition-colors hover:text-white"
          // The toggle is a convenience, not content — announce its purpose,
          // not the current state of the characters.
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12px] leading-snug text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[12px] leading-snug text-flare" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
