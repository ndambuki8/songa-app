/**
 * Public runtime configuration. Values are inlined by Expo at build time from `EXPO_PUBLIC_*`
 * variables (see `.env.example`).
 */
export const ENV = {
  apiBaseUrl: (process.env.EXPO_PUBLIC_SONGA_API_URL ?? '').replace(/\/+$/, ''),
  apiKey: process.env.EXPO_PUBLIC_SONGA_API_KEY ?? '',
} as const;

export const REQUEST_TIMEOUT_MS = {
  dialogue: 45_000,
  transcribe: 30_000,
  segment: 60_000,
  analyze: 45_000,
  menuCheck: 60_000,
  itinerary: 90_000,
  trip: 90_000,
} as const;
