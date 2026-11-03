import type { z } from 'zod';

import { ENV } from '@/config/env';

import { ErrorEnvelopeSchema } from './schemas';
import { fail, ok, type ApiError, type ApiErrorKind, type ApiResult } from './result';

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 410) return 'expired';
  if (status === 504) return 'timeout';
  if (status === 502 || status === 503) return 'upstream';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'server';
}

const FALLBACK_MESSAGES: Record<ApiErrorKind, string> = {
  not_configured: 'Songa is not connected to its server yet. Set EXPO_PUBLIC_SONGA_API_URL.',
  network: 'No internet connection. Speak, Look and Journal need data. Anchor still works offline.',
  timeout: 'Songa is taking too long. Check your connection and try again.',
  unauthorized: 'This copy of Songa cannot reach its server. Please update the app.',
  bad_request: 'That did not work. Please try again.',
  expired: 'That photo session expired. Retrying with the full photo.',
  upstream: 'Songa is busy right now. Try again in a few seconds.',
  invalid_response: 'Songa got an unexpected answer. Try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
};

const CODE_MESSAGES: Record<string, string> = {
  no_speech: 'Songa did not catch any words. Hold the phone a little closer and try again.',
  undecodable_audio: 'That recording did not come through. Please record again.',
  unreadable_image: 'Songa could not read this photo. Move closer, hold steady and retake it.',
  empty_mask: 'Nothing to explain right there. Tap directly on the item.',
  upstream_rate_limited: 'Songa is very busy right now. Wait a few seconds and try again.',
  invalid_model_output: 'Songa got a muddled answer. Try once more.',
  payload_too_large: 'That was too large to send. Try a shorter recording or fewer photos.',
};

function messageFor(kind: ApiErrorKind, status: number, code: string | undefined, serverMessage: string | undefined) {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (serverMessage && (status === 422 || __DEV__)) return serverMessage;
  return FALLBACK_MESSAGES[kind];
}

/**
 * POSTs JSON to the Songa gateway and validates the response at runtime.
 * Never throws: every failure is mapped to a typed `ApiError`.
 */
export async function postJson<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
  timeoutMs: number,
): Promise<ApiResult<z.infer<TSchema>>> {
  if (!ENV.apiBaseUrl) {
    return fail({ kind: 'not_configured', message: FALLBACK_MESSAGES.not_configured });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ENV.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(ENV.apiKey ? { Authorization: `Bearer ${ENV.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const kind = kindForStatus(response.status);
      const envelope = ErrorEnvelopeSchema.safeParse(payload);
      const code = envelope.success ? envelope.data.error.code : undefined;
      const error: ApiError = {
        kind,
        status: response.status,
        code,
        message: messageFor(kind, response.status, code, envelope.success ? envelope.data.error.message : undefined),
      };
      return fail(error);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return fail({ kind: 'invalid_response', status: response.status, message: FALLBACK_MESSAGES.invalid_response });
    }
    return ok(parsed.data);
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    const kind: ApiErrorKind = aborted ? 'timeout' : 'network';
    return fail({ kind, message: FALLBACK_MESSAGES[kind] });
  } finally {
    clearTimeout(timer);
  }
}
