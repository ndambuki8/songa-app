import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const FRESH_FIX_TIMEOUT_MS = 4_000;
const GEOCODE_TIMEOUT_MS = 4_000;

export interface CurrentPlace {
  coordinates: Coordinates;
  /** "Westlands, Nairobi, Kenya"; null when the reverse geocoder is unavailable (often offline). */
  label: string | null;
}

/** Neighbourhood, city, region and country, without repeats. Street-level detail is left out on purpose. */
function placeLabel(place: Location.LocationGeocodedAddress): string | null {
  const parts = [place.district, place.subregion, place.city, place.region, place.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(', ').slice(0, 160) : null;
}

/** Position plus a human-readable place name, for prompts that interpret local food, prices and signs. */
export async function currentPlace({ prompt }: { prompt: boolean }): Promise<CurrentPlace | null> {
  const coordinates = await approximateCoordinates({ prompt });
  if (!coordinates) return null;
  try {
    const results = await Promise.race([
      Location.reverseGeocodeAsync(coordinates),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GEOCODE_TIMEOUT_MS)),
    ]);
    const first = results?.[0];
    return { coordinates, label: first ? placeLabel(first) : null };
  } catch {
    return { coordinates, label: null };
  }
}

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
