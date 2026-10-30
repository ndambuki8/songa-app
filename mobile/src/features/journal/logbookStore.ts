import { Directory, File, Paths } from 'expo-file-system';
import { z } from 'zod';

import { ItineraryResponseSchema, type ItineraryResponse } from '@/services/api/schemas';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '@/storage/keyValue';

export const LogbookEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['text', 'voice', 'photo']),
  capturedAt: z.string(),
  dayKey: z.string(),
  /** Typed note, or the transcript for voice memos. */
  text: z.string().nullable(),
  mediaUri: z.string().nullable(),
  transcription: z.enum(['not_needed', 'pending', 'failed', 'done']),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type LogbookEntry = z.infer<typeof LogbookEntrySchema>;

const EntriesSchema = z.array(LogbookEntrySchema);

const StoredItinerarySchema = ItineraryResponseSchema.extend({ compiledAt: z.string() });
export type StoredItinerary = ItineraryResponse & { compiledAt: string };

export async function loadEntries(): Promise<LogbookEntry[]> {
  return (await readJson(STORAGE_KEYS.logbookEntries, EntriesSchema)) ?? [];
}

export function saveEntries(entries: LogbookEntry[]): Promise<boolean> {
  return writeJson(STORAGE_KEYS.logbookEntries, entries);
}

export function loadItinerary(dayKey: string): Promise<StoredItinerary | null> {
  return readJson(`${STORAGE_KEYS.itineraryPrefix}${dayKey}`, StoredItinerarySchema);
}

export function saveItinerary(dayKey: string, itinerary: StoredItinerary): Promise<boolean> {
  return writeJson(`${STORAGE_KEYS.itineraryPrefix}${dayKey}`, itinerary);
}

export function clearItinerary(dayKey: string): Promise<void> {
  return removeKey(`${STORAGE_KEYS.itineraryPrefix}${dayKey}`);
}

function mediaDirectory(): Directory {
  const directory = new Directory(Paths.document, 'logbook');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Moves captured media out of the OS-purgeable cache into app documents. */
export async function persistMedia(sourceUri: string, entryId: string): Promise<string> {
  const extension = sourceUri.split('?')[0]?.split('.').pop() ?? 'bin';
  const destination = new File(mediaDirectory(), `${entryId}.${extension}`);
  await new File(sourceUri).copy(destination);
  return destination.uri;
}

export function deleteMedia(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing file needs no cleanup.
  }
}
