import { REQUEST_TIMEOUT_MS } from '@/config/env';
import { findLanguage } from '@/config/languages';

import { postJson } from './client';
import { readFileAsBase64 } from './files';
import { fail, ok, type ApiResult } from './result';
import { IntentBridgeResponseSchema, TranscribeResponseSchema, type TranscribeResponse } from './schemas';

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
}

/**
 * Ships a finished recording to the Modal intent bridge (Muse Voice Transcribe -> Muse Wonder) and returns the
 * culturally refined phrase to be spoken aloud.
 */
export async function dispatchAudioPayloadToModalServerless(
  audioURI: string,
  { sourceLocale, targetLocale }: DialogueRequest,
): Promise<ApiResult<DialogueBridgeResult>> {
  const audio = await readFileAsBase64(audioURI);
  if (!audio.ok) return fail(audio.error);

  const target = findLanguage(targetLocale);
  const result = await postJson(
    '/api/dialogue/intent-bridge',
    {
      audio_b64: audio.data,
      audio_mime: mimeForUri(audioURI),
      source_locale: sourceLocale,
      target_locale: target.locale,
      target_country: target.country,
    },
    IntentBridgeResponseSchema,
    REQUEST_TIMEOUT_MS.dialogue,
  );
  if (!result.ok) return result;

  return ok({
    transcription: result.data.raw_transcription,
    culturallyRefinedIntent: result.data.culturally_refined_translation,
    extractedIntent: result.data.extracted_intent,
    politenessNotes: result.data.politeness_notes ?? null,
    latencyMs: result.data.latency_ms,
  });
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
