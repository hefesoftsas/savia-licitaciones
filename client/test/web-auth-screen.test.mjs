import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('presenta acceso y registro con controles reales en español e inglés',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebAuthScreen}=await server.ssrLoadModule('/src/features/web/WebAuthScreen.tsx');const props={language:'es',register:false,busy:false,authReady:true,emailEnabled:true,registrationEnabled:true,passwordRecoveryEnabled:true,requireVerification:true,notice:'',onSubmit(){},onToggleRegister(){},onRecovery(){},onToggleLanguage(){}};const render=extra=>renderToStaticMarkup(React.createElement(WebAuthScreen,{...props,...extra}));const login=render({});assert.match(login,/Bienvenido de nuevo/);assert.match(login,/name="email"/);assert.match(login,/name="password"/);assert.match(login,/current-password/);assert.match(login,/Olvidaste tu contraseña/);assert.match(login,/Reenviar verificación/);assert.doesNotMatch(login,/name="name"|Google|Apple/);const closed=render({registrationEnabled:false,passwordRecoveryEnabled:false});assert.doesNotMatch(closed,/Crear cuenta|Olvidaste tu contraseña|Tu espacio para licitaciones/);const signup=render({register:true});assert.match(signup,/Crear cuenta/);assert.match(signup,/name="name"/);assert.match(signup,/new-password/);assert.doesNotMatch(signup,/Olvidaste tu contraseña/);const en=render({language:'en',emailEnabled:false,requireVerification:false});assert.match(en,/Welcome back/);assert.match(en,/Sign in/);assert.doesNotMatch(en,/Forgot your password/);const recovery=render({recovery:React.createElement('div',null,'Recuperar contraseña')});assert.match(recovery,/Recuperar contraseña/);assert.doesNotMatch(recovery,/name="email"/);const waiting=render({register:true,authReady:false});assert.match(waiting,/disabled/);}finally{await server.close();}
});
