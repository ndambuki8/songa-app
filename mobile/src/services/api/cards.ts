import { REQUEST_TIMEOUT_MS } from '@/config/env';
import { findLanguage } from '@/config/languages';

import { postJson } from './client';
import type { ApiResult } from './result';
import { LocalCardResponseSchema, type LocalCardResponse } from './schemas';

export type CardKind = 'home' | 'needs';

export interface HomeCardInput {
  kind: 'home';
  placeName: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export interface NeedsCardInput {
  kind: 'needs';
  allergies: string[];
  diet: string[];
  notes: string;
}

export type CardInput = HomeCardInput | NeedsCardInput;

export function requestLocalCard(
  input: CardInput,
  { targetLocale, travelerLocale }: { targetLocale: string; travelerLocale: string },
): Promise<ApiResult<LocalCardResponse>> {
  const target = findLanguage(targetLocale);
  const shared = { target_locale: target.locale, target_country: target.country, traveler_locale: travelerLocale };
  const body =
    input.kind === 'home'
      ? {
          ...shared,
          kind: 'home',
          place_name: input.placeName,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
        }
      : { ...shared, kind: 'needs', allergies: input.allergies, diet: input.diet, notes: input.notes.trim() || null };
  return postJson('/api/cards/local', body, LocalCardResponseSchema, REQUEST_TIMEOUT_MS.card);
}
