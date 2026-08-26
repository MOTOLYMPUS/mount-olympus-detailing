// ─────────────────────────────────────────────────────────────────────────────
// Shared UI kit for the app.
//
// The marketing site's components (Hero, ServicesGrid…) are page-specific. The
// app needs a small set of repeatable primitives instead, all built from the
// existing Tailwind tokens in tailwind.config.ts — obsidian / apex / muted /
// subtle — so the app and the website are visibly the same product.
//
// Everything here is a SERVER component unless it needs state. Keeping the
// default on the server is what stops the app bundle growing with every screen.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import clsx from 'clsx';

// ── Layout ───────────────────────────────────────────────────────────────────

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-bold tracking-tightest text-white sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  return (
    <Tag
      className={clsx(
        'rounded-sm border border-white/10 bg-charcoal/40 p-5 shadow-card backdrop-blur-xs',
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">{children}</h2>
      {action}
    </div>
  );
}

/**
 * The empty state is a first-class screen, not an afterthought — a new customer
 * sees more of these than anything else, so each one says what to do next.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-sm border border-dashed border-white/15 px-6 py-14 text-center">
      {icon && <div className="mb-4 text-subtle">{icon}</div>}
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ── Data display ─────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  /**
   * ReactNode rather than `string` so a caller can pass an animated
   * <Counter> in place of a pre-formatted figure. Every existing caller
   * passes a string, which is still valid — this only widens the type.
   */
  value: React.ReactNode;
  sub?: string;
  /** Percentage change vs. the comparison period. */
  trend?: number | null;
}) {
  return (
    <Card className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest2 text-subtle">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold tracking-tightest text-white">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {sub && <span className="text-[12px] text-muted">{sub}</span>}
        {trend !== undefined && trend !== null && (
          <span
            className={clsx(
              'font-mono text-[11px]',
              trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-flare' : 'text-subtle'
            )}
          >
            {trend > 0 ? '▲' : trend < 0 ? '▼' : '–'} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
    </Card>
  );
}

const BADGE_TONES = {
  neutral: 'border-white/20 text-muted',
  positive: 'border-emerald-500/40 text-emerald-400',
  warning: 'border-amber-500/40 text-amber-400',
  danger: 'border-apex/50 text-flare',
  info: 'border-sky-500/40 text-sky-400',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest2',
        BADGE_TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

/** Appointment and job statuses share a vocabulary; map it once. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    scheduled: { tone: 'info', label: 'Scheduled' },
    confirmed: { tone: 'positive', label: 'Confirmed' },
    in_progress: { tone: 'warning', label: 'In progress' },
    completed: { tone: 'positive', label: 'Completed' },
    cancelled: { tone: 'danger', label: 'Cancelled' },
    no_show: { tone: 'danger', label: 'No show' },
    assigned: { tone: 'neutral', label: 'Assigned' },
    paused: { tone: 'warning', label: 'Paused' },
    new: { tone: 'info', label: 'New' },
    contacted: { tone: 'neutral', label: 'Contacted' },
    closed: { tone: 'neutral', label: 'Closed' },
    draft: { tone: 'neutral', label: 'Draft' },
    sent: { tone: 'info', label: 'Sent' },
    paid: { tone: 'positive', label: 'Paid' },
    void: { tone: 'danger', label: 'Void' },
  };
  const entry = map[status] ?? { tone: 'neutral' as BadgeTone, label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/** Definition row used across detail panels. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-2.5 last:border-0">
      <dt className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">{label}</dt>
      <dd className="text-right text-sm text-white">{children}</dd>
    </div>
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

const BUTTON_VARIANTS = {
  primary: 'bg-apex text-white hover:bg-apex/90',
  secondary: 'border border-white/25 text-white hover:border-white/60',
  ghost: 'text-muted hover:text-white',
  danger: 'border border-apex/50 text-flare hover:bg-apex/10',
} as const;

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-[12px]',
  md: 'px-5 py-2.5 text-sm',
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = 'primary',
  size: keyof typeof BUTTON_SIZES = 'md',
  className?: string
) {
  return clsx(
    'inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className
  );
}

export function LinkButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'positive';
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: 'border-sky-500/30 bg-sky-500/5 text-sky-100',
    warning: 'border-amber-500/30 bg-amber-500/5 text-amber-100',
    danger: 'border-apex/40 bg-apex/5 text-red-100',
    positive: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100',
  };
  return (
    <div className={clsx('rounded-sm border px-4 py-3 text-sm', tones[tone])} role="status">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className="text-[13px] leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

/**
 * Horizontal bar chart. Deliberately CSS-only rather than pulling in a charting
 * library: a bar is a div with a width, it renders on the server, it needs no
 * JavaScript, and it stays readable at any width.
 */
export function BarChart({
  data,
  format = (n) => String(n),
}: {
  data: { key: string; value: number }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-subtle">No data for this period.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] text-white">{d.key}</span>
            <span className="shrink-0 font-mono text-[12px] text-muted">{format(d.value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-apex"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Sparkline-style column chart for a daily revenue series. */
export function ColumnChart({
  data,
  format = (n) => String(n),
}: {
  data: { key: string; value: number }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-subtle">No data for this period.</p>;
  }
  return (
    <div className="flex h-32 items-end gap-1 overflow-x-auto" role="img" aria-label="Revenue by day">
      {data.map((d) => (
        <div key={d.key} className="group flex min-w-[8px] flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t-sm bg-apex/70 transition-colors group-hover:bg-apex"
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            title={`${d.key}: ${format(d.value)}`}
          />
        </div>
      ))}
    </div>
  );
}
