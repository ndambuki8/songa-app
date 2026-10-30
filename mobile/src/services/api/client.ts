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
  network: 'No connection to Songa. Check your data or Wi-Fi and try again.',
  timeout: 'Songa took too long to answer. Try again in a moment.',
  unauthorized: 'This app is not authorised to use the Songa server.',
  bad_request: 'Songa could not understand that request.',
  expired: 'That photo session expired. Retrying with the full photo.',
  upstream: 'The AI model is busy right now. Try again shortly.',
  invalid_response: 'Songa returned an unexpected answer.',
  server: 'Something went wrong on the Songa server.',
};

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
      const error: ApiError = {
        kind,
        status: response.status,
        code: envelope.success ? envelope.data.error.code : undefined,
        message: envelope.success ? envelope.data.error.message : FALLBACK_MESSAGES[kind],
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
