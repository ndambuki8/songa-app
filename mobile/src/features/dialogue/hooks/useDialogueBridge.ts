import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RECORDER_FAILURE_MESSAGES, useVoiceRecorder } from '@/features/audio/useVoiceRecorder';
import { dispatchAudioPayloadToModalServerless } from '@/services/api/dialogue';
import { usePreferences } from '@/storage/preferences';

export type ApiLoadingState = 'idle' | 'recording' | 'processing' | 'reviewing' | 'speaking';
export type Speaker = 'traveler' | 'resident';

export interface DialogueTurn {
  speaker: Speaker;
  transcriptText: string;
  processedIntentText: string;
  extractedIntent: string;
  politenessNotes: string | null;
  spokenLocale: string;
  latencyMs: number;
  /** Traveler turns wait for the traveler to approve them before they are spoken. */
  confirmed: boolean;
}

export function useDialogueBridge() {
  const recorder = useVoiceRecorder();
  const { travelerLocale, residentLocale, setTravelerLocale, setResidentLocale } = usePreferences();
  const [apiLoadingState, setApiLoadingState] = useState<ApiLoadingState>('idle');
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [lastTurn, setLastTurn] = useState<DialogueTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmedTurn = useRef<DialogueTurn | null>(null);
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
        setError('The phone could not read this aloud. Show the screen to the other person instead.');
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
      confirmed: speaker === 'resident',
    };
    setLastTurn(turn);

    if (turn.confirmed) {
      confirmedTurn.current = turn;
      speak(turn.processedIntentText, turn.spokenLocale);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setApiLoadingState('reviewing');
    }
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

  const confirmTurn = useCallback(() => {
    if (!lastTurn || lastTurn.confirmed) return;
    const turn = { ...lastTurn, confirmed: true };
    confirmedTurn.current = turn;
    setLastTurn(turn);
    speak(turn.processedIntentText, turn.spokenLocale);
  }, [lastTurn, speak]);

  const retryTurn = useCallback(() => {
    if (apiLoadingState !== 'reviewing') return;
    setLastTurn(confirmedTurn.current);
    setApiLoadingState('idle');
    void startRecording('traveler');
  }, [apiLoadingState, startRecording]);

  const replay = useCallback(() => {
    const turn = confirmedTurn.current;
    if (!turn || apiLoadingState === 'recording' || apiLoadingState === 'processing') return;
    void Speech.stop().then(() => speak(turn.processedIntentText, turn.spokenLocale));
  }, [apiLoadingState, speak]);

  return {
    isRecording: recorder.isRecording,
    recordingDurationMs: recorder.durationMs,
    apiLoadingState,
    activeSpeaker,
    lastTurn,
    canReplay: lastTurn?.confirmed === true && apiLoadingState !== 'reviewing',
    transcriptText: lastTurn?.transcriptText ?? '',
    processedIntentText: lastTurn?.processedIntentText ?? '',
    error,
    dismissError: () => setError(null),
    travelerLocale,
    residentLocale,
    setTravelerLocale,
    setResidentLocale,
    toggleRecording,
    confirmTurn,
    retryTurn,
    replay,
  };
}
