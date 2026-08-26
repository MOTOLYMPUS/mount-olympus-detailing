'use client';

import clsx from 'clsx';
import { industryList } from '@/lib/industries';
import { Industry } from '@/lib/types';
import { useIndustry } from './IndustryProvider';
import { IndustryIcon } from './icons';

/**
 * Per-card texture. Each one is the same visual shorthand the rest of the site
 * uses for that trade — carbon weave for automotive, water ripple for marine,
 * topographic contour (altitude) for aviation — so the card previews the world
 * the whole page is about to switch into.
 *
 * Held at low opacity and rendered in a `.layer` (absolute + pointer-events
 * none) so it can never intercept the click that selects the card. That matters
 * more than usual here: the decorative layer sits inside the interactive
 * control itself, not behind it.
 */
const CARD_TEXTURE: Record<string, string> = {
  automotive: 'tex-carbon',
  marine: 'ripple-layer',
  aviation: 'tex-topo',
};

/**
 * The three industry cards in the hero. Rendered as a radiogroup so screen
 * readers announce the selected mode and arrow keys move between options —
 * these are mutually exclusive modes, not independent buttons.
 *
 * ⚠️ EVERY ARIA ATTRIBUTE AND THE ROVING TABINDEX BELOW ARE LOAD-BEARING.
 * `role="radio"` + `aria-checked` + `tabIndex={active ? 0 : -1}` + the arrow-key
 * handler together are what make this a single tab stop that behaves like a
 * native radio group. The visual pass below changes classes only — not one
 * attribute, handler, or id was altered.
 */
export default function IndustrySelector({ compact = false }: { compact?: boolean }) {
  const { industry, setIndustry } = useIndustry();

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = (index + delta + industryList.length) % industryList.length;
    setIndustry(industryList[next].id as Industry);
    document.getElementById(`industry-card-${industryList[next].id}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Choose the industry you need detailing for"
      className={
        compact
          ? 'flex flex-wrap gap-2'
          : 'grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4'
      }
    >
      {industryList.map((cfg, i) => {
        const active = cfg.id === industry;

        if (compact) {
          return (
            <button
              key={cfg.id}
              id={`industry-card-${cfg.id}`}
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => setIndustry(cfg.id as Industry)}
              className={`flex items-center gap-2 rounded-sm border px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors duration-200 ${
                active
                  ? 'border-apex bg-apex/10 text-white'
                  : 'border-white/20 text-muted hover:border-white/45 hover:text-white'
              }`}
            >
              <IndustryIcon name={cfg.icon} className="h-4 w-4" />
              {cfg.label}
            </button>
          );
        }

        return (
          <button
            key={cfg.id}
            id={`industry-card-${cfg.id}`}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => setIndustry(cfg.id as Industry)}
            className={clsx(
              // `.glass` is affordable here: exactly three cards, above the
              // fold, and they never scroll as a list.
              'group glass gradient-border lift sweep-hover relative flex flex-col items-start gap-3 overflow-hidden rounded-md p-5 text-left sm:p-6',
              active && 'shadow-[0_0_30px_rgba(212,0,26,0.18)]'
            )}
          >
            {/* Industry texture. Decorative only — inert to the pointer and to
                assistive tech, so the whole card stays one clickable target. */}
            <span
              aria-hidden="true"
              className={clsx(
                'layer',
                CARD_TEXTURE[cfg.id],
                active ? 'opacity-70' : 'opacity-40'
              )}
            />
            {/* Selected tint AND the apex ring, in one layer.
                Not a `border-apex` class on the button: `.glass` in globals.css
                declares `border` and is defined AFTER `@tailwind utilities`, so
                it wins the cascade against any border utility. Painting the ring
                on a decorative layer sidesteps that entirely, and it also
                survives `.lift`'s hover box-shadow, which would otherwise
                replace a ring drawn with a shadow. */}
            <span
              aria-hidden="true"
              className={clsx(
                'layer rounded-md border border-apex bg-gradient-to-br from-apex/20 via-apex/5 to-transparent transition-opacity duration-300',
                active ? 'opacity-100' : 'opacity-0'
              )}
            />

            <span
              className={clsx(
                'relative flex h-11 w-11 items-center justify-center rounded-sm border transition-[transform,color,border-color] duration-300 ease-apex group-hover:scale-105',
                active ? 'border-apex/60 bg-apex/15 text-white' : 'border-white/20 text-muted'
              )}
            >
              <IndustryIcon name={cfg.icon} className="h-6 w-6" />
            </span>

            <span className="relative font-display text-lg font-bold tracking-tight text-white">
              {cfg.label}
            </span>
            <span className="relative text-[13px] leading-snug text-muted">{cfg.tagline}</span>

            <span
              aria-hidden="true"
              className={clsx(
                'relative mt-1 font-mono text-[10px] uppercase tracking-widest2 transition-colors duration-300',
                active ? 'text-flare' : 'text-subtle group-hover:text-white'
              )}
            >
              {active ? '● Selected' : 'Select →'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
