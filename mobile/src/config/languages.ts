export interface SongaLanguage {
  /** BCP-47 locale, used both for the model prompt and for expo-speech voices. */
  locale: string;
  label: string;
  /** Country whose politeness norms the translation should follow. */
  country: string;
  currency: string;
}

export const LANGUAGES: readonly SongaLanguage[] = [
  { locale: 'en-US', label: 'English', country: 'United States', currency: 'USD' },
  { locale: 'en-GB', label: 'English (UK)', country: 'United Kingdom', currency: 'GBP' },
  { locale: 'sw-KE', label: 'Kiswahili', country: 'Kenya', currency: 'KES' },
  { locale: 'fr-FR', label: 'Français', country: 'France', currency: 'EUR' },
  { locale: 'es-ES', label: 'Español', country: 'Spain', currency: 'EUR' },
  { locale: 'es-MX', label: 'Español (México)', country: 'Mexico', currency: 'MXN' },
  { locale: 'pt-BR', label: 'Português (Brasil)', country: 'Brazil', currency: 'BRL' },
  { locale: 'de-DE', label: 'Deutsch', country: 'Germany', currency: 'EUR' },
  { locale: 'it-IT', label: 'Italiano', country: 'Italy', currency: 'EUR' },
  { locale: 'ja-JP', label: '日本語', country: 'Japan', currency: 'JPY' },
  { locale: 'ko-KR', label: '한국어', country: 'South Korea', currency: 'KRW' },
  { locale: 'zh-CN', label: '中文 (简体)', country: 'China', currency: 'CNY' },
  { locale: 'hi-IN', label: 'हिन्दी', country: 'India', currency: 'INR' },
  { locale: 'ar-EG', label: 'العربية', country: 'Egypt', currency: 'EGP' },
  { locale: 'tr-TR', label: 'Türkçe', country: 'Turkey', currency: 'TRY' },
  { locale: 'th-TH', label: 'ไทย', country: 'Thailand', currency: 'THB' },
  { locale: 'vi-VN', label: 'Tiếng Việt', country: 'Vietnam', currency: 'VND' },
  { locale: 'id-ID', label: 'Bahasa Indonesia', country: 'Indonesia', currency: 'IDR' },
] as const;

export const DEFAULT_TRAVELER_LOCALE = 'en-US';
export const DEFAULT_RESIDENT_LOCALE = 'ja-JP';

export function findLanguage(locale: string): SongaLanguage {
  return LANGUAGES.find((language) => language.locale === locale) ?? LANGUAGES[0]!;
}
