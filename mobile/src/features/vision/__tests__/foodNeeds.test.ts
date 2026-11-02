import { describe, expect, it } from '@jest/globals';

import type { MenuDish } from '@/services/api/schemas';

import { describeFoodNeeds, hasFoodNeeds, summarizeFoodNeeds, verdictBySegment } from '../foodNeeds';

const box = { x: 0, y: 0, width: 10, height: 10 };

describe('food needs', () => {
  it('describes selected needs for the model and keeps the note', () => {
    expect(describeFoodNeeds({ tags: ['vegan', 'peanut'], note: ' severe reaction ' })).toBe(
      'peanut allergy, vegan, no animal products. severe reaction',
    );
  });

  it('ignores unknown tags and reports empty needs', () => {
    expect(hasFoodNeeds({ tags: ['retired_tag'], note: '  ' })).toBe(false);
    expect(hasFoodNeeds({ tags: [], note: 'no coriander' })).toBe(true);
  });

  it('summarizes with short labels', () => {
    expect(summarizeFoodNeeds({ tags: ['shellfish', 'halal'], note: 'no raw fish' })).toBe('Shellfish, Halal, no raw fish');
  });

  it('keeps the first verdict per segment and skips unmarked dishes', () => {
    const dishes: MenuDish[] = [
      { name: 'Satay', verdict: 'avoid', reason: 'peanut', segment_id: 'seg_0', bbox: box },
      { name: 'Satay set', verdict: 'safe', reason: 'n/a', segment_id: 'seg_0', bbox: box },
      { name: 'Tea', verdict: 'safe', reason: 'plain', segment_id: null, bbox: null },
      { name: 'Rice', verdict: 'ask', reason: 'stock', segment_id: 'seg_1', bbox: box },
    ];
    expect(verdictBySegment(dishes)).toEqual({ seg_0: 'avoid', seg_1: 'ask' });
  });
});
