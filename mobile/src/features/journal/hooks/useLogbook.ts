import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { RECORDER_FAILURE_MESSAGES, useVoiceRecorder } from '@/features/audio/useVoiceRecorder';
import { createId, deviceTimeZone, localDayKey } from '@/lib/dates';
import { prepareImageForUpload } from '@/lib/imagePreparation';
import { transcribeAudio } from '@/services/api/dialogue';
import { compileItinerary, type LogbookPayloadEntry } from '@/services/api/logbook';
import { usePreferences } from '@/storage/preferences';

import {
  clearItinerary,
  deleteMedia,
  loadEntries,
  loadItinerary,
  persistMedia,
  saveEntries,
  saveItinerary,
  type LogbookEntry,
  type StoredItinerary,
} from '../logbookStore';

const ITINERARY_PHOTO_MAX_EDGE = 1024;
const MAX_PHOTOS_PER_COMPILE = 12;

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

export function useLogbook() {
  const { travelerLocale } = usePreferences();
  const recorder = useVoiceRecorder();
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [itinerary, setItinerary] = useState<StoredItinerary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => localDayKey(new Date()));
  const entriesRef = useRef<LogbookEntry[]>([]);

  const commit = useCallback((update: (current: LogbookEntry[]) => LogbookEntry[]) => {
    const next = update(entriesRef.current);
    entriesRef.current = next;
    setEntries(next);
    void saveEntries(next).then((saved) => {
      if (!saved) setError('Your journal could not be saved on this device.');
    });
  }, []);

  useEffect(() => {
    void Promise.all([loadEntries(), loadItinerary(today)]).then(([storedEntries, storedItinerary]) => {
      entriesRef.current = storedEntries;
      setEntries(storedEntries);
      setItinerary(storedItinerary);
      setLoaded(true);
    });
  }, [today]);

  const todaysEntries = useMemo(
    () => entries.filter((entry) => entry.dayKey === today).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    [entries, today],
  );

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

  const compileDay = useCallback(async () => {
    if (todaysEntries.length === 0) return;
    setError(null);
    setCompiling(true);
    try {
      const photos = todaysEntries.filter((entry) => entry.kind === 'photo').slice(-MAX_PHOTOS_PER_COMPILE);
      const photoIds = new Set(photos.map((photo) => photo.id));

      const payload: LogbookPayloadEntry[] = [];
      for (const entry of todaysEntries) {
        if (entry.kind === 'photo' && !photoIds.has(entry.id)) continue;
        if (entry.kind === 'voice' && !entry.text) continue;
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

      if (payload.length === 0) {
        setError('Add a note, transcribed memo or photo before compiling.');
        return;
      }

      const result = await compileItinerary({
        date: today,
        timezone: deviceTimeZone(),
        travelerLocale,
        entries: payload,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const stored: StoredItinerary = { ...result.data, compiledAt: new Date().toISOString() };
      setItinerary(stored);
      await saveItinerary(today, stored);
    } catch {
      setError('Your photos could not be prepared for upload.');
    } finally {
      setCompiling(false);
    }
  }, [today, todaysEntries, travelerLocale]);

  const discardItinerary = useCallback(() => {
    setItinerary(null);
    void clearItinerary(today);
  }, [today]);

  return {
    loaded,
    today,
    entries: todaysEntries,
    itinerary,
    compiling,
    isRecordingMemo: recorder.isRecording,
    memoDurationMs: recorder.durationMs,
    error,
    dismissError: () => setError(null),
    addNote,
    toggleVoiceMemo,
    addPhoto,
    removeEntry,
    retryTranscription,
    compileDay,
    discardItinerary,
  };
}

export type Logbook = ReturnType<typeof useLogbook>;
