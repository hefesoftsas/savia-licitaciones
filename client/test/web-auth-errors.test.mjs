import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authErrorMessage} from '../src/features/web/auth-errors.mjs';
test('explica el fallo de acceso según la respuesta y la etapa',()=>{
 assert.match(authErrorMessage({status:401},'es','signin'),/correo o la contraseña/i);
 assert.match(authErrorMessage({status:429},'es','signin'),/demasiados intentos/i);
 assert.match(authErrorMessage({status:401},'es','session'),/sesión/i);
 assert.match(authErrorMessage({},'es','signin'),/conectar/i);
 assert.match(authErrorMessage({status:401},'en','signin'),/email or password/i);
});
