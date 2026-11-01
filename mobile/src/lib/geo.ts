/** Offline geodesy helpers. Pure functions, no network or map tiles. */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Great-circle distance using the Haversine formula. */
export function haversineDistanceMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial great-circle bearing from `from` to `to`, in degrees clockwise from true north. */
export function initialBearingDegrees(from: Coordinates, to: Coordinates): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/** Angle to rotate an up-pointing arrow so it points at the target, given the device heading. */
export function relativeArrowAngle(bearingToTarget: number, deviceHeading: number): number {
  return normalizeDegrees(bearingToTarget - deviceHeading);
}

/** Next rotation value that reaches `target` via the shortest turn from the current unbounded `previous`. */
export function shortestRotation(previous: number, target: number): number {
  const delta = ((normalizeDegrees(target) - normalizeDegrees(previous) + 540) % 360) - 180;
  return previous + delta;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function cardinalDirection(bearing: number): (typeof CARDINALS)[number] {
  return CARDINALS[Math.round(normalizeDegrees(bearing) / 45) % 8]!;
}

export function formatDistance(meters: number): { value: string; unit: 'm' | 'km' } {
  if (meters < 1000) return { value: String(Math.round(meters)), unit: 'm' };
  return { value: (meters / 1000).toFixed(meters < 10_000 ? 2 : 1), unit: 'km' };
}

export interface GpsFix extends Coordinates {
  /** Radius of uncertainty in meters, as reported by the device. */
  accuracy: number;
}

/**
 * Combines several GPS fixes taken while standing still into one precise point.
 * Keeps only the fixes close to the best accuracy seen, then averages them weighted by 1/accuracy², so a single
 * jumpy reading cannot drag the anchor. The reported accuracy is the best single fix: averaging reduces random
 * jitter, but GPS errors are correlated over seconds, so claiming more would be dishonest.
 */
export function combineFixes(fixes: readonly GpsFix[]): GpsFix | null {
  const valid = fixes.filter((fix) => Number.isFinite(fix.accuracy) && fix.accuracy > 0);
  if (valid.length === 0) return null;
  const best = Math.min(...valid.map((fix) => fix.accuracy));
  const cutoff = Math.max(best * 1.5, best + 5);
  const used = valid.filter((fix) => fix.accuracy <= cutoff);

  let weightSum = 0;
  let latitude = 0;
  let longitude = 0;
  for (const fix of used) {
    const weight = 1 / (fix.accuracy * fix.accuracy);
    weightSum += weight;
    latitude += fix.latitude * weight;
    longitude += fix.longitude * weight;
  }
  return { latitude: latitude / weightSum, longitude: longitude / weightSum, accuracy: best };
}

/** Exponential smoothing for compass headings that handles the 359° to 0° wrap. */
export function smoothHeading(previous: number | null, next: number, factor = 0.3): number {
  if (previous === null) return normalizeDegrees(next);
  const delta = ((normalizeDegrees(next) - normalizeDegrees(previous) + 540) % 360) - 180;
  return normalizeDegrees(previous + delta * factor);
}
