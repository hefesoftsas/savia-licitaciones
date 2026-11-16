import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authCapabilities,disabledAuthFeature} from '../src/auth-features.js';
test('registro y recuperación requieren activación explícita',()=>{
 const mail={EMAIL:{send(){}},AUTH_EMAIL_FROM:'account@example.test'};
 assert.equal(authCapabilities(mail).registration,false);
 assert.equal(authCapabilities(mail).passwordRecovery,false);
 for(const path of ['/api/auth/sign-up/email','/api/auth/sign-up/email/','/api/auth/request-password-reset','/api/auth/reset-password','/api/auth/reset-password/token'])assert.equal(disabledAuthFeature(path,mail),true);
 assert.equal(disabledAuthFeature('/api/auth/sign-in/email',mail),false);
 assert.equal(disabledAuthFeature('/api/auth/change-password',mail),false);
 const enabled={...mail,AUTH_ALLOW_REGISTRATION:'true',AUTH_ALLOW_PASSWORD_RECOVERY:'true'};
 assert.equal(disabledAuthFeature('/api/auth/sign-up/email',enabled),false);
 assert.equal(disabledAuthFeature('/api/auth/request-password-reset',enabled),false);
 assert.equal(authCapabilities({AUTH_ALLOW_PASSWORD_RECOVERY:'true'}).passwordRecovery,false);
});
