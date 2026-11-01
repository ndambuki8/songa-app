import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

import { DEFAULT_RESIDENT_LOCALE, DEFAULT_TRAVELER_LOCALE, findLanguage } from '@/config/languages';

import { STORAGE_KEYS, readJson, writeJson } from './keyValue';

const PreferencesSchema = z.object({
  travelerLocale: z.string(),
  residentLocale: z.string(),
  onboarded: z.boolean().optional(),
});
type Preferences = z.infer<typeof PreferencesSchema>;

interface PreferencesContextValue extends Preferences {
  loaded: boolean;
  homeCurrency: string;
  setTravelerLocale: (locale: string) => void;
  setResidentLocale: (locale: string) => void;
  completeOnboarding: () => void;
}

const DEFAULTS: Preferences = {
  travelerLocale: DEFAULT_TRAVELER_LOCALE,
  residentLocale: DEFAULT_RESIDENT_LOCALE,
  onboarded: false,
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void readJson(STORAGE_KEYS.preferences, PreferencesSchema).then((stored) => {
      if (stored) setPreferences(stored);
      setLoaded(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void writeJson(STORAGE_KEYS.preferences, next);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      loaded,
      homeCurrency: findLanguage(preferences.travelerLocale).currency,
      setTravelerLocale: (travelerLocale) => update({ travelerLocale }),
      setResidentLocale: (residentLocale) => update({ residentLocale }),
      completeOnboarding: () => update({ onboarded: true }),
    }),
    [loaded, preferences, update],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
