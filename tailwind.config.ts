import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#050505',
        white: '#FFFFFF',
        apex: '#D4001A', // reserved for CTA / hover / active / booking accents only
        charcoal: '#1A1A1A',
        smoke: '#EAEAEA',

        // Accessible greys. The previous design leaned on opacity modifiers
        // (text-smoke/40, text-white/30) that landed between 1.3:1 and 2.6:1
        // against #050505 — well under the WCAG AA 4.5:1 floor. These two are
        // measured against the page background:
        muted: '#B4B4B4', // ≈ 9.4:1  — secondary body copy
        subtle: '#8E8E8E', // ≈ 5.5:1  — labels, metadata, placeholders
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
        widest2: '0.28em',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        apex: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      boxShadow: {
        glass: '0 8px 40px rgba(0,0,0,0.45)',
        card: '0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 60px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
