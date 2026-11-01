import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { requestLocalCard, type CardInput, type CardKind } from '@/services/api/cards';
import { LocalCardResponseSchema, type LocalCardResponse } from '@/services/api/schemas';
import { STORAGE_KEYS, readJson, writeJson } from '@/storage/keyValue';
import { hasNeeds, usePreferences } from '@/storage/preferences';

import type { AnchorPoint } from './useAnchorNavigator';

const StoredCardSchema = z.object({ key: z.string(), card: LocalCardResponseSchema, savedAt: z.string() });
const StoredCardsSchema = z.object({ home: StoredCardSchema.optional(), needs: StoredCardSchema.optional() });
type StoredCards = z.infer<typeof StoredCardsSchema>;

export interface CardState {
  /** True when there is something to put on the card (an anchor, or saved needs). */
  available: boolean;
  /** The card for the current inputs and language, saved on the phone so it works offline. */
  card: LocalCardResponse | null;
  generating: boolean;
  error: string | null;
  retry: () => void;
}

const KINDS: readonly CardKind[] = ['home', 'needs'];

/**
 * Writes the "Take me home" and "My needs" cards in the local language once, while online, and keeps them on the
 * phone. A card is rewritten automatically when its inputs or the local language change.
 */
export function useLocalCards({ anchor, active }: { anchor: AnchorPoint | null; active: boolean }) {
  const { residentLocale, travelerLocale, needs } = usePreferences();
  const [stored, setStored] = useState<StoredCards | null>(null);
  const [generating, setGenerating] = useState<Record<CardKind, boolean>>({ home: false, needs: false });
  const [errors, setErrors] = useState<Record<CardKind, string | null>>({ home: null, needs: null });
  const attempted = useRef<Record<CardKind, string | null>>({ home: null, needs: null });
  const inFlight = useRef<Record<CardKind, boolean>>({ home: false, needs: false });

  useEffect(() => {
    void readJson(STORAGE_KEYS.localCards, StoredCardsSchema).then((cards) => setStored(cards ?? {}));
  }, []);

  const inputs = useMemo<Record<CardKind, { key: string; input: CardInput } | null>>(() => {
    const languages = `${residentLocale}|${travelerLocale}`;
    return {
    home: anchor
      ? {
          key: `${anchor.lockedAt}|${anchor.label}|${languages}`,
          input: {
            kind: 'home',
            placeName: anchor.label,
            address: anchor.address,
            latitude: anchor.latitude,
            longitude: anchor.longitude,
          },
        }
      : null,
    needs: hasNeeds(needs)
      ? {
          key: `${JSON.stringify(needs)}|${languages}`,
          input: { kind: 'needs', allergies: needs.allergies, diet: needs.diet, notes: needs.notes },
        }
      : null,
    };
  }, [anchor, needs, residentLocale, travelerLocale]);

  const generate = useCallback(
    async (kind: CardKind) => {
      const target = inputs[kind];
      if (!target || inFlight.current[kind]) return;
      inFlight.current[kind] = true;
      attempted.current[kind] = target.key;
      setGenerating((current) => ({ ...current, [kind]: true }));
      setErrors((current) => ({ ...current, [kind]: null }));

      const result = await requestLocalCard(target.input, { targetLocale: residentLocale, travelerLocale });
      inFlight.current[kind] = false;
      setGenerating((current) => ({ ...current, [kind]: false }));
      if (!result.ok) {
        setErrors((current) => ({ ...current, [kind]: result.error.message }));
        return;
      }
      setStored((current) => {
        const next: StoredCards = {
          ...current,
          [kind]: { key: target.key, card: result.data, savedAt: new Date().toISOString() },
        };
        void writeJson(STORAGE_KEYS.localCards, next);
        return next;
      });
    },
    [inputs, residentLocale, travelerLocale],
  );

  // Write missing or outdated cards while the Anchor tab is open; each version is attempted once automatically.
  const homeKey = inputs.home?.key ?? null;
  const needsKey = inputs.needs?.key ?? null;
  useEffect(() => {
    if (!active || stored === null) return;
    const keys: Record<CardKind, string | null> = { home: homeKey, needs: needsKey };
    const due = KINDS.filter(
      (kind) => keys[kind] !== null && stored[kind]?.key !== keys[kind] && attempted.current[kind] !== keys[kind],
    );
    if (due.length === 0) return;
    const timer = setTimeout(() => due.forEach((kind) => void generate(kind)), 300);
    return () => clearTimeout(timer);
  }, [active, generate, homeKey, needsKey, stored]);

  const stateFor = (kind: CardKind): CardState => {
    const key = inputs[kind]?.key ?? null;
    const saved = stored?.[kind];
    return {
      available: key !== null,
      card: key !== null && saved?.key === key ? saved.card : null,
      generating: generating[kind],
      error: errors[kind],
      retry: () => void generate(kind),
    };
  };

  return { home: stateFor('home'), needs: stateFor('needs') };
}
