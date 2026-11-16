#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {homedir,hostname} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';

export function supportedNode(version){const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);return !!match&&(Number(match[1])>22||(Number(match[1])===22&&Number(match[2])>=13));}

export async function runGuidedLauncher({configured,ask,write,execute}) {
 if (!configured) {
  write('Conecta este equipo desde Savia web. Genera un código de conexión de un solo uso.\n');
  const server=(await ask('Dirección de Savia (https://…): ')).trim();
  const name=(await ask(`Nombre de este equipo [${hostname()}]: `)).trim()||hostname();
  const code=(await ask('Código de conexión: ')).trim();
  if (!server||!code) {write('Faltan la dirección o el código de conexión.\n');return 1;}
  const paired=await execute(['pair','--server',server,'--name',name],`${code}\n`);
  if(paired!==0){write('No se conectó el equipo. Comprueba los datos y vuelve a intentarlo.\n');return paired||1;}
 }
 write('Iniciando el runner local. Mantén esta ventana abierta; usa Ctrl+C para detenerlo.\n');
 return execute(['run']);
}

async function main(){
 if(!supportedNode(process.versions.node)){process.stderr.write('Se requiere Node.js 22.13 o posterior.\n');return 1;}
 const config=join(homedir(),'.savia','runner.json');let configured=true;try{await access(config);}catch(error){if(error.code==='ENOENT')configured=false;else throw error;}
 const readline=configured?null:createInterface({input:process.stdin,output:process.stdout});
 const cli=join(dirname(fileURLToPath(import.meta.url)),'cli.mjs');
 const execute=(args,input)=>new Promise((resolveChild,reject)=>{
  readline?.close();const child=spawn(process.execPath,[cli,...args],{stdio:[input===undefined?'inherit':'pipe','inherit','inherit'],shell:false});
  child.once('error',reject);child.once('exit',(code,signal)=>resolveChild(code??(signal?1:0)));if(input!==undefined){child.stdin.on('error',error=>{if(error.code!=='EPIPE')reject(error);});child.stdin.end(input);}
 });
 try{return await runGuidedLauncher({configured,ask:prompt=>readline.question(prompt),write:value=>process.stdout.write(value),execute});}finally{readline?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(()=>{process.stderr.write('No se pudo iniciar el runner. Comprueba Node.js y vuelve a intentarlo.\n');process.exitCode=1;});
