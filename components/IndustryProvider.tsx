'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { IndustryConfig, getIndustry } from '@/lib/industries';
import { Industry } from '@/lib/types';

interface IndustryContextValue {
  industry: Industry;
  config: IndustryConfig;
  setIndustry: (i: Industry) => void;
  /** True until the visitor has actively chosen — drives the hero selector. */
  hasChosen: boolean;
}

const IndustryContext = createContext<IndustryContextValue | null>(null);

const STORAGE_KEY = 'apex.industry';

export function IndustryProvider({ children }: { children: React.ReactNode }) {
  // Deliberately NOT reading localStorage during the initial render — that
  // would desync server and client HTML and trip a hydration error. The stored
  // preference is applied in the effect below, after hydration.
  const [industry, setIndustryState] = useState<Industry>('automotive');
  const [hasChosen, setHasChosen] = useState(false);

  const setIndustry = useCallback((next: Industry) => {
    setIndustryState(next);
    setHasChosen(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — the choice still applies for
      // this session, it just won't be remembered.
    }
  }, []);

  const value = useMemo<IndustryContextValue>(
    () => ({ industry, config: getIndustry(industry), setIndustry, hasChosen }),
    [industry, setIndustry, hasChosen]
  );

  return <IndustryContext.Provider value={value}>{children}</IndustryContext.Provider>;
}

export function useIndustry(): IndustryContextValue {
  const ctx = useContext(IndustryContext);
  if (!ctx) throw new Error('useIndustry must be used inside <IndustryProvider>');
  return ctx;
}
