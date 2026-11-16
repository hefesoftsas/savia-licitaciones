import {useState, type ComponentProps} from 'react';
import {ArrowLeft, Check, ChevronRight, ChevronsUpDown, Globe2, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun, UserRound} from 'lucide-react';
import {Popover, PopoverTrigger, PopoverContent} from '@/shared/ui/primitives/popover';
import {Button} from '@/shared/ui/primitives/button';
import {COLOR_THEMES, VISUAL_STYLES} from '@/shared/theme/ThemeProvider';
import type {WebAppearance} from './WebAppearance';

type Props = ComponentProps<typeof WebAppearance> & {
  user: {name: string; email: string}; error: boolean;
  onAccount: () => void; onAdmin?: () => void; onLogout: () => void; onLanguage: (language: 'es' | 'en') => void;
};
export function WebUserMenu({user, error, onAccount, onAdmin, onLogout, onLanguage, ...appearance}: Props) {
  const [open, setOpen] = useState(false), [panel, setPanel] = useState<'main'|'appearance'>('main');
  const en = appearance.language === 'en';
  const initials = user.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const colors = {neutral:en?'Neutral':'Neutro',blue:en?'Blue':'Azul',green:en?'Green':'Verde',violet:en?'Violet':'Violeta',rose:en?'Rose':'Rosa'};
  const styles = {vega:en?'Classic':'Clásico',nova:en?'Compact':'Compacto',maia:en?'Soft':'Suave',lyra:en?'Sharp':'Recto',mira:en?'Dense':'Denso'};
  return <div className="web-user-menu"><Popover open={open} onOpenChange={value=>{setOpen(value);if(!value)setPanel('main');}}>
    <PopoverTrigger asChild><Button variant="ghost" className="web-user-trigger" aria-label={en?'Account and preferences':'Cuenta y preferencias'}>
      <span className="web-user-avatar" aria-hidden="true">{initials}</span><span className="web-user-identity"><strong>{user.name}</strong><small>{user.email}</small></span><ChevronsUpDown aria-hidden="true"/>
    </Button></PopoverTrigger>
    <PopoverContent side="top" sideOffset={8} align="start" className="web-user-popover" aria-label={en?'Account and preferences':'Cuenta y preferencias'}>
      {panel==='main'?<>
        <div className="web-user-menu-heading"><strong>{user.name}</strong><small>{user.email}</small></div>
        <div className="web-user-menu-section"><Button variant="ghost" className="web-user-action" onClick={()=>{setOpen(false);onAccount();}}><UserRound aria-hidden="true"/><span>{en?'My account':'Mi cuenta'}</span><ChevronRight aria-hidden="true"/></Button>{onAdmin&&<Button variant="ghost" className="web-user-action" onClick={()=>{setOpen(false);onAdmin();}}><ShieldCheck aria-hidden="true"/><span>{en?'Administration':'Administración'}</span><ChevronRight aria-hidden="true"/></Button>}</div>
        <div className="web-user-menu-section">
          <div className="web-user-mode" role="group" aria-label={en?'Color mode':'Modo de color'}>{([{value:'light',icon:Sun,label:en?'Light':'Claro'},{value:'dark',icon:Moon,label:en?'Dark':'Oscuro'},{value:'system',icon:Monitor,label:en?'System':'Sistema'}] as const).map(({value,icon:Icon,label})=><Button key={value} variant="ghost" size="sm" disabled={appearance.busy} aria-label={label} title={label} aria-pressed={appearance.theme===value} onClick={()=>appearance.onChange(value)}><Icon aria-hidden="true"/></Button>)}</div>
          <Button variant="ghost" className="web-user-action" onClick={()=>setPanel('appearance')}><Palette aria-hidden="true"/><span>{en?'Customize theme':'Personalizar tema'}</span><ChevronRight aria-hidden="true"/></Button>
          <div className="web-user-language-row"><Globe2 aria-hidden="true"/><span>{en?'Language':'Idioma'}</span><div role="group" aria-label={en?'Language':'Idioma'}>{(['es','en'] as const).map(language=><Button key={language} size="sm" variant="ghost" disabled={appearance.busy} aria-label={language==='es'?'Español':'English'} aria-pressed={appearance.language===language} onClick={()=>onLanguage(language)}>{language.toUpperCase()}</Button>)}</div></div>
        </div>
        <div className="web-user-menu-section"><Button variant="ghost" className="web-user-action" onClick={()=>{setOpen(false);onLogout();}}><LogOut aria-hidden="true"/><span>{en?'Sign out':'Cerrar sesión'}</span></Button></div>
      </>:<>
        <Button variant="ghost" className="web-user-action" onClick={()=>setPanel('main')}><ArrowLeft aria-hidden="true"/><span>{en?'Customize theme':'Personalizar tema'}</span></Button>
        <div className="web-user-menu-section web-user-customize"><p>{en?'Accent color':'Color de acento'}</p><div className="web-user-swatches" role="group" aria-label={en?'Accent color':'Color de acento'}>{COLOR_THEMES.map(color=><button type="button" key={color} data-color={color} aria-label={colors[color]} title={colors[color]} aria-pressed={appearance.colorTheme===color} disabled={appearance.busy} onClick={()=>appearance.onColorChange(color)}>{appearance.colorTheme===color&&<Check size={16} aria-hidden="true"/>}</button>)}</div></div>
        <div className="web-user-menu-section web-user-customize"><p>{en?'Interface style':'Estilo de interfaz'}</p><div className="web-user-styles" role="group" aria-label={en?'Interface style':'Estilo de interfaz'}>{VISUAL_STYLES.map(style=><Button key={style} variant="ghost" className="web-user-action" disabled={appearance.busy} aria-pressed={appearance.visualStyle===style} onClick={()=>appearance.onStyleChange(style)}><span>{style[0].toUpperCase()+style.slice(1)}<small>{styles[style]}</small></span>{appearance.visualStyle===style&&<Check aria-hidden="true"/>}</Button>)}</div></div>
      </>}
      {error&&<p className="web-user-error" role="alert">{en?'Could not save preferences. Try again.':'No se pudieron guardar las preferencias. Inténtalo de nuevo.'}</p>}
    </PopoverContent>
  </Popover>{error&&!open&&<p role="alert">{en?'Could not save preferences.':'No se pudieron guardar las preferencias.'}</p>}</div>;
}
