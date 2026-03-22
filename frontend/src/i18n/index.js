import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import fr from './fr.json';

const language = process.env.REACT_APP_LANGUAGE || 'en';

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
