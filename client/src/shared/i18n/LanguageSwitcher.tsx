import { NativeSelect } from '../ui/primitives/native-select';
import { useLanguage } from './LanguageContext';
import { APP_LOCALES, type AppLocale } from './dictionaries';

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}
      aria-label={t('common.language')}
    >
      {!compact ? <span>{t('common.language')}</span> : null}
      <NativeSelect
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLocale)}
        style={{ fontSize: 12, padding: '2px 6px' }}
      >
        {APP_LOCALES.map((item) => (
          <option key={item.id} value={item.id}>
            {language === 'es' ? ({ es: 'Español', en: 'Inglés' } as const)[item.id] : item.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

export default LanguageSwitcher;
