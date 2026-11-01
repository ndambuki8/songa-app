import { describe, expect, it } from '@jest/globals';

import { LANGUAGES, findLanguage, searchLanguages } from '@/config/languages';

describe('languages', () => {
  it('has unique locales with three-letter currencies', () => {
    expect(new Set(LANGUAGES.map((l) => l.locale)).size).toBe(LANGUAGES.length);
    for (const language of LANGUAGES) expect(language.currency).toMatch(/^[A-Z]{3}$/);
  });

  it('finds by native name, English name, country or locale', () => {
    expect(searchLanguages('日本').map((l) => l.locale)).toEqual(['ja-JP']);
    expect(searchLanguages('swahili').map((l) => l.locale)).toEqual(['sw-KE', 'sw-TZ']);
    expect(searchLanguages('Nigeria').length).toBeGreaterThanOrEqual(4);
    expect(searchLanguages('fil-ph').map((l) => l.locale)).toEqual(['fil-PH']);
    expect(searchLanguages('  ')).toBe(LANGUAGES);
  });

  it('falls back to the first language for unknown locales', () => {
    expect(findLanguage('xx-XX')).toBe(LANGUAGES[0]);
  });
});
