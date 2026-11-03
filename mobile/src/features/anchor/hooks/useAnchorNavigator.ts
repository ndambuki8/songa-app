import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import {
  combineFixes,
  haversineDistanceMeters,
  initialBearingDegrees,
  relativeArrowAngle,
  smoothHeading,
  type Coordinates,
  type GpsFix,
} from '@/lib/geo';
import { successFeedback } from '@/lib/haptics';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '@/storage/keyValue';

/** Arrival radius when GPS is sharp; it grows with the current GPS uncertainty, capped at 40 m. */
export const ARRIVAL_RADIUS_M = 20;
const MAX_ARRIVAL_RADIUS_M = 40;
/** Lock finishes on its own once a fix this sharp has been seen a few times. */
const TARGET_ACCURACY_M = 8;
const MIN_SAMPLES = 3;
/** Longest the lock keeps refining before using the best it has. */
const MAX_PINPOINT_MS = 20_000;
/** Give up if no fix at all arrives in this time. */
const NO_FIX_TIMEOUT_MS = 30_000;
/** Above this, suggest re-anchoring from a better spot. */
export const LOOSE_LOCK_M = 30;

const AnchorSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullable(),
  label: z.string(),
  lockedAt: z.string(),
  address: z.string().nullable().default(null),
});
export type AnchorPoint = z.infer<typeof AnchorSchema>;

type PermissionState = 'unknown' | 'granted' | 'denied';

export interface PinpointProgress {
  /** Best accuracy seen so far, in meters. */
  accuracy: number | null;
  samples: number;
}

