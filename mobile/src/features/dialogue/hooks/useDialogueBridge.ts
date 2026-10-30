import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RECORDER_FAILURE_MESSAGES, useVoiceRecorder } from '@/features/audio/useVoiceRecorder';
import { dispatchAudioPayloadToModalServerless } from '@/services/api/dialogue';
import { usePreferences } from '@/storage/preferences';

export type ApiLoadingState = 'idle' | 'recording' | 'processing' | 'speaking';
export type Speaker = 'traveler' | 'resident';

export interface DialogueTurn {
  speaker: Speaker;
  transcriptText: string;
  processedIntentText: string;
  extractedIntent: string;
  politenessNotes: string | null;
  spokenLocale: string;
  latencyMs: number;
}

export function useDialogueBridge() {
  const recorder = useVoiceRecorder();
  const { travelerLocale, residentLocale, setTravelerLocale, setResidentLocale } = usePreferences();
  const [apiLoadingState, setApiLoadingState] = useState<ApiLoadingState>('idle');
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [lastTurn, setLastTurn] = useState<DialogueTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void Speech.stop();
    };
  }, []);

  const speak = useCallback((text: string, locale: string) => {
    setApiLoadingState('speaking');
    Speech.speak(text, {
      language: locale,
      onDone: () => {
        if (mounted.current) setApiLoadingState('idle');
      },
      onStopped: () => {
        if (mounted.current) setApiLoadingState('idle');
      },
      onError: () => {
        if (!mounted.current) return;
        setApiLoadingState('idle');
        setError('The phone could not read the translation aloud. The text is shown on screen.');
      },
    });
  }, []);

  const startRecording = useCallback(
    async (speaker: Speaker) => {
      setError(null);
      await Speech.stop();
      const started = await recorder.start();
      if (!started.ok) {
        setError(RECORDER_FAILURE_MESSAGES[started.reason]);
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActiveSpeaker(speaker);
      setApiLoadingState('recording');
    },
    [recorder],
  );

  const stopAndTranslate = useCallback(async () => {
    const speaker = activeSpeaker;
    if (!speaker) return;

    const recording = await recorder.stop();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!recording.ok) {
      setApiLoadingState('idle');
      setActiveSpeaker(null);
      setError(RECORDER_FAILURE_MESSAGES[recording.reason]);
      return;
    }

    const sourceLocale = speaker === 'traveler' ? travelerLocale : residentLocale;
    const targetLocale = speaker === 'traveler' ? residentLocale : travelerLocale;

    setApiLoadingState('processing');
    const result = await dispatchAudioPayloadToModalServerless(recording.uri, { sourceLocale, targetLocale });
    if (!mounted.current) return;
    setActiveSpeaker(null);

    if (!result.ok) {
      setApiLoadingState('idle');
      setError(result.error.message);
      return;
    }

    const turn: DialogueTurn = {
      speaker,
      transcriptText: result.data.transcription,
      processedIntentText: result.data.culturallyRefinedIntent,
      extractedIntent: result.data.extractedIntent,
      politenessNotes: result.data.politenessNotes,
      spokenLocale: targetLocale,
      latencyMs: result.data.latencyMs,
    };
    setLastTurn(turn);
    speak(turn.processedIntentText, turn.spokenLocale);
  }, [activeSpeaker, recorder, residentLocale, speak, travelerLocale]);

  const toggleRecording = useCallback(
    (speaker: Speaker) => {
      if (apiLoadingState === 'recording' && activeSpeaker === speaker) {
        void stopAndTranslate();
      } else if (apiLoadingState === 'idle' || apiLoadingState === 'speaking') {
        void startRecording(speaker);
      }
    },
    [activeSpeaker, apiLoadingState, startRecording, stopAndTranslate],
  );

  const replay = useCallback(() => {
    if (!lastTurn || apiLoadingState === 'recording' || apiLoadingState === 'processing') return;
    void Speech.stop().then(() => speak(lastTurn.processedIntentText, lastTurn.spokenLocale));
  }, [apiLoadingState, lastTurn, speak]);

  return {
    isRecording: recorder.isRecording,
    recordingDurationMs: recorder.durationMs,
    apiLoadingState,
    activeSpeaker,
    lastTurn,
    transcriptText: lastTurn?.transcriptText ?? '',
    processedIntentText: lastTurn?.processedIntentText ?? '',
    error,
    dismissError: () => setError(null),
    travelerLocale,
    residentLocale,
    setTravelerLocale,
    setResidentLocale,
    toggleRecording,
    replay,
  };
}
