import AsyncStorage from '@react-native-async-storage/async-storage';
import type { z } from 'zod';

export const STORAGE_KEYS = {
  preferences: 'songa.preferences.v1',
  anchor: 'songa.anchor.v1',
  logbookEntries: 'songa.logbook.entries.v1',
  itineraryPrefix: 'songa.itinerary.v1.',
  trip: 'songa.trip.v1',
} as const;

/** Reads and validates a JSON value. Corrupt or outdated data is treated as missing. */
export async function readJson<TSchema extends z.ZodType>(key: string, schema: TSchema): Promise<z.infer<TSchema> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Removal failures leave stale data that is overwritten on the next write.
  }
}
