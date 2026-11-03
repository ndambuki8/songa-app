import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

import { DEFAULT_RESIDENT_LOCALE, DEFAULT_TRAVELER_LOCALE, findLanguage } from '@/config/languages';

import { STORAGE_KEYS, readJson, writeJson } from './keyValue';

const NeedsSchema = z.object({
  allergies: z.array(z.string()),
  diet: z.array(z.string()),
  /** Free text: medicines, conditions, anything a waiter or pharmacist should know. */
  notes: z.string(),
});
export type TravelerNeeds = z.infer<typeof NeedsSchema>;

export const EMPTY_NEEDS: TravelerNeeds = { allergies: [], diet: [], notes: '' };

const PreferencesSchema = z.object({
  travelerLocale: z.string(),
  residentLocale: z.string(),
  needs: NeedsSchema.default(EMPTY_NEEDS),
});
type Preferences = z.infer<typeof PreferencesSchema>;

interface PreferencesContextValue extends Preferences {
  homeCurrency: string;
  /** One-line summary of the needs for model prompts, or null when none are set. */
  needsSummary: string | null;
  setTravelerLocale: (locale: string) => void;
  setResidentLocale: (locale: string) => void;
  setNeeds: (needs: TravelerNeeds) => void;
}

const DEFAULTS: Preferences = {
  travelerLocale: DEFAULT_TRAVELER_LOCALE,
  residentLocale: DEFAULT_RESIDENT_LOCALE,
  needs: EMPTY_NEEDS,
};

export function hasNeeds(needs: TravelerNeeds): boolean {
  return needs.allergies.length > 0 || needs.diet.length > 0 || needs.notes.trim().length > 0;
}

export function summarizeNeeds(needs: TravelerNeeds): string | null {
  if (!hasNeeds(needs)) return null;
  const parts: string[] = [];
  if (needs.allergies.length > 0) parts.push(`Allergies: ${needs.allergies.join(', ')}`);
  if (needs.diet.length > 0) parts.push(`Diet: ${needs.diet.join(', ')}`);
  if (needs.notes.trim()) parts.push(`Notes: ${needs.notes.trim()}`);
  return parts.join('. ').slice(0, 500);
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    void readJson(STORAGE_KEYS.preferences, PreferencesSchema).then((stored) => {
      if (stored) setPreferences(stored);
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
      homeCurrency: findLanguage(preferences.travelerLocale).currency,
      needsSummary: summarizeNeeds(preferences.needs),
      setTravelerLocale: (travelerLocale) => update({ travelerLocale }),
      setResidentLocale: (residentLocale) => update({ residentLocale }),
      setNeeds: (needs) => update({ needs }),
    }),
    [preferences, update],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
