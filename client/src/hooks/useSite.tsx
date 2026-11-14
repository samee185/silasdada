import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { SiteProfile } from '../api/types';

type SiteState = { site: SiteProfile | null; error: string | null; reload: () => Promise<void>; setSite: (s: SiteProfile) => void };
const SiteContext = createContext<SiteState>({ site: null, error: null, reload: async () => {}, setSite: () => {} });

/** The public profile (name, photos, story, contacts) loaded once and shared by every page. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSite(await api.get<SiteProfile>('/api/site'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the site.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <SiteContext.Provider value={{ site, error, reload, setSite }}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
