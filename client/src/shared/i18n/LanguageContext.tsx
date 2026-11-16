import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, dictionaries, normalizeLocale, translate, type AppLocale, type SupportedAppLocale, type I18nKey } from './dictionaries';
import { publishAppearance, subscribeAppearance } from '../utils/appearanceEvents';

interface LanguageContextValue {
  language: AppLocale;
  setLanguage: (locale: AppLocale) => void;
  t: (key: I18nKey, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LOCALE,
  setLanguage: () => undefined,
  t: (key, fallback) => translate(DEFAULT_LOCALE, key, fallback),
});

function detectInitialLocale(): SupportedAppLocale {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = normalizeLocale(navigator.language);
    // Respeta el idioma reconocido del sistema y usa español como alternativa.
    if (nav !== DEFAULT_LOCALE) return nav;
  }
  return DEFAULT_LOCALE;
}

export function ControlledLanguageProvider({ children, language, onLanguageChange }: { children: ReactNode; language: AppLocale; onLanguageChange: (language: AppLocale) => void }) {
  const t = useCallback((key: I18nKey, fallback?: string) => translate(language, key, fallback ?? dictionaries.en[key]), [language]);
  const value = useMemo(() => ({ language, setLanguage: onLanguageChange, t }), [language, onLanguageChange, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLocale>(() => detectInitialLocale());
  const changedByUser = useRef(false);

  useEffect(() => subscribeAppearance(change => {
    if (change.ui_language) { changedByUser.current = true; setLanguageState(change.ui_language); }
  }), []);

  useEffect(() => {
    let disposed = false;
    void window.savia?.config.load().then(async (config) => {
      if (disposed || changedByUser.current) return;
      if (config?.ui_language) {
        const next = normalizeLocale(config.ui_language);
        setLanguageState(next);
        if (next !== config.ui_language) await window.savia?.config.save({ ui_language: next });
      }
      else {
        const initial = detectInitialLocale();
        await window.savia?.config.save({ ui_language: initial });
        if (!disposed && !changedByUser.current) setLanguageState(initial);
      }
    }).catch((error) => console.error('No se pudo cargar el idioma de la aplicación:', error));
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((locale: AppLocale) => {
    const next = normalizeLocale(locale);
    changedByUser.current = true;
    void window.savia?.config.save({ ui_language: next }).then(result => {
      if (!result.success) throw new Error(result.message);
      setLanguageState(next);
      publishAppearance({ ui_language: next });
    })
      .catch((error) => console.error('No se pudo guardar el idioma de la aplicación:', error));
  }, []);

  const t = useCallback(
    (key: I18nKey, fallback?: string) => translate(language, key, fallback ?? dictionaries.en[key]),
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export function useT(): LanguageContextValue['t'] {
  return useContext(LanguageContext).t;
}
