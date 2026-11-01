import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics are a nicety, never a requirement. Some builds (for example an Expo Go app whose native side is older
 * than the JS package) lack individual haptic methods and throw `UnavailabilityError`, so every call here is
 * fire-and-forget and swallows both synchronous and asynchronous failures.
 */
function attempt(run: () => Promise<void>): void {
  try {
    void run().catch(() => undefined);
  } catch {
    // Not available on this device or build.
  }
}

export function tapFeedback(strength: 'light' | 'medium' = 'medium'): void {
  attempt(() =>
    Haptics.impactAsync(strength === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium),
  );
}

export function successFeedback(): void {
  attempt(async () => {
    if (Platform.OS === 'android') {
      // Android's recommended haptics API; fall back to the generic notification pattern if it is missing.
      try {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
        return;
      } catch {
        // Try the cross-platform method below.
      }
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  });
}
