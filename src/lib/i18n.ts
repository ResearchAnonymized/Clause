import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "@/locales/en";
import fi from "@/locales/fi";
import sv from "@/locales/sv";

export const SUPPORTED_LANGS = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fi", label: "Suomi", flag: "🇫🇮" },
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number]["code"];

function loadResources() {
  i18n.addResourceBundle("en", "translation", en, true, true);
  i18n.addResourceBundle("fi", "translation", fi, true, true);
  i18n.addResourceBundle("sv", "translation", sv, true, true);
}

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        fi: { translation: fi },
        sv: { translation: sv },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "fi", "sv"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: "clause.lang",
      },
    });
} else {
  loadResources();
}

if (import.meta.hot) {
  import.meta.hot.accept(["@/locales/en", "@/locales/fi", "@/locales/sv"], () => {
    loadResources();
  });
}

export default i18n;
