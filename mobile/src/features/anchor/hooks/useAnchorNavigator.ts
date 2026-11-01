import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import {
  haversineDistanceMeters,
  initialBearingDegrees,
  relativeArrowAngle,
  type Coordinates,
} from '@/lib/geo';
import { loadTrip } from '@/features/trip/tripStore';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '@/storage/keyValue';

const POLL_INTERVAL_MS = 2000;
export const ARRIVAL_RADIUS_M = 25;

const AnchorSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullable(),
  label: z.string(),
  lockedAt: z.string(),
});
export type AnchorPoint = z.infer<typeof AnchorSchema>;

type PermissionState = 'unknown' | 'granted' | 'denied';

export function useAnchorNavigator() {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [anchorCoordinates, setAnchorCoordinates] = useState<AnchorPoint | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [bearingHeading, setBearingHeading] = useState<number | null>(null);
  const [locking, setLocking] = useState(false);
  const [gpsSearching, setGpsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedLabel, setSuggestedLabel] = useState<string | null>(null);
  const pollInFlight = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void loadTrip().then((trip) => setSuggestedLabel(trip?.draft.stay.trim() || null));
    }, []),
  );

  useEffect(() => {
    void readJson(STORAGE_KEYS.anchor, AnchorSchema).then(setAnchorCoordinates);
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

  /** Live GPS polling and compass heading, only while the Anchor tab is on screen. */
  useFocusEffect(
    useCallback(() => {
      if (permission !== 'granted') return undefined;

      let cancelled = false;
      let headingSubscription: Location.LocationSubscription | null = null;

      const poll = async () => {
        if (pollInFlight.current) return;
        pollInFlight.current = true;
        try {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
          if (cancelled) return;
          setCurrentCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          setCurrentAccuracy(position.coords.accuracy ?? null);
          setGpsSearching(false);
        } catch {
          if (!cancelled) setGpsSearching(true);
        } finally {
          pollInFlight.current = false;
        }
      };

      void poll();
      const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);

      void Location.watchHeadingAsync(
        (heading) => {
          const value = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
          setBearingHeading(value);
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
        clearInterval(interval);
        headingSubscription?.remove();
      };
    }, [permission]),
  );

  const lockAnchorLocation = useCallback(
    async (label: string) => {
      setError(null);
      if (!(await ensurePermission())) {
        setError('Location access is required to lock an anchor. Enable it in Settings.');
        return;
      }
      setLocking(true);
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        const anchor: AnchorPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          label: label.trim() || suggestedLabel || 'Home base',
          lockedAt: new Date().toISOString(),
        };
        const saved = await writeJson(STORAGE_KEYS.anchor, anchor);
        if (!saved) throw new Error('storage');
        setAnchorCoordinates(anchor);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setError('Could not lock your anchor. Make sure GPS is on and try again.');
      } finally {
        setLocking(false);
      }
    },
    [ensurePermission, suggestedLabel],
  );

  const clearAnchor = useCallback(async () => {
    await removeKey(STORAGE_KEYS.anchor);
    setAnchorCoordinates(null);
  }, []);

  const navigation = useMemo(() => {
    if (!anchorCoordinates || !currentCoordinates) return null;
    const distanceMeters = haversineDistanceMeters(currentCoordinates, anchorCoordinates);
    const bearingToAnchor = initialBearingDegrees(currentCoordinates, anchorCoordinates);
    return {
      distanceMeters,
      bearingToAnchor,
      arrowRotation: bearingHeading === null ? null : relativeArrowAngle(bearingToAnchor, bearingHeading),
      arrived: distanceMeters <= ARRIVAL_RADIUS_M,
    };
  }, [anchorCoordinates, bearingHeading, currentCoordinates]);

  return {
    permission,
    requestPermission: ensurePermission,
    anchorCoordinates,
    currentCoordinates,
    currentAccuracy,
    bearingHeading,
    navigation,
    gpsSearching,
    suggestedLabel,
    locking,
    error,
    dismissError: () => setError(null),
    lockAnchorLocation,
    clearAnchor,
  };
}

export type AnchorNavigator = ReturnType<typeof useAnchorNavigator>;
