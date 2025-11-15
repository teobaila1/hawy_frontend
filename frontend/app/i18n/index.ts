import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './en.json';
import ro from './ro.json';

// Obținem limba sistemului în mod sigur (Expo SDK 49+)
const locales = Localization.getLocales();
const deviceLanguage: string =
  locales && locales.length > 0 && locales[0].languageCode
    ? locales[0].languageCode
    : 'en';

i18n
  .use(initReactI18next)
  .init({
    // dacă începe cu "ro" => română, altfel engleză
    lng: deviceLanguage.startsWith('ro') ? 'ro' : 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      ro: { translation: ro },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
