import { REQUEST_TIMEOUT_MS } from '@/config/env';

import { postJson } from './client';
import type { ApiResult } from './result';
import { TripBriefingResponseSchema, type TripBriefing } from './schemas';

export interface TripBriefingRequest {
  destination: string;
  startDate: string;
  days: number;
  stay: string | null;
  needs: string | null;
  travelerLocale: string;
  destinationLocale: string;
  homeCurrency: string;
}

export function requestTripBriefing(request: TripBriefingRequest): Promise<ApiResult<TripBriefing>> {
  return postJson(
    '/api/trip/briefing',
    {
      destination: request.destination,
      start_date: request.startDate,
      days: request.days,
      stay: request.stay,
      needs: request.needs,
      traveler_locale: request.travelerLocale,
      destination_locale: request.destinationLocale,
      home_currency: request.homeCurrency,
    },
    TripBriefingResponseSchema,
    REQUEST_TIMEOUT_MS.trip,
  );
}
