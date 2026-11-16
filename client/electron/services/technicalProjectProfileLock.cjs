'use strict';
const fs=require('node:fs');
const path=require('node:path');
function acquireProjectProfileLock({root,Database,fileName='project-profile-lock.sqlite'}) {
  fs.mkdirSync(root,{recursive:true});
  const db=new Database(path.join(root,fileName));
  try {
    db.exec('PRAGMA busy_timeout=0');
    db.exec('BEGIN EXCLUSIVE');
  } catch(error) {
    db.close();
    if(/locked|busy/i.test(error.message))throw new Error('Este perfil ya está abierto en otra instancia de la aplicación. Cierra la otra ventana antes de continuar.');
    throw error;
  }
  let closed=false;
  return {close(){if(closed)return;closed=true;db.exec('ROLLBACK');db.close();}};
}
module.exports={acquireProjectProfileLock};
