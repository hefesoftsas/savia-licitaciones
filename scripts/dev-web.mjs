import {createServer, request} from 'node:http';
import {connect} from 'node:net';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const state=process.env.SAVIA_WEB_STATE_DIR || join(homedir(),'Library','Application Support','Savia Web Preview','state');
const children=[];
function start(label,cwd,args){const child=spawn('pnpm',args,{cwd,stdio:'inherit',env:process.env});children.push(child);child.once('exit',(code,signal)=>{if(!stopping){console.error(`${label} terminó (${signal||code}).`);shutdown(1);}});return child;}
let stopping=false;
function shutdown(code=0){if(stopping)return;stopping=true;server.close();for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
const server=createServer((req,res)=>{
 const target=req.url==='/api'||req.url.startsWith('/api/')?8789:5174;
 const upstream=request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'text/plain; charset=utf-8'});res.end('El servidor de desarrollo está iniciando.');});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{const upstream=connect(req.url?.startsWith('/api/')?8789:5174,'127.0.0.1',()=>{upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.reduce((out,value,index)=>out+(index%2?`${value}\r\n`:`${value}: `),'')}\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
server.on('error',error=>{console.error(`No se pudo iniciar Savia: ${error.message}`);shutdown(1);});
server.listen(8788,'127.0.0.1',()=>{start('API',join(root,'web-api'),['exec','wrangler','dev','--local','--ip','127.0.0.1','--port','8789','--config','wrangler.web.local.jsonc','--persist-to',state]);start('Vite',join(root,'client'),['exec','vite','--config','vite.web.config.ts','--host','127.0.0.1','--port','5174','--strictPort']);console.log('Savia web: http://127.0.0.1:8788');});
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
