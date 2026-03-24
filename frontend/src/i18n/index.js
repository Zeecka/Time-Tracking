import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import fr from './fr.json';

const LANGUAGE_STORAGE_KEY = 'record-language';
const SUPPORTED_LANGUAGES = ['en', 'fr'];

const normalizeLanguage = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : null;
};

const getStoredLanguage = () => {
  try {
    if (typeof window === 'undefined') {
      return null;
    }

    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch (error) {
    return null;
  }
};

const getBrowserLanguage = () => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const browserLanguages = [...(navigator.languages || []), navigator.language];

  for (const browserLanguage of browserLanguages) {
    const normalizedLanguage = normalizeLanguage(browserLanguage);
    if (normalizedLanguage) {
      return normalizedLanguage;
    }
  }

  return null;
};

const language =
  getStoredLanguage() ||
  getBrowserLanguage() ||
  'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: language,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Keep the HTML lang attribute in sync with the active locale
// so screen readers and browser spell-check use the correct language.
document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
