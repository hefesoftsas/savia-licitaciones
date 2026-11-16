// Adapted from the shadcn/ui login-03 block (MIT), using Savia's authentication flows.
import type {FormEvent,ReactNode} from 'react';
import {Button} from '@/shared/ui/primitives/button';
import {Input} from '@/shared/ui/primitives/input';
import saviaMark from '../../../assets/savia.svg';

type Language='es'|'en';
type Props={language:Language;register:boolean;busy:boolean;authReady:boolean;emailEnabled:boolean;registrationEnabled?:boolean;passwordRecoveryEnabled?:boolean;requireVerification:boolean;notice:string;recovery?:ReactNode;mfa?:ReactNode;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onToggleRegister:()=>void;onRecovery:(kind:'reset'|'verify')=>void;onToggleLanguage:()=>void};
export function WebAuthScreen({language,register,busy,authReady,emailEnabled,registrationEnabled=false,passwordRecoveryEnabled=false,requireVerification,notice,recovery,mfa,onSubmit,onToggleRegister,onRecovery,onToggleLanguage}:Props){
 register=register&&registrationEnabled;
 const en=language==='en';
 return <main className="web-auth"><div className="web-auth-layout">
  <div className="web-auth-brand"><img src={saviaMark} alt="" width="36" height="36"/><span>Savia <small>Licitaciones</small></span></div>
  <section className="web-auth-card" aria-label={en?'Account access':'Acceso a la cuenta'}>
   {recovery||mfa||<><header className="web-auth-heading"><h1>{register?(en?'Create your account':'Crea tu cuenta'):(en?'Welcome back':'Bienvenido de nuevo')}</h1><p>{register?(en?'Start organizing your tenders in Savia.':'Empieza a organizar tus licitaciones en Savia.'):(en?'Sign in to continue to your workspace.':'Inicia sesión para continuar en tu espacio de trabajo.')}</p></header>
    {notice&&<p className="web-auth-notice" role="status">{notice}</p>}
    <form onSubmit={onSubmit} className="web-auth-form">
     {register&&<label htmlFor="auth-name">{en?'Name':'Nombre'}<Input id="auth-name" name="name" required autoComplete="name" placeholder={en?'Your name':'Tu nombre'}/></label>}
     <label htmlFor="auth-email">{en?'Email':'Correo electrónico'}<Input id="auth-email" name="email" type="email" required autoComplete="email" placeholder="nombre@empresa.com"/></label>
     <div className="web-auth-field"><div className="web-auth-field-heading"><label htmlFor="auth-password">{en?'Password':'Contraseña'}</label>{emailEnabled&&passwordRecoveryEnabled&&!register&&<button className="web-auth-inline-link" type="button" onClick={()=>onRecovery('reset')}>{en?'Forgot your password?':'¿Olvidaste tu contraseña?'}</button>}</div><Input id="auth-password" name="password" type="password" required minLength={8} maxLength={128} autoComplete={register?'new-password':'current-password'}/></div>
     <Button type="submit" className="web-auth-submit" disabled={busy||(register&&!authReady)}>{busy?(en?'Please wait…':'Un momento…'):register?(en?'Create account':'Crear cuenta'):(en?'Sign in':'Iniciar sesión')}</Button>
    </form>
    {registrationEnabled&&<p className="web-auth-switch">{register?(en?'Already have an account?':'¿Ya tienes cuenta?'):(en?'Don’t have an account?':'¿No tienes cuenta?')} <button className="web-auth-inline-link" type="button" onClick={onToggleRegister}>{register?(en?'Sign in':'Inicia sesión'):(en?'Create account':'Crear cuenta')}</button></p>}
    {requireVerification&&!register&&<p className="web-auth-verification"><button className="web-auth-inline-link" type="button" onClick={()=>onRecovery('verify')}>{en?'Resend verification email':'Reenviar verificación de correo'}</button></p>}
   </>}
  </section>
  <div className="web-auth-footer"><button className="web-auth-language" type="button" onClick={onToggleLanguage} aria-label={en?'Cambiar idioma a español':'Change language to English'}>{en?'Español':'English'}</button></div>
 </div></main>;
}
