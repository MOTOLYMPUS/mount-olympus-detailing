import { IndustryIcon as IndustryIconName } from '@/lib/industries';

interface Props {
  name: IndustryIconName;
  className?: string;
}

/**
 * Inline industry icons. Kept as local SVG rather than an icon package so they
 * add nothing to the bundle and inherit `currentColor` from the button state.
 */
export function IndustryIcon({ name, className }: Props) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  if (name === 'car') {
    return (
      <svg {...common}>
        <path d="M3 13.5l1.6-4.8A2.5 2.5 0 0 1 7 7h10a2.5 2.5 0 0 1 2.4 1.7L21 13.5" />
        <path d="M3 13.5h18v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4z" />
        <circle cx="7" cy="16" r="0.6" fill="currentColor" stroke="none" />
        <circle cx="17" cy="16" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === 'boat') {
    return (
      <svg {...common}>
        <path d="M3 17.5h18l-1.6 2.2a2 2 0 0 1-1.6.8H6.2a2 2 0 0 1-1.6-.8L3 17.5z" />
        <path d="M5 17.5V11l7-2.5 7 2.5v6.5" />
        <path d="M12 8.5V3.5" />
        <path d="M12 3.5l4 2-4 1.6" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 2.5c.8 0 1.4.9 1.4 2v5.1l7.1 4v2l-7.1-2.1v3.9l2.2 1.6v1.6L12 19.4l-3.6 1.2v-1.6l2.2-1.6v-3.9L3.5 15.6v-2l7.1-4V4.5c0-1.1.6-2 1.4-2z" />
    </svg>
  );
}
