import { z } from 'zod';

import { TripBriefingResponseSchema } from '@/services/api/schemas';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '@/storage/keyValue';

export const MAX_TRIP_DAYS = 14;

const TripDraftSchema = z.object({
  destination: z.string(),
  startDate: z.string(),
  days: z.number().int().min(1).max(MAX_TRIP_DAYS),
  stay: z.string(),
  needs: z.string(),
});
export type TripDraft = z.infer<typeof TripDraftSchema>;

const StoredTripSchema = z.object({
  draft: TripDraftSchema,
  briefing: TripBriefingResponseSchema.nullable(),
  plannedAt: z.string().nullable(),
});
export type StoredTrip = z.infer<typeof StoredTripSchema>;

export function loadTrip(): Promise<StoredTrip | null> {
  return readJson(STORAGE_KEYS.trip, StoredTripSchema);
}

export function saveTrip(trip: StoredTrip): Promise<boolean> {
  return writeJson(STORAGE_KEYS.trip, trip);
}

export function clearTrip(): Promise<void> {
  return removeKey(STORAGE_KEYS.trip);
}
