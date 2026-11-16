import {COLOR_THEMES, VISUAL_STYLES, type ColorTheme, type VisualStyle} from '@/shared/theme/ThemeProvider';
export type WebTheme = 'light' | 'dark' | 'system';
export type {ColorTheme, VisualStyle};
type Props = {compact?: boolean; language: 'es' | 'en'; theme: WebTheme; colorTheme: ColorTheme; visualStyle: VisualStyle; busy: boolean; onChange: (theme: WebTheme) => void; onColorChange: (color: ColorTheme) => void; onStyleChange: (style: VisualStyle) => void};
export function WebAppearance({language, theme, colorTheme, visualStyle, busy, onChange, onColorChange, onStyleChange, compact=false}: Props) {
  const en = language === 'en';
  const colors: Record<ColorTheme, string> = {neutral: en ? 'Neutral' : 'Neutro', blue: en ? 'Blue' : 'Azul', green: en ? 'Green' : 'Verde', violet: en ? 'Violet' : 'Violeta', rose: en ? 'Rose' : 'Rosa'};
  return <section className="web-appearance"><div><h2>{en ? 'Appearance' : 'Apariencia'}</h2>{!compact&&<p>{en ? 'Choose the display mode, color and interface style independently. Your choices are saved to your account.' : 'Elige el modo, el color y el estilo de la interfaz por separado. Tus cambios se guardan en tu cuenta.'}</p>}</div>
    <label>{en ? 'Color mode' : 'Modo de color'}<select value={theme} disabled={busy} onChange={event => onChange(event.target.value as WebTheme)}><option value="system">{en ? 'System' : 'Sistema'}</option><option value="light">{en ? 'Light' : 'Claro'}</option><option value="dark">{en ? 'Dark' : 'Oscuro'}</option></select></label>
    <label>{en ? 'Accent color' : 'Color de acento'}<select value={colorTheme} disabled={busy} onChange={event => onColorChange(event.target.value as ColorTheme)}>{COLOR_THEMES.map(color => <option value={color} key={color}>{colors[color]}</option>)}</select></label>
    <label>{en ? 'Interface style' : 'Estilo de interfaz'}<select value={visualStyle} disabled={busy} onChange={event => onStyleChange(event.target.value as VisualStyle)}>{VISUAL_STYLES.map(style => <option value={style} key={style}>{({vega: en ? 'Vega · Classic' : 'Vega · Clásico', nova: en ? 'Nova · Compact' : 'Nova · Compacto', maia: en ? 'Maia · Soft' : 'Maia · Suave', lyra: en ? 'Lyra · Sharp' : 'Lyra · Recto', mira: en ? 'Mira · Dense' : 'Mira · Denso'})[style]}</option>)}</select></label>
  </section>;
}
