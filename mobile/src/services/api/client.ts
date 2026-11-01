import { fetch as streamingFetch } from 'expo/fetch';
import type { z } from 'zod';

import { ENV } from '@/config/env';

import { ErrorEnvelopeSchema } from './schemas';
import { fail, ok, type ApiError, type ApiErrorKind, type ApiResult } from './result';

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 410) return 'expired';
  if (status === 504) return 'timeout';
  if (status === 502 || status === 503) return 'upstream';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'server';
}

export const FALLBACK_MESSAGES: Record<ApiErrorKind, string> = {
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

function requestHeaders(accept: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: accept,
    ...(ENV.apiKey ? { Authorization: `Bearer ${ENV.apiKey}` } : {}),
  };
}

function errorFromEnvelope(status: number, payload: unknown): ApiError {
  const kind = kindForStatus(status);
  const envelope = ErrorEnvelopeSchema.safeParse(payload);
  return {
    kind,
    status,
    code: envelope.success ? envelope.data.error.code : undefined,
    message: envelope.success ? envelope.data.error.message : FALLBACK_MESSAGES[kind],
  };
}

function errorFromThrown(cause: unknown): ApiError {
  const aborted = cause instanceof Error && cause.name === 'AbortError';
  const kind: ApiErrorKind = aborted ? 'timeout' : 'network';
  return { kind, message: FALLBACK_MESSAGES[kind] };
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
      headers: requestHeaders('application/json'),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) return fail(errorFromEnvelope(response.status, payload));

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return fail({ kind: 'invalid_response', status: response.status, message: FALLBACK_MESSAGES.invalid_response });
    }
    return ok(parsed.data);
  } catch (cause) {
    return fail(errorFromThrown(cause));
  } finally {
    clearTimeout(timer);
  }
}

const NEWLINE = 10;

/**
 * POSTs JSON and reads a newline-delimited JSON (NDJSON) response, calling `onEvent` for each line as soon as it
 * arrives. Resolves once the stream ends. Never throws. Lines are split on the newline byte before decoding,
 * which is safe for UTF-8 because that byte never occurs inside a multi-byte character.
 */
export async function postNdjson(
  path: string,
  body: unknown,
  onEvent: (event: unknown) => void,
  timeoutMs: number,
): Promise<ApiResult<null>> {
  if (!ENV.apiBaseUrl) {
    return fail({ kind: 'not_configured', message: FALLBACK_MESSAGES.not_configured });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const decoder = new TextDecoder();

  const emit = (bytes: Uint8Array): boolean => {
    const line = decoder.decode(bytes).trim();
    if (!line) return true;
    try {
      onEvent(JSON.parse(line));
      return true;
    } catch {
      return false;
    }
  };

  try {
    const response = await streamingFetch(`${ENV.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: requestHeaders('application/x-ndjson'),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      return fail(errorFromEnvelope(response.status, payload));
    }
    if (!response.body) {
      return fail({ kind: 'invalid_response', status: response.status, message: FALLBACK_MESSAGES.invalid_response });
    }

    const reader = response.body.getReader();
    let buffered = new Uint8Array(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (value && value.length > 0) {
        const merged = new Uint8Array(buffered.length + value.length);
        merged.set(buffered);
        merged.set(value, buffered.length);
        buffered = merged;

        let newline = buffered.indexOf(NEWLINE);
        while (newline >= 0) {
          if (!emit(buffered.subarray(0, newline))) {
            return fail({ kind: 'invalid_response', status: response.status, message: FALLBACK_MESSAGES.invalid_response });
          }
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf(NEWLINE);
        }
      }
      if (done) break;
    }
    if (buffered.length > 0 && !emit(buffered)) {
      return fail({ kind: 'invalid_response', status: response.status, message: FALLBACK_MESSAGES.invalid_response });
    }
    return ok(null);
  } catch (cause) {
    return fail(errorFromThrown(cause));
  } finally {
    clearTimeout(timer);
  }
}

let lastVisionWarmUpAt = 0;
const VISION_WARM_UP_INTERVAL_MS = 120_000;

/**
 * Fire-and-forget: asks the gateway to boot the SAM GPU (when self-hosted) while the camera is open.
 * Throttled to once every 2 minutes; does nothing harmful on gateways without the route.
 */
export function warmUpVision(): void {
  if (!ENV.apiBaseUrl) return;
  const now = Date.now();
  if (now - lastVisionWarmUpAt < VISION_WARM_UP_INTERVAL_MS) return;
  lastVisionWarmUpAt = now;
  fetch(`${ENV.apiBaseUrl}/api/vision/warm`, { method: 'POST', headers: requestHeaders('application/json'), body: '{}' }).catch(
    () => {
      lastVisionWarmUpAt = 0;
    },
  );
}

let lastWarmUpAt = 0;
const WARM_UP_INTERVAL_MS = 60_000;

/**
 * Fire-and-forget request to the public health route so a scaled-to-zero Modal container starts booting while
 * the user is still talking. Throttled to one call a minute.
 */
export function warmUpGateway(): void {
  if (!ENV.apiBaseUrl) return;
  const now = Date.now();
  if (now - lastWarmUpAt < WARM_UP_INTERVAL_MS) return;
  lastWarmUpAt = now;
  fetch(`${ENV.apiBaseUrl}/health`).catch(() => {
    lastWarmUpAt = 0;
  });
}
