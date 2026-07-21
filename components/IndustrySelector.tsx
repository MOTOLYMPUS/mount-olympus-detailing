'use client';

import { industryList } from '@/lib/industries';
import { Industry } from '@/lib/types';
import { useIndustry } from './IndustryProvider';
import { IndustryIcon } from './icons';

/**
 * The three industry cards in the hero. Rendered as a radiogroup so screen
 * readers announce the selected mode and arrow keys move between options —
 * these are mutually exclusive modes, not independent buttons.
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
            className={`group relative flex flex-col items-start gap-3 overflow-hidden rounded-md border p-5 text-left transition-all duration-300 ease-apex sm:p-6 ${
              active
                ? 'border-apex bg-apex/10 shadow-[0_0_30px_rgba(212,0,26,0.18)]'
                : 'border-white/20 bg-obsidian/50 backdrop-blur-sm hover:border-white/50 hover:bg-obsidian/70'
            }`}
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-sm border transition-colors duration-300 ${
                active ? 'border-apex/60 bg-apex/15 text-white' : 'border-white/20 text-muted'
              }`}
            >
              <IndustryIcon name={cfg.icon} className="h-6 w-6" />
            </span>

            <span className="font-display text-lg font-bold tracking-tight text-white">
              {cfg.label}
            </span>
            <span className="text-[13px] leading-snug text-muted">{cfg.tagline}</span>

            <span
              aria-hidden="true"
              className={`mt-1 font-mono text-[10px] uppercase tracking-widest2 transition-colors duration-300 ${
                active ? 'text-apex' : 'text-subtle group-hover:text-white'
              }`}
            >
              {active ? '● Selected' : 'Select →'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
