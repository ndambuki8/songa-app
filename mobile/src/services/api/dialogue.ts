import { REQUEST_TIMEOUT_MS } from '@/config/env';
import { findLanguage } from '@/config/languages';

import { FALLBACK_MESSAGES, kindForStatus, postJson, postNdjson } from './client';
import { readFileAsBase64 } from './files';
import { fail, ok, type ApiError, type ApiResult } from './result';
import {
  IntentBridgeResponseSchema,
  IntentBridgeStreamEventSchema,
  TranscribeResponseSchema,
  type IntentBridgeResponse,
  type TranscribeResponse,
} from './schemas';

export interface DialogueBridgeResult {
  transcription: string;
  culturallyRefinedIntent: string;
  extractedIntent: string;
  politenessNotes: string | null;
  latencyMs: number;
}

export interface DialogueRequest {
  sourceLocale: string;
  targetLocale: string;
  /** Called as soon as the server has transcribed the clip, before the translation is ready. */
  onTranscript?: (text: string) => void;
}

/**
 * Ships a finished recording to the Modal intent bridge (Muse Voice Transcribe -> Muse Wonder) and returns the
 * culturally refined phrase to be spoken aloud. Uses the streaming endpoint so the transcript arrives early, and
 * falls back to the one-shot endpoint if the deployed gateway predates streaming (HTTP 404).
 */
export async function dispatchAudioPayloadToModalServerless(
  audioURI: string,
  { sourceLocale, targetLocale, onTranscript }: DialogueRequest,
): Promise<ApiResult<DialogueBridgeResult>> {
  const audio = await readFileAsBase64(audioURI);
  if (!audio.ok) return fail(audio.error);

  const target = findLanguage(targetLocale);
  const body = {
    audio_b64: audio.data,
    audio_mime: mimeForUri(audioURI),
    source_locale: sourceLocale,
    target_locale: target.locale,
    target_country: target.country,
  };

  const received: { result: IntentBridgeResponse | null; error: ApiError | null; malformed: boolean } = {
    result: null,
    error: null,
    malformed: false,
  };

  const streamed = await postNdjson(
    '/api/dialogue/intent-bridge/stream',
    body,
    (raw) => {
      const event = IntentBridgeStreamEventSchema.safeParse(raw);
      if (!event.success) {
        received.malformed = true;
        return;
      }
      if (event.data.type === 'transcript') {
        onTranscript?.(event.data.text);
      } else if (event.data.type === 'result') {
        received.result = event.data;
      } else {
        const { status, error } = event.data;
        received.error = { kind: kindForStatus(status), status, code: error.code, message: error.message };
      }
    },
    REQUEST_TIMEOUT_MS.dialogue,
  );

  if (!streamed.ok && streamed.error.status === 404) {
    const oneShot = await postJson('/api/dialogue/intent-bridge', body, IntentBridgeResponseSchema, REQUEST_TIMEOUT_MS.dialogue);
    if (!oneShot.ok) return oneShot;
    onTranscript?.(oneShot.data.raw_transcription);
    return ok(toBridgeResult(oneShot.data));
  }
  if (!streamed.ok) return streamed;
  if (received.error) return fail(received.error);
  if (received.malformed || !received.result) {
    return fail({ kind: 'invalid_response', message: FALLBACK_MESSAGES.invalid_response });
  }
  return ok(toBridgeResult(received.result));
}

function toBridgeResult(data: IntentBridgeResponse): DialogueBridgeResult {
  return {
    transcription: data.raw_transcription,
    culturallyRefinedIntent: data.culturally_refined_translation,
    extractedIntent: data.extracted_intent,
    politenessNotes: data.politeness_notes ?? null,
    latencyMs: data.latency_ms,
  };
}

export async function transcribeAudio(audioURI: string, languageHint?: string): Promise<ApiResult<TranscribeResponse>> {
  const audio = await readFileAsBase64(audioURI);
  if (!audio.ok) return fail(audio.error);

  return postJson(
    '/api/transcribe',
    { audio_b64: audio.data, audio_mime: mimeForUri(audioURI), language_hint: languageHint ?? null },
    TranscribeResponseSchema,
    REQUEST_TIMEOUT_MS.transcribe,
  );
}

function mimeForUri(uri: string): string {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'wav':
      return 'audio/wav';
    case 'webm':
      return 'audio/webm';
    case 'caf':
      return 'audio/x-caf';
    case '3gp':
      return 'audio/3gpp';
    default:
      return 'audio/mp4';
  }
}
