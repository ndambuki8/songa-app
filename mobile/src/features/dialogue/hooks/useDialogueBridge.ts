import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RECORDER_FAILURE_MESSAGES, useVoiceRecorder } from '@/features/audio/useVoiceRecorder';
import { tapFeedback } from '@/lib/haptics';
import { warmUpGateway } from '@/services/api/client';
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

/** What the server heard, shown while the translation is still being written. */
export interface PendingTranscript {
  speaker: Speaker;
  text: string;
}

export function useDialogueBridge() {
  const recorder = useVoiceRecorder();
  const { travelerLocale, residentLocale, setTravelerLocale, setResidentLocale } = usePreferences();
  const [apiLoadingState, setApiLoadingState] = useState<ApiLoadingState>('idle');
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [lastTurn, setLastTurn] = useState<DialogueTurn | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<PendingTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    warmUpGateway();
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
      // Boot a cold gateway container while the person is still speaking.
      warmUpGateway();
      await Speech.stop();
      const started = await recorder.start();
      if (!started.ok) {
        setError(RECORDER_FAILURE_MESSAGES[started.reason]);
        return;
      }
      tapFeedback('medium');
      setActiveSpeaker(speaker);
      setApiLoadingState('recording');
    },
    [recorder],
  );

  const stopAndTranslate = useCallback(async () => {
    const speaker = activeSpeaker;
    if (!speaker) return;

    const recording = await recorder.stop();
    tapFeedback('light');
    if (!recording.ok) {
      setApiLoadingState('idle');
      setActiveSpeaker(null);
      setError(RECORDER_FAILURE_MESSAGES[recording.reason]);
      return;
    }

    const sourceLocale = speaker === 'traveler' ? travelerLocale : residentLocale;
    const targetLocale = speaker === 'traveler' ? residentLocale : travelerLocale;

    setApiLoadingState('processing');
    const result = await dispatchAudioPayloadToModalServerless(recording.uri, {
      sourceLocale,
      targetLocale,
      onTranscript: (text) => {
        if (mounted.current) setPendingTranscript({ speaker, text });
      },
    });
    if (!mounted.current) return;
    setActiveSpeaker(null);
    setPendingTranscript(null);

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
    pendingTranscript,
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
