import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { RECORDER_FAILURE_MESSAGES, useVoiceRecorder } from '@/features/audio/useVoiceRecorder';
import { createId, deviceTimeZone, localDayKey } from '@/lib/dates';
import { prepareImageForUpload } from '@/lib/imagePreparation';
import { transcribeAudio } from '@/services/api/dialogue';
import { compileItinerary, type LogbookPayloadEntry } from '@/services/api/logbook';
import { usePreferences } from '@/storage/preferences';

import {
  clearItinerary,
  deleteMedia,
  isUsableMoment,
  loadEntries,
  loadItinerary,
  momentsSignature,
  persistMedia,
  saveEntries,
  saveItinerary,
  type LogbookEntry,
  type StoredItinerary,
} from '../logbookStore';

const ITINERARY_PHOTO_MAX_EDGE = 1024;
export const MAX_PHOTOS_PER_DAY = 12;
/** Short pause before writing the day automatically, so a burst of changes triggers one rewrite. */
const AUTO_WRITE_DELAY_MS = 800;

/**
 * - `empty`: nothing usable to write up yet.
 * - `none`: moments exist but the day has not been written.
 * - `current`: the written day matches the moments.
 * - `outdated`: moments were added, edited or removed since the day was written.
 */
export type DayStatus = 'empty' | 'none' | 'current' | 'outdated';

/** Attaches coordinates only when location access was already granted; never prompts here. */
async function lastKnownCoordinates(): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return { latitude: null, longitude: null };
    const position = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    return { latitude: position?.coords.latitude ?? null, longitude: position?.coords.longitude ?? null };
  } catch {
    return { latitude: null, longitude: null };
  }
}

/** The current local day, kept fresh across midnight and when the app returns from the background. */
function useToday(): string {
  const [today, setToday] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localDayKey(new Date()));
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return today;
}

