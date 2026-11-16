export function authErrorMessage(error,language,stage){
 const en=language==='en',status=error?.status;
 if(status===429)return en?'Too many attempts. Wait a moment and try again.':'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
 if(stage==='session' && status===401)return en?'The session could not be started. Check that cookies are enabled and try again.':'No se pudo iniciar la sesión. Comprueba que las cookies estén habilitadas e inténtalo de nuevo.';
 if(stage==='mfa' && (status===400||status===401))return en?'The verification code is invalid or has expired.':'El código de verificación no es válido o ha expirado.';
 if(stage==='signin' && (status===400||status===401))return en?'Check your email or password and try again.':'Revisa el correo o la contraseña e inténtalo de nuevo.';
 if(!status || status>=500)return en?'Could not connect to Savia. Try again in a moment.':'No se pudo conectar con Savia. Inténtalo de nuevo en un momento.';
 return en?'Could not complete the request. Check the details and try again.':'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.';
}
