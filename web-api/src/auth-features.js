export function authCapabilities(env) {
  const email = !!env.EMAIL && typeof env.EMAIL.send === 'function' && typeof env.AUTH_EMAIL_FROM === 'string' && !!env.AUTH_EMAIL_FROM.trim();
  return {email, registration: env.AUTH_ALLOW_REGISTRATION === 'true', passwordRecovery: env.AUTH_ALLOW_PASSWORD_RECOVERY === 'true' && email, requireVerification: env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true'};
}
export function disabledAuthFeature(pathname, env) {
  const path = pathname.replace(/\/+$/, '');
  const capabilities = authCapabilities(env);
  if (path === '/api/auth/sign-up/email' && !capabilities.registration) return true;
  return !capabilities.passwordRecovery && (path === '/api/auth/request-password-reset' || path === '/api/auth/forget-password' || path === '/api/auth/reset-password' || path.startsWith('/api/auth/reset-password/'));
}