export function useLogbook() {
  const { travelerLocale } = usePreferences();
  const recorder = useVoiceRecorder();
  const today = useToday();
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  // Tagged with its day so a written-up day never shows on the next one after midnight.
  const [storedDay, setStoredDay] = useState<{ day: string; itinerary: StoredItinerary | null } | null>(null);
  const itinerary = storedDay?.day === today ? storedDay.itinerary : null;
  const [loaded, setLoaded] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [dayVisible, setDayVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entriesRef = useRef<LogbookEntry[]>([]);
  const compilingRef = useRef(false);
  /** Signature of the last automatic attempt, so a failure is not retried in a loop. */
  const lastAttemptRef = useRef<string | null>(null);
  const resumedRef = useRef(false);

  const commit = useCallback((update: (current: LogbookEntry[]) => LogbookEntry[]) => {
    const next = update(entriesRef.current);
    entriesRef.current = next;
    setEntries(next);
    void saveEntries(next).then((saved) => {
      if (!saved) setError('Your journal could not be saved on this device.');
    });
  }, []);

  useEffect(() => {
    void loadEntries().then((storedEntries) => {
      entriesRef.current = storedEntries;
      setEntries(storedEntries);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    lastAttemptRef.current = null;
    void loadItinerary(today).then((stored) => {
      if (!cancelled) setStoredDay((current) => (current?.day === today && current.itinerary ? current : { day: today, itinerary: stored }));
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const todaysEntries = useMemo(
    () => entries.filter((entry) => entry.dayKey === today).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    [entries, today],
  );

  /** Exactly what gets written up: usable moments, with only the latest photos. */
  const dayMoments = useMemo(() => {
    const usable = todaysEntries.filter(isUsableMoment);
    const photos = usable.filter((entry) => entry.kind === 'photo');
    const keptPhotos = new Set(photos.slice(-MAX_PHOTOS_PER_DAY).map((entry) => entry.id));
    return usable.filter((entry) => entry.kind !== 'photo' || keptPhotos.has(entry.id));
  }, [todaysEntries]);

  const signature = useMemo(() => momentsSignature(dayMoments), [dayMoments]);
  const dayStatus: DayStatus =
    dayMoments.length === 0 ? 'empty' : !itinerary ? 'none' : itinerary.sourceSignature === signature ? 'current' : 'outdated';
  const newMomentCount = itinerary?.sourceIds
    ? dayMoments.filter((entry) => !itinerary.sourceIds?.includes(entry.id)).length
    : dayMoments.length;
  const memosWaiting = todaysEntries.filter((entry) => entry.kind === 'voice' && !entry.text?.trim()).length;
  const photosLeftOut = Math.max(todaysEntries.filter((entry) => entry.kind === 'photo').length - MAX_PHOTOS_PER_DAY, 0);

  const createEntry = useCallback(
    async (fields: Pick<LogbookEntry, 'kind' | 'text' | 'mediaUri' | 'transcription'> & { id?: string }) => {
      const now = new Date();
      const coordinates = await lastKnownCoordinates();
      const entry: LogbookEntry = {
        id: fields.id ?? createId(fields.kind),
        capturedAt: now.toISOString(),
        dayKey: localDayKey(now),
        ...fields,
        ...coordinates,
      };
      commit((current) => [...current, entry]);
      return entry;
    },
    [commit],
  );

  const addNote = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await createEntry({ kind: 'text', text: trimmed, mediaUri: null, transcription: 'not_needed' });
    },
    [createEntry],
  );

  const runTranscription = useCallback(
    async (entryId: string, mediaUri: string) => {
      commit((current) => current.map((e) => (e.id === entryId ? { ...e, transcription: 'pending' } : e)));
      const result = await transcribeAudio(mediaUri, travelerLocale);
      commit((current) =>
        current.map((e) =>
          e.id === entryId
            ? result.ok
              ? { ...e, text: result.data.text, transcription: 'done' }
              : { ...e, transcription: 'failed' }
            : e,
        ),
      );
      if (!result.ok) setError(`Voice memo saved. Transcription failed: ${result.error.message}`);
    },
    [commit, travelerLocale],
  );

  // A memo left "pending" means the app closed mid-transcription; pick those up again once.
  useEffect(() => {
    if (!loaded || resumedRef.current) return;
    resumedRef.current = true;
    for (const entry of entriesRef.current) {
      if (entry.kind === 'voice' && entry.transcription === 'pending' && entry.mediaUri) {
        void runTranscription(entry.id, entry.mediaUri);
      }
    }
  }, [loaded, runTranscription]);

  const toggleVoiceMemo = useCallback(async () => {
    setError(null);
    if (!recorder.isRecording) {
      const started = await recorder.start();
      if (!started.ok) setError(RECORDER_FAILURE_MESSAGES[started.reason]);
      return;
    }
    const recording = await recorder.stop();
    if (!recording.ok) {
      setError(RECORDER_FAILURE_MESSAGES[recording.reason]);
      return;
    }
    try {
      const id = createId('voice');
      const mediaUri = await persistMedia(recording.uri, id);
      await createEntry({ id, kind: 'voice', text: null, mediaUri, transcription: 'pending' });
      await runTranscription(id, mediaUri);
    } catch {
      setError('The voice memo could not be saved.');
    }
  }, [createEntry, recorder, runTranscription]);

  const addPhoto = useCallback(
    async (source: 'camera' | 'library') => {
      setError(null);
      try {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setError('Camera access is off. Enable it in Settings to add photos.');
            return;
          }
        }
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        const asset = result.canceled ? null : result.assets[0];
        if (!asset) return;

        const id = createId('photo');
        const mediaUri = await persistMedia(asset.uri, id);
        await createEntry({ id, kind: 'photo', text: null, mediaUri, transcription: 'not_needed' });
      } catch {
        setError('The photo could not be added to your journal.');
      }
    },
    [createEntry],
  );

  const removeEntry = useCallback(
    (entryId: string) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      deleteMedia(entry?.mediaUri ?? null);
      commit((current) => current.filter((e) => e.id !== entryId));
      // Deleting the last moment of the day leaves nothing to describe, so the written day goes too.
      const day = entry?.dayKey;
      if (day && !entriesRef.current.some((e) => e.dayKey === day && isUsableMoment(e))) {
        setStoredDay((current) => (current?.day === day ? { day, itinerary: null } : current));
        void clearItinerary(day);
      }
    },
    [commit],
  );

  const retryTranscription = useCallback(
    (entryId: string) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.mediaUri) void runTranscription(entryId, entry.mediaUri);
    },
    [runTranscription],
  );

  const writeDay = useCallback(async () => {
    if (compilingRef.current || dayMoments.length === 0) return;
    compilingRef.current = true;
    lastAttemptRef.current = signature;
    const writtenFrom = { signature, ids: dayMoments.map((entry) => entry.id), day: today };
    setError(null);
    setCompiling(true);
    try {
      const payload: LogbookPayloadEntry[] = [];
      for (const entry of dayMoments) {
        let imageBase64: string | null = null;
        if (entry.kind === 'photo' && entry.mediaUri) {
          imageBase64 = (await prepareImageForUpload(entry.mediaUri, ITINERARY_PHOTO_MAX_EDGE, 0.7)).base64;
        }
        payload.push({
          id: entry.id,
          kind: entry.kind,
          captured_at: entry.capturedAt,
          text: entry.text,
          image_b64: imageBase64,
          latitude: entry.latitude,
          longitude: entry.longitude,
        });
      }

      const result = await compileItinerary({
        date: writtenFrom.day,
        timezone: deviceTimeZone(),
        travelerLocale,
        entries: payload,
      });
      if (!result.ok) {
        setError(`Your day could not be written up: ${result.error.message}`);
        return;
      }
      const stored: StoredItinerary = {
        ...result.data,
        compiledAt: new Date().toISOString(),
        sourceSignature: writtenFrom.signature,
        sourceIds: writtenFrom.ids,
      };
      setStoredDay({ day: writtenFrom.day, itinerary: stored });
      await saveItinerary(writtenFrom.day, stored);
    } catch {
      setError('Something went wrong while preparing your day. Try again.');
    } finally {
      compilingRef.current = false;
      setCompiling(false);
    }
  }, [dayMoments, signature, today, travelerLocale]);

  // Keep "My day" in step with the moments, but only while it is on screen, so adding moments costs nothing.
  useEffect(() => {
    if (!dayVisible || compiling) return;
    if (dayStatus !== 'none' && dayStatus !== 'outdated') return;
    if (lastAttemptRef.current === signature) return;
    const timer = setTimeout(() => void writeDay(), AUTO_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [compiling, dayStatus, dayVisible, signature, writeDay]);

  return {
    loaded,
    today,
    /** Today's moments, newest first, as shown under the capture bar. */
    entries: useMemo(() => [...todaysEntries].reverse(), [todaysEntries]),
    itinerary,
    dayStatus,
    newMomentCount,
    memosWaiting,
    photosLeftOut,
    momentCount: dayMoments.length,
    compiling,
    isRecordingMemo: recorder.isRecording,
    memoDurationMs: recorder.durationMs,
    error,
    dismissError: () => setError(null),
    setDayVisible,
    addNote,
    toggleVoiceMemo,
    addPhoto,
    removeEntry,
    retryTranscription,
    writeDay,
  };
}

export type Logbook = ReturnType<typeof useLogbook>;
