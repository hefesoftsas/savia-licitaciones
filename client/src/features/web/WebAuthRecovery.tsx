import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { request } from './api.mjs';

type Props = { language: 'es' | 'en'; onBack: () => void; verification?: boolean };
export default function WebAuthRecovery({language,onBack,verification=false}:Props) {
 const en=language==='en', [token,setToken]=useState(()=>new URLSearchParams(window.location.search).get('token') || ''), [invalid]=useState(()=>new URLSearchParams(window.location.search).has('error'));
 const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [failed,setFailed]=useState(false);
 useEffect(()=>{if(window.location.pathname==='/reset-password') window.history.replaceState(null,'','/');},[]);
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);setBusy(true);setFailed(false);setMessage('');void (async()=>{
  try {
   if(token){const password=String(data.get('password')||'');if(password!==data.get('confirm'))throw new Error('confirmation');await request('/api/auth/reset-password',{method:'POST',json:{token,newPassword:password}});setToken('');setMessage(en?'Password changed. You can sign in now.':'Contraseña actualizada. Ya puedes iniciar sesión.');}
   else if(verification) {await request('/api/auth/send-verification-email',{method:'POST',json:{email:data.get('email'),callbackURL:'/'}});setMessage(en?'If the account needs verification, a link will arrive by email.':'Si la cuenta necesita verificación, recibirás un enlace por correo.');}
   else {await request('/api/auth/request-password-reset',{method:'POST',json:{email:data.get('email'),redirectTo:'/reset-password'}});setMessage(en?'If the account exists, a recovery link will arrive by email.':'Si la cuenta existe, recibirás un enlace de recuperación por correo.');}
   form.reset();
  } catch {setFailed(true);} finally {setBusy(false);}
 })();};
 return <><h1>{token?(en?'Choose a new password':'Elige una contraseña nueva'):(verification?(en?'Verify your email':'Verifica tu correo'):(en?'Recover password':'Recuperar contraseña'))}</h1>{invalid && !token && <p role="alert">{en?'The link is invalid or expired. Request another one.':'El enlace no es válido o ha caducado. Solicita uno nuevo.'}</p>}{message && <p role="status">{message}</p>}{failed && <p role="alert">{token?(en?'Check that the passwords match and the link is still valid.':'Comprueba que las contraseñas coincidan y que el enlace siga vigente.'):(en?'Could not request the link. Try again.':'No se pudo solicitar el enlace. Inténtalo de nuevo.')}</p>}<form onSubmit={submit} className="web-stack">{token?<><label>{en?'New password':'Nueva contraseña'}<Input name="password" type="password" minLength={8} required autoComplete="new-password" /></label><label>{en?'Confirm password':'Confirmar contraseña'}<Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></label></>:<label>{en?'Email':'Correo electrónico'}<Input name="email" type="email" autoComplete="email" required /></label>}<Button type="submit" disabled={busy}>{token?(en?'Change password':'Cambiar contraseña'):(en?'Send link':'Enviar enlace')}</Button></form><p><button className="web-link" type="button" onClick={onBack}>{en?'Back to sign in':'Volver a iniciar sesión'}</button></p></>;
}
