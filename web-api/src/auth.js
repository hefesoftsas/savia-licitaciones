import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { defaultAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';
const superadminAc=defaultAc.newRole(defaultStatements);
import { createAuthRateLimitStorage } from './auth-rate-limit.js';

export function createAuth(env) {
  const requireVerification = env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true';
  const mailConfigured = !!env.EMAIL && typeof env.EMAIL.send === 'function' && typeof env.AUTH_EMAIL_FROM === 'string' && !!env.AUTH_EMAIL_FROM.trim();
  if (requireVerification && !mailConfigured) throw new Error('La verificación requiere configurar el correo de cuenta.');
  const send = async (user, url, verification) => env.EMAIL.send({
    from: env.AUTH_EMAIL_FROM,
    to: user.email,
    subject: verification ? 'Verifica tu correo de Savia' : 'Recupera tu contraseña de Savia',
    text: verification ? `Para verificar tu correo, abre este enlace:\n\n${url}\n\nSi no creaste esta cuenta, ignora este mensaje.` : `Para cambiar tu contraseña, abre este enlace:\n\n${url}\n\nSi no solicitaste el cambio, ignora este mensaje.`,
  });
  return betterAuth({
    database: env.DB,
    plugins: [
      admin({adminRoles:['superadmin'],roles:{superadmin:superadminAc,user:userAc}}),
      twoFactor({
        issuer: 'Savia',
        ...(mailConfigured ? {
          otpOptions: {
            sendOTP: async ({ user, otp }) => env.EMAIL.send({
              from: env.AUTH_EMAIL_FROM,
              to: user.email,
              subject: 'Tu código de verificación de Savia',
              text: `Tu código de verificación es: ${otp}\n\nSi no solicitaste este código, ignora este mensaje.`,
            }),
          },
        } : {}),
      }),
    ],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: { enabled: true, customStorage: createAuthRateLimitStorage(env), customRules: { '/sign-in/email': { window: 10, max: 5 }, '/change-password': { window: 10, max: 10 }, '/two-factor/verify-totp': { window: 10, max: 5 }, '/two-factor/verify-backup-code': { window: 10, max: 5 }, '/two-factor/verify-otp': { window: 10, max: 5 } } },
    emailAndPassword: { enabled: true, requireEmailVerification: requireVerification, revokeSessionsOnPasswordReset: true, ...(mailConfigured ? {sendResetPassword: async ({user,url}) => send(user,url,false)} : {}) },
    ...(mailConfigured ? {emailVerification: {sendOnSignUp: requireVerification, sendVerificationEmail: async ({user,url}) => send(user,url,true)}} : {}),
  });
}
