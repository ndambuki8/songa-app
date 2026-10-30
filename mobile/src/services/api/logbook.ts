import { REQUEST_TIMEOUT_MS } from '@/config/env';

import { postJson } from './client';
import type { ApiResult } from './result';
import { ItineraryResponseSchema, type ItineraryResponse } from './schemas';

export interface LogbookPayloadEntry {
  id: string;
  kind: 'text' | 'voice' | 'photo';
  captured_at: string;
  text: string | null;
  image_b64: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface CompileItineraryRequest {
  date: string;
  timezone: string;
  travelerLocale: string;
  entries: LogbookPayloadEntry[];
}

export function compileItinerary(request: CompileItineraryRequest): Promise<ApiResult<ItineraryResponse>> {
  return postJson(
    '/api/logbook/compile-itinerary',
    {
      date: request.date,
      timezone: request.timezone,
      traveler_locale: request.travelerLocale,
      entries: request.entries,
    },
    ItineraryResponseSchema,
    REQUEST_TIMEOUT_MS.itinerary,
  );
}
