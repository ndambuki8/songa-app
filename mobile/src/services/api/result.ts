export type ApiErrorKind =
  | 'not_configured'
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'bad_request'
  | 'expired'
  | 'upstream'
  | 'invalid_response'
  | 'server';

export interface ApiError {
  kind: ApiErrorKind;
  /** Human-readable message suitable for the ErrorBanner. */
  message: string;
  status?: number;
  /** Machine code returned by the backend error envelope, when present. */
  code?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const fail = <T>(error: ApiError): ApiResult<T> => ({ ok: false, error });
