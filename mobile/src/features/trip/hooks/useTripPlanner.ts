import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addDays, localDayKey } from '@/lib/dates';
import type { TripBriefing } from '@/services/api/schemas';
import { requestTripBriefing } from '@/services/api/trip';
import { usePreferences } from '@/storage/preferences';

import { MAX_TRIP_DAYS, clearTrip, loadTrip, saveTrip, type TripDraft } from '../tripStore';

function freshDraft(): TripDraft {
  return { destination: '', startDate: localDayKey(new Date()), days: 3, stay: '', needs: '' };
}

export function useTripPlanner() {
  const { travelerLocale, residentLocale, homeCurrency } = usePreferences();
  const [draft, setDraft] = useState<TripDraft>(freshDraft);
  const [briefing, setBriefing] = useState<TripBriefing | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadTrip().then((stored) => {
      if (!mounted.current) return;
      if (stored) {
        setDraft(stored.draft);
        setBriefing(stored.briefing);
      }
      setLoaded(true);
    });
    return () => {
      mounted.current = false;
      void Speech.stop();
    };
  }, []);

  const updateDraft = useCallback((patch: Partial<TripDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const shiftStart = useCallback((delta: number) => {
    setDraft((current) => {
      const next = addDays(current.startDate, delta);
      return next < localDayKey(new Date()) ? current : { ...current, startDate: next };
    });
  }, []);

  const changeLength = useCallback((delta: number) => {
    setDraft((current) => ({ ...current, days: Math.min(MAX_TRIP_DAYS, Math.max(1, current.days + delta)) }));
  }, []);

  const plan = useCallback(async () => {
    const destination = draft.destination.trim();
    if (destination.length < 2) {
      setError('Tell Songa where you are going first.');
      return;
    }
    setError(null);
    setPlanning(true);
    const result = await requestTripBriefing({
      destination,
      startDate: draft.startDate,
      days: draft.days,
      stay: draft.stay.trim() || null,
      needs: draft.needs.trim() || null,
      travelerLocale,
      destinationLocale: residentLocale,
      homeCurrency,
    });
    if (!mounted.current) return;
    setPlanning(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setBriefing(result.data);
    setEditing(false);
    const saved = await saveTrip({ draft, briefing: result.data, plannedAt: new Date().toISOString() });
    if (!saved && mounted.current) setError('Your trip is ready but could not be saved for offline use.');
  }, [draft, homeCurrency, residentLocale, travelerLocale]);

  const speakPhrase = useCallback(
    (phrase: string) => {
      if (!briefing) return;
      void Speech.stop().then(() => Speech.speak(phrase, { language: briefing.destination_locale }));
    },
    [briefing],
  );

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
    void loadTrip().then((stored) => {
      if (stored && mounted.current) setDraft(stored.draft);
    });
  }, []);

  const startOver = useCallback(() => {
    void Speech.stop();
    void clearTrip();
    setBriefing(null);
    setEditing(false);
    setError(null);
    setDraft(freshDraft());
  }, []);

  return {
    loaded,
    draft,
    briefing,
    planning,
    error,
    showForm: !briefing || editing,
    canCancelEdit: briefing !== null && editing,
    travelerLocale,
    dismissError: () => setError(null),
    updateDraft,
    shiftStart,
    changeLength,
    plan,
    speakPhrase,
    editTrip: () => setEditing(true),
    cancelEdit,
    startOver,
  };
}

export type TripPlanner = ReturnType<typeof useTripPlanner>;
