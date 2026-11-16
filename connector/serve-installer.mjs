// Local preview only: serves exactly one installer, never a directory listing.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
const args=process.argv.slice(2),fileIndex=args.indexOf('--file'),portIndex=args.indexOf('--port');
if(fileIndex<0||!args[fileIndex+1])throw new Error('Indica --file con el instalador generado.');
const file=resolve(args[fileIndex+1]),name=basename(file),size=(await stat(file)).size;
if(!/^[a-zA-Z0-9._-]+\.(dmg|exe)$/.test(name))throw new Error('Nombre de instalador inválido.');
const port=portIndex<0?8789:Number(args[portIndex+1]);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Puerto inválido.');
const server=createServer((request,response)=>{
 if(request.url!==`/${name}`||!['GET','HEAD'].includes(request.method)){response.writeHead(404);response.end();return;}
 response.writeHead(200,{'content-type':'application/octet-stream','content-length':size,'content-disposition':`attachment; filename="${name}"`,'x-content-type-options':'nosniff','cache-control':'no-store'});
 if(request.method==='HEAD'){response.end();return;}
 const stream=createReadStream(file);stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
});
server.listen(port,'127.0.0.1',()=>console.log(`Descarga local: http://127.0.0.1:${port}/${name}`));
