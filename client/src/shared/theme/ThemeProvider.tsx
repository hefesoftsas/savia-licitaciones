import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '../i18n';
import { useToast } from '../ui/ToastProvider';
import { publishAppearance, subscribeAppearance } from '../utils/appearanceEvents';

export const VISUAL_STYLES = ['vega', 'nova', 'maia', 'lyra', 'mira'] as const;
export type VisualStyle = typeof VISUAL_STYLES[number];
export const COLOR_THEMES = ['neutral', 'blue', 'green', 'violet', 'rose'] as const;
export type ColorTheme = typeof COLOR_THEMES[number];
export type AppTheme = 'light' | 'dark' | 'system';
interface ThemeContextValue {
  opportunityDetail: 'dialog' | 'drawer';
  setOpportunityDetail: (value: 'dialog' | 'drawer') => Promise<void>;
  theme: AppTheme;
  visualStyle: VisualStyle;
  setVisualStyle: (style: VisualStyle) => Promise<void>;
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => Promise<void>;
  saving: boolean;
  setTheme: (theme: AppTheme) => Promise<void>;
}
const ThemeContext = createContext<ThemeContextValue>({ opportunityDetail: 'dialog', setOpportunityDetail: async () => {}, theme: 'system', visualStyle: 'vega', setVisualStyle: async () => {}, colorTheme: 'neutral', setColorTheme: async () => {}, saving: false, setTheme: async () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [opportunityDetail, setOpportunityDetailState] = useState<'dialog' | 'drawer'>('dialog');
  const detailChanged = useRef(false);
  const [theme, setThemeState] = useState<AppTheme>('system');
  const [colorTheme, setColorThemeState] = useState<ColorTheme>('neutral');
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>('vega');
  const styleChanged = useRef(false);
  const colorChanged = useRef(false);
  const [saving, setSaving] = useState(false);
  const changed = useRef(false);
  const savingRef = useRef(false);
  const { t } = useLanguage();
  const { showToast } = useToast();

  useEffect(() => subscribeAppearance(change => {
    if (change.ui_opportunity_detail) { detailChanged.current = true; setOpportunityDetailState(change.ui_opportunity_detail); }
    if (change.ui_style) { styleChanged.current = true; setVisualStyleState(change.ui_style); }
    if (change.ui_color_theme) { colorChanged.current = true; setColorThemeState(change.ui_color_theme); }
    if (change.ui_theme) { changed.current = true; setThemeState(change.ui_theme); }
  }), []);

  useEffect(() => {
    let active = true;
    void window.savia?.config.load().then((config) => {
      if (active && !detailChanged.current) setOpportunityDetailState(config?.ui_opportunity_detail || 'dialog');
      if (active && !styleChanged.current) setVisualStyleState(config?.ui_style || 'vega');
      if (active && !colorChanged.current) setColorThemeState(config?.ui_color_theme || 'neutral');
      if (active && !changed.current) setThemeState(config?.ui_theme || 'system');
    }).catch(() => { if (active) showToast(t('appearance.loadError'), 'error'); });
    return () => { active = false; };
  }, [showToast, t]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => { document.documentElement.dataset.colorTheme = colorTheme; }, [colorTheme]);

  useEffect(() => { document.documentElement.dataset.uiStyle = visualStyle; }, [visualStyle]);

  const setOpportunityDetail = useCallback(async (next: 'dialog' | 'drawer') => {
    if (savingRef.current) return;
    detailChanged.current = true;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await window.savia.config.save({ ui_opportunity_detail: next });
      if (!result.success) throw new Error(result.message);
      setOpportunityDetailState(next);
      publishAppearance({ ui_opportunity_detail: next });
    } catch {
      showToast(t('appearance.saveError'), 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [showToast, t]);

  const setVisualStyle = useCallback(async (next: VisualStyle) => {
    if (savingRef.current) return;
    styleChanged.current = true;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await window.savia.config.save({ ui_style: next });
      if (!result.success) throw new Error(result.message);
      setVisualStyleState(next);
      publishAppearance({ ui_style: next });
    } catch {
      showToast(t('appearance.saveError'), 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [showToast, t]);

  const setColorTheme = useCallback(async (next: ColorTheme) => {
    if (savingRef.current) return;
    colorChanged.current = true;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await window.savia.config.save({ ui_color_theme: next });
      if (!result.success) throw new Error(result.message);
      setColorThemeState(next);
      publishAppearance({ ui_color_theme: next });
    } catch {
      showToast(t('appearance.saveError'), 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [showToast, t]);

  const setTheme = useCallback(async (next: AppTheme) => {
    if (savingRef.current) return;
    changed.current = true;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await window.savia.config.save({ ui_theme: next });
      if (!result.success) throw new Error(result.message);
      setThemeState(next);
      publishAppearance({ ui_theme: next });
    } catch {
      showToast(t('appearance.saveError'), 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [showToast, t]);

  return <ThemeContext.Provider value={{ opportunityDetail, setOpportunityDetail, theme, visualStyle, setVisualStyle, colorTheme, setColorTheme, saving, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