function formatAddress(place: Location.LocationGeocodedAddress): string | null {
  if (place.formattedAddress?.trim()) return place.formattedAddress.trim();
  const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
  const parts = [place.name !== place.streetNumber ? place.name : null, street, place.district, place.city, place.region, place.postalCode, place.country];
  const unique = parts.filter((part, index): part is string => Boolean(part?.trim()) && parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(', ') : null;
}

/** Street address for the anchor. Needs a connection on most phones; returns null offline. */
async function lookUpAddress(point: Coordinates): Promise<{ address: string | null; name: string | null }> {
  try {
    const results = await Promise.race([
      Location.reverseGeocodeAsync(point),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
    ]);
    const place = results?.[0];
    if (!place) return { address: null, name: null };
    // A bare street number ("12") is not a useful name.
    const name = place.name && !/^\d+[a-z]?$/i.test(place.name.trim()) ? place.name.trim() : null;
    return { address: formatAddress(place), name };
  } catch {
    return { address: null, name: null };
  }
}

export function useAnchorNavigator() {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [anchorCoordinates, setAnchorCoordinates] = useState<AnchorPoint | null>(null);
  const [anchorLoaded, setAnchorLoaded] = useState(false);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [bearingHeading, setBearingHeading] = useState<number | null>(null);
  const [pinpoint, setPinpoint] = useState<PinpointProgress | null>(null);
  const [gpsSearching, setGpsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set while pinpointing; calling it finishes the lock with the fixes gathered so far. */
  const finishPinpointRef = useRef<((useFixes: boolean) => void) | null>(null);
  const pinpointCancelledRef = useRef(false);

  useEffect(() => {
    void readJson(STORAGE_KEYS.anchor, AnchorSchema).then((stored) => {
      setAnchorCoordinates(stored);
      setAnchorLoaded(true);
    });
    void Location.getForegroundPermissionsAsync()
      .then((status) => setPermission(status.granted ? 'granted' : status.canAskAgain ? 'unknown' : 'denied'))
      .catch(() => setPermission('unknown'));
  }, []);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    try {
      const status = await Location.requestForegroundPermissionsAsync();
      setPermission(status.granted ? 'granted' : 'denied');
      return status.granted;
    } catch {
      setPermission('denied');
      return false;
    }
  }, []);

  /** Live GPS and compass, only while the Anchor tab is on screen and not busy pinpointing. */
  const pinpointing = pinpoint !== null;
  useFocusEffect(
    useCallback(() => {
      if (permission !== 'granted' || pinpointing) return undefined;

      let cancelled = false;
      let positionSubscription: Location.LocationSubscription | null = null;
      let headingSubscription: Location.LocationSubscription | null = null;
      const searchingTimer = setTimeout(() => {
        if (!cancelled) setGpsSearching(true);
      }, 8_000);

      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1_000, distanceInterval: 1 },
        (position) => {
          if (cancelled) return;
          clearTimeout(searchingTimer);
          setCurrentCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          setCurrentAccuracy(position.coords.accuracy ?? null);
          setGpsSearching(false);
        },
        () => {
          if (!cancelled) setGpsSearching(true);
        },
      )
        .then((subscription) => {
          if (cancelled) subscription.remove();
          else positionSubscription = subscription;
        })
        .catch(() => setError('Live location is unavailable. Check that location services are on.'));

      void Location.watchHeadingAsync(
        (heading) => {
          const value = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
          setBearingHeading((previous) => smoothHeading(previous, value));
        },
        () => setError('Compass unavailable. Hold the phone flat and move it in a figure eight to calibrate.'),
      )
        .then((subscription) => {
          if (cancelled) subscription.remove();
          else headingSubscription = subscription;
        })
        .catch(() => setError('This device has no compass. Distance is still shown.'));

      return () => {
        cancelled = true;
        clearTimeout(searchingTimer);
        positionSubscription?.remove();
        headingSubscription?.remove();
      };
    }, [permission, pinpointing]),
  );

  /**
   * Watches GPS for up to 20 s and averages the sharpest fixes. Finishes early once accuracy reaches 8 m, or when
   * the user taps "Use this spot". Resolves null if cancelled or no fix arrives.
   */
  const gatherFixes = useCallback(
    () =>
      new Promise<GpsFix | null>((resolve) => {
        const fixes: GpsFix[] = [];
        let subscription: Location.LocationSubscription | null = null;
        let done = false;

        const finish = (useFixes: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(maxTimer);
          clearTimeout(noFixTimer);
          subscription?.remove();
          finishPinpointRef.current = null;
          resolve(useFixes ? combineFixes(fixes) : null);
        };
        finishPinpointRef.current = finish;

        const maxTimer = setTimeout(() => {
          if (fixes.length > 0) finish(true);
        }, MAX_PINPOINT_MS);
        const noFixTimer = setTimeout(() => {
          if (fixes.length === 0) finish(false);
        }, NO_FIX_TIMEOUT_MS);

        void Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1_000, distanceInterval: 0 },
          (position) => {
            if (done) return;
            const accuracy = position.coords.accuracy ?? 50;
            fixes.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy });
            const best = Math.min(...fixes.map((fix) => fix.accuracy));
            setPinpoint({ accuracy: best, samples: fixes.length });
            const sharp = fixes.filter((fix) => fix.accuracy <= TARGET_ACCURACY_M).length;
            if (sharp >= MIN_SAMPLES) finish(true);
          },
        )
          .then((created) => {
            if (done) created.remove();
            else subscription = created;
          })
          .catch(() => finish(false));
      }),
    [],
  );

  const lockAnchorLocation = useCallback(
    async (label: string) => {
      setError(null);
      if (!(await ensurePermission())) {
        setError('Location access is required to anchor a spot. Enable it in Settings.');
        return;
      }
      pinpointCancelledRef.current = false;
      setPinpoint({ accuracy: null, samples: 0 });
      try {
        const fix = await gatherFixes();
        if (!fix) {
          if (pinpointCancelledRef.current) return;
          setError('No GPS fix yet. Step outside or near a window and try again.');
          return;
        }
        const { address, name } = await lookUpAddress(fix);
        const anchor: AnchorPoint = {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy: fix.accuracy,
          label: label.trim() || name || 'Home base',
          lockedAt: new Date().toISOString(),
          address,
        };
        if (!(await writeJson(STORAGE_KEYS.anchor, anchor))) throw new Error('storage');
        setAnchorCoordinates(anchor);
        successFeedback();
      } catch {
        setError('Could not save your anchor. Try again.');
      } finally {
        pinpointCancelledRef.current = false;
        setPinpoint(null);
      }
    },
    [ensurePermission, gatherFixes],
  );

  const acceptPinpoint = useCallback(() => finishPinpointRef.current?.(true), []);
  const cancelPinpoint = useCallback(() => {
    pinpointCancelledRef.current = true;
    finishPinpointRef.current?.(false);
  }, []);

  const renameAnchor = useCallback(
    async (label: string) => {
      if (!anchorCoordinates || !label.trim()) return;
      const next = { ...anchorCoordinates, label: label.trim() };
      setAnchorCoordinates(next);
      await writeJson(STORAGE_KEYS.anchor, next);
    },
    [anchorCoordinates],
  );

  const clearAnchor = useCallback(async () => {
    await removeKey(STORAGE_KEYS.anchor);
    setAnchorCoordinates(null);
  }, []);

  const navigation = useMemo(() => {
    if (!anchorCoordinates || !currentCoordinates) return null;
    const distanceMeters = haversineDistanceMeters(currentCoordinates, anchorCoordinates);
    const bearingToAnchor = initialBearingDegrees(currentCoordinates, anchorCoordinates);
    const arrivalRadius = Math.min(Math.max(ARRIVAL_RADIUS_M, currentAccuracy ?? 0), MAX_ARRIVAL_RADIUS_M);
    return {
      distanceMeters,
      bearingToAnchor,
      arrowRotation: bearingHeading === null ? null : relativeArrowAngle(bearingToAnchor, bearingHeading),
      arrived: distanceMeters <= arrivalRadius,
      close: distanceMeters <= 100,
    };
  }, [anchorCoordinates, bearingHeading, currentAccuracy, currentCoordinates]);

  return {
    permission,
    requestPermission: ensurePermission,
    anchorLoaded,
    anchorCoordinates,
    currentCoordinates,
    currentAccuracy,
    bearingHeading,
    navigation,
    gpsSearching,
    pinpoint,
    error,
    dismissError: () => setError(null),
    lockAnchorLocation,
    acceptPinpoint,
    cancelPinpoint,
    renameAnchor,
    clearAnchor,
  };
}

export type AnchorNavigator = ReturnType<typeof useAnchorNavigator>;
