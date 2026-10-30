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
