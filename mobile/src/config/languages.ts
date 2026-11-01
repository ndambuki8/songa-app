export interface SongaLanguage {
  /** BCP-47 locale, used both for the model prompt and for expo-speech voices. */
  locale: string;
  label: string;
  /** English name, used for search. */
  englishName: string;
  /** Country whose politeness norms the translation should follow. */
  country: string;
  currency: string;
}

export const LANGUAGES: readonly SongaLanguage[] = [
  { locale: 'en-US', label: 'English', englishName: 'English', country: 'United States', currency: 'USD' },
  { locale: 'en-GB', label: 'English (UK)', englishName: 'English', country: 'United Kingdom', currency: 'GBP' },
  { locale: 'en-AU', label: 'English (Australia)', englishName: 'English', country: 'Australia', currency: 'AUD' },
  { locale: 'en-CA', label: 'English (Canada)', englishName: 'English', country: 'Canada', currency: 'CAD' },
  { locale: 'en-IN', label: 'English (India)', englishName: 'English', country: 'India', currency: 'INR' },
  { locale: 'en-NG', label: 'English (Nigeria)', englishName: 'English', country: 'Nigeria', currency: 'NGN' },
  { locale: 'en-ZA', label: 'English (South Africa)', englishName: 'English', country: 'South Africa', currency: 'ZAR' },
  { locale: 'sw-KE', label: 'Kiswahili', englishName: 'Swahili', country: 'Kenya', currency: 'KES' },
  { locale: 'sw-TZ', label: 'Kiswahili (Tanzania)', englishName: 'Swahili', country: 'Tanzania', currency: 'TZS' },
  { locale: 'am-ET', label: 'አማርኛ', englishName: 'Amharic', country: 'Ethiopia', currency: 'ETB' },
  { locale: 'so-SO', label: 'Soomaali', englishName: 'Somali', country: 'Somalia', currency: 'SOS' },
  { locale: 'yo-NG', label: 'Yorùbá', englishName: 'Yoruba', country: 'Nigeria', currency: 'NGN' },
  { locale: 'ha-NG', label: 'Hausa', englishName: 'Hausa', country: 'Nigeria', currency: 'NGN' },
  { locale: 'ig-NG', label: 'Igbo', englishName: 'Igbo', country: 'Nigeria', currency: 'NGN' },
  { locale: 'zu-ZA', label: 'isiZulu', englishName: 'Zulu', country: 'South Africa', currency: 'ZAR' },
  { locale: 'af-ZA', label: 'Afrikaans', englishName: 'Afrikaans', country: 'South Africa', currency: 'ZAR' },
  { locale: 'fr-FR', label: 'Français', englishName: 'French', country: 'France', currency: 'EUR' },
  { locale: 'fr-CA', label: 'Français (Canada)', englishName: 'French', country: 'Canada', currency: 'CAD' },
  { locale: 'fr-SN', label: 'Français (Sénégal)', englishName: 'French', country: 'Senegal', currency: 'XOF' },
  { locale: 'es-ES', label: 'Español', englishName: 'Spanish', country: 'Spain', currency: 'EUR' },
  { locale: 'es-MX', label: 'Español (México)', englishName: 'Spanish', country: 'Mexico', currency: 'MXN' },
  { locale: 'es-AR', label: 'Español (Argentina)', englishName: 'Spanish', country: 'Argentina', currency: 'ARS' },
  { locale: 'es-CO', label: 'Español (Colombia)', englishName: 'Spanish', country: 'Colombia', currency: 'COP' },
  { locale: 'pt-BR', label: 'Português (Brasil)', englishName: 'Portuguese', country: 'Brazil', currency: 'BRL' },
  { locale: 'pt-PT', label: 'Português (Portugal)', englishName: 'Portuguese', country: 'Portugal', currency: 'EUR' },
  { locale: 'de-DE', label: 'Deutsch', englishName: 'German', country: 'Germany', currency: 'EUR' },
  { locale: 'it-IT', label: 'Italiano', englishName: 'Italian', country: 'Italy', currency: 'EUR' },
  { locale: 'nl-NL', label: 'Nederlands', englishName: 'Dutch', country: 'Netherlands', currency: 'EUR' },
  { locale: 'sv-SE', label: 'Svenska', englishName: 'Swedish', country: 'Sweden', currency: 'SEK' },
  { locale: 'pl-PL', label: 'Polski', englishName: 'Polish', country: 'Poland', currency: 'PLN' },
  { locale: 'cs-CZ', label: 'Čeština', englishName: 'Czech', country: 'Czechia', currency: 'CZK' },
  { locale: 'el-GR', label: 'Ελληνικά', englishName: 'Greek', country: 'Greece', currency: 'EUR' },
  { locale: 'ru-RU', label: 'Русский', englishName: 'Russian', country: 'Russia', currency: 'RUB' },
  { locale: 'uk-UA', label: 'Українська', englishName: 'Ukrainian', country: 'Ukraine', currency: 'UAH' },
  { locale: 'tr-TR', label: 'Türkçe', englishName: 'Turkish', country: 'Turkey', currency: 'TRY' },
  { locale: 'ar-EG', label: 'العربية (مصر)', englishName: 'Arabic', country: 'Egypt', currency: 'EGP' },
  { locale: 'ar-SA', label: 'العربية (السعودية)', englishName: 'Arabic', country: 'Saudi Arabia', currency: 'SAR' },
  { locale: 'ar-AE', label: 'العربية (الإمارات)', englishName: 'Arabic', country: 'United Arab Emirates', currency: 'AED' },
  { locale: 'ar-MA', label: 'العربية (المغرب)', englishName: 'Arabic', country: 'Morocco', currency: 'MAD' },
  { locale: 'he-IL', label: 'עברית', englishName: 'Hebrew', country: 'Israel', currency: 'ILS' },
  { locale: 'fa-IR', label: 'فارسی', englishName: 'Persian', country: 'Iran', currency: 'IRR' },
  { locale: 'hi-IN', label: 'हिन्दी', englishName: 'Hindi', country: 'India', currency: 'INR' },
  { locale: 'bn-BD', label: 'বাংলা', englishName: 'Bengali', country: 'Bangladesh', currency: 'BDT' },
  { locale: 'ur-PK', label: 'اردو', englishName: 'Urdu', country: 'Pakistan', currency: 'PKR' },
  { locale: 'ta-IN', label: 'தமிழ்', englishName: 'Tamil', country: 'India', currency: 'INR' },
  { locale: 'ne-NP', label: 'नेपाली', englishName: 'Nepali', country: 'Nepal', currency: 'NPR' },
  { locale: 'zh-CN', label: '中文 (简体)', englishName: 'Chinese, Mandarin', country: 'China', currency: 'CNY' },
  { locale: 'zh-TW', label: '中文 (繁體)', englishName: 'Chinese, Traditional', country: 'Taiwan', currency: 'TWD' },
  { locale: 'zh-HK', label: '粵語', englishName: 'Cantonese', country: 'Hong Kong', currency: 'HKD' },
  { locale: 'ja-JP', label: '日本語', englishName: 'Japanese', country: 'Japan', currency: 'JPY' },
  { locale: 'ko-KR', label: '한국어', englishName: 'Korean', country: 'South Korea', currency: 'KRW' },
  { locale: 'th-TH', label: 'ไทย', englishName: 'Thai', country: 'Thailand', currency: 'THB' },
  { locale: 'vi-VN', label: 'Tiếng Việt', englishName: 'Vietnamese', country: 'Vietnam', currency: 'VND' },
  { locale: 'id-ID', label: 'Bahasa Indonesia', englishName: 'Indonesian', country: 'Indonesia', currency: 'IDR' },
  { locale: 'ms-MY', label: 'Bahasa Melayu', englishName: 'Malay', country: 'Malaysia', currency: 'MYR' },
  { locale: 'fil-PH', label: 'Filipino', englishName: 'Filipino, Tagalog', country: 'Philippines', currency: 'PHP' },
] as const;

export const DEFAULT_TRAVELER_LOCALE = 'en-US';
export const DEFAULT_RESIDENT_LOCALE = 'ja-JP';

export function findLanguage(locale: string): SongaLanguage {
  return LANGUAGES.find((language) => language.locale === locale) ?? LANGUAGES[0]!;
}

export function searchLanguages(query: string): readonly SongaLanguage[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return LANGUAGES;
  return LANGUAGES.filter((language) =>
    [language.label, language.englishName, language.country, language.locale].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}
