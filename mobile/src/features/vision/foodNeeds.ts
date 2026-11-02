import type { MenuDish, Verdict } from '@/services/api/schemas';
import type { FoodNeeds } from '@/storage/preferences';

export const FOOD_NEED_OPTIONS = [
  { id: 'peanut', label: 'Peanuts', description: 'peanut allergy' },
  { id: 'tree_nut', label: 'Tree nuts', description: 'tree nut allergy' },
  { id: 'shellfish', label: 'Shellfish', description: 'shellfish allergy' },
  { id: 'fish', label: 'Fish', description: 'fish allergy' },
  { id: 'gluten', label: 'Gluten', description: 'no gluten (coeliac)' },
  { id: 'dairy', label: 'Dairy', description: 'no dairy' },
  { id: 'egg', label: 'Egg', description: 'egg allergy' },
  { id: 'sesame', label: 'Sesame', description: 'sesame allergy' },
  { id: 'vegetarian', label: 'Vegetarian', description: 'vegetarian, no meat or fish' },
  { id: 'vegan', label: 'Vegan', description: 'vegan, no animal products' },
  { id: 'halal', label: 'Halal', description: 'halal only' },
  { id: 'kosher', label: 'Kosher', description: 'kosher only' },
  { id: 'no_pork', label: 'No pork', description: 'no pork' },
  { id: 'no_alcohol', label: 'No alcohol', description: 'no alcohol, including in cooking' },
] as const;

const MAX_NEEDS_LENGTH = 400;

export function hasFoodNeeds(needs: FoodNeeds): boolean {
  return describeFoodNeeds(needs).length > 0;
}

export function describeFoodNeeds({ tags, note }: FoodNeeds): string {
  const known = FOOD_NEED_OPTIONS.filter((option) => tags.includes(option.id)).map((option) => option.description);
  return [known.join(', '), note.trim()].filter(Boolean).join('. ').slice(0, MAX_NEEDS_LENGTH);
}

export function summarizeFoodNeeds({ tags, note }: FoodNeeds): string {
  const labels: string[] = FOOD_NEED_OPTIONS.filter((option) => tags.includes(option.id)).map((option) => option.label);
  if (note.trim()) labels.push(note.trim());
  return labels.join(', ');
}

export function verdictBySegment(dishes: readonly MenuDish[]): Record<string, Verdict> {
  const verdicts: Record<string, Verdict> = {};
  for (const dish of dishes) {
    if (dish.segment_id && !verdicts[dish.segment_id]) verdicts[dish.segment_id] = dish.verdict;
  }
  return verdicts;
}
