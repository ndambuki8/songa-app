import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const FRESH_FIX_TIMEOUT_MS = 4_000;

/**
 * Best-effort current position for grounding answers about nearby places. Never throws.
 * Only shows the permission prompt when `prompt` is true; otherwise it uses access the user already granted.
 * Prefers a recent cached fix and waits at most 4 s for a fresh one.
 */
export async function approximateCoordinates({ prompt }: { prompt: boolean }): Promise<Coordinates | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && prompt && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;

    const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 500 });
    if (cached) return { latitude: cached.coords.latitude, longitude: cached.coords.longitude };

    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FRESH_FIX_TIMEOUT_MS)),
    ]);
    return fresh ? { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude } : null;
  } catch {
    return null;
  }
}
