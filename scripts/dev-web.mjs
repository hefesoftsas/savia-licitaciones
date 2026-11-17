import {createServer, request} from 'node:http';
import {connect} from 'node:net';
import {spawn} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {rootCertificates} from 'node:tls';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const state=process.env.SAVIA_WEB_STATE_DIR || join(homedir(),'Library','Application Support','Savia Web Preview','state');
const children=[];
function start(label,cwd,args,env=process.env){const child=spawn('pnpm',args,{cwd,stdio:'inherit',env});children.push(child);child.once('exit',(code,signal)=>{if(!stopping){console.error(`${label} terminó (${signal||code}).`);shutdown(1);}});return child;}

function localWorkerEnv() {
 const fingerprint = '55:41:53:B1:3D:2C:F9:DD:B7:53:BF:BE:1A:4E:0A:E0:8D:0A:A4:18:70:58:FE:60:A2:B8:62:B2:E4:B8:7B:CB';
 // Local Workerd has its own root list. Add the public FNMT-RCM root bundled with Node for PLACSP.
 const placspRoot = rootCertificates.find(pem => new X509Certificate(pem).fingerprint256 === fingerprint);
 if (!placspRoot) return process.env;
 const bundle = [placspRoot];
 if (process.env.NODE_EXTRA_CA_CERTS) {
  try {
   bundle.push(readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8'));
  } catch (error) {
   console.warn(`No se pudieron leer los certificados adicionales: ${error.message}`);
  }
 }
 const folder = mkdtempSync(join(tmpdir(), 'savia-worker-ca-'));
 const file = join(folder, 'ca.pem');
 process.once('exit', () => rmSync(folder, {recursive:true, force:true}));
 writeFileSync(file, bundle.join('\n') + '\n', {mode:0o600});
 return {...process.env, NODE_EXTRA_CA_CERTS:file};
}
let stopping=false;
function shutdown(code=0){if(stopping)return;stopping=true;server.close();for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
const server=createServer((req,res)=>{
 const target=req.url==='/api'||req.url.startsWith('/api/')?8789:5174;
 const upstream=request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'text/plain; charset=utf-8'});res.end('El servidor de desarrollo está iniciando.');});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{const upstream=connect(req.url?.startsWith('/api/')?8789:5174,'127.0.0.1',()=>{upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.reduce((out,value,index)=>out+(index%2?`${value}\r\n`:`${value}: `),'')}\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
server.on('error',error=>{console.error(`No se pudo iniciar Savia: ${error.message}`);shutdown(1);});
server.listen(8788,'127.0.0.1',()=>{start('API',join(root,'web-api'),['exec','wrangler','dev','--local','--ip','127.0.0.1','--port','8789','--config','wrangler.web.local.jsonc','--persist-to',state],localWorkerEnv());start('Vite',join(root,'client'),['exec','vite','--config','vite.web.config.ts','--host','127.0.0.1','--port','5174','--strictPort']);console.log('Savia web: http://127.0.0.1:8788');});
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
