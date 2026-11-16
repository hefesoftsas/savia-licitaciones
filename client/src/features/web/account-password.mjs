import {request} from './api.mjs';
export async function changeAccountPassword({currentPassword,newPassword,confirmPassword,revokeOtherSessions},send=request){
 if(typeof currentPassword!=='string'||!currentPassword||typeof newPassword!=='string'||newPassword.length<8||newPassword.length>128)throw new Error('password_invalid');
 if(newPassword!==confirmPassword)throw new Error('password_mismatch');
 if(newPassword===currentPassword)throw new Error('password_unchanged');
 await send('/api/auth/change-password',{method:'POST',json:{currentPassword,newPassword,revokeOtherSessions:!!revokeOtherSessions}});
}
