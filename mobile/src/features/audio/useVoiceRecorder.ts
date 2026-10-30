import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useRef } from 'react';

const MIN_RECORDING_MS = 400;

export type RecorderFailure = 'permission_denied' | 'too_short' | 'device_error';

export type RecordingOutcome =
  | { ok: true; uri: string; durationMs: number }
  | { ok: false; reason: RecorderFailure };

/**
 * Thin, reusable wrapper around expo-audio's recorder. The audio session is only switched into
 * recording mode while capturing so that expo-speech playback afterwards uses the loudspeaker.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const startedAt = useRef<number | null>(null);

  const start = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: RecorderFailure }> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return { ok: false, reason: 'permission_denied' };

      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      return { ok: true };
    } catch {
      return { ok: false, reason: 'device_error' };
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<RecordingOutcome> => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });

      const durationMs = startedAt.current ? Date.now() - startedAt.current : 0;
      startedAt.current = null;

      if (!recorder.uri) return { ok: false, reason: 'device_error' };
      if (durationMs < MIN_RECORDING_MS) return { ok: false, reason: 'too_short' };
      return { ok: true, uri: recorder.uri, durationMs };
    } catch {
      startedAt.current = null;
      return { ok: false, reason: 'device_error' };
    }
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    durationMs: state.durationMillis,
    start,
    stop,
  };
}

export const RECORDER_FAILURE_MESSAGES: Record<RecorderFailure, string> = {
  permission_denied: 'Microphone access is off. Enable it in Settings to use voice features.',
  too_short: 'That was too short. Tap the mic, speak, then tap again to finish.',
  device_error: 'The microphone could not be started on this device.',
};
