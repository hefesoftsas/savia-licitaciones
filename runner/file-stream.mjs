import {createWriteStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {TaskInputError} from './task-errors.mjs';
export async function saveSourceFile(file,path,{signal,maxBytes=1024*1024*1024,language='es'}={}){
 let size=0;const tooLarge=()=>new TaskInputError(language==='en'?'The document exceeds the size limit.':'El documento supera el tamaño permitido.');
 if(file.body){const counter=new Transform({transform(chunk,_encoding,done){size+=chunk.length;if(size>maxBytes){done(tooLarge());return;}done(null,chunk);}});await pipeline(Readable.fromWeb(file.body),counter,createWriteStream(path,{flags:'wx',mode:0o600}),...(signal?[{signal}]:[]));}
 else{const bytes=Buffer.from(file.bytes||[]);size=bytes.length;if(size>maxBytes)throw tooLarge();await writeFile(path,bytes,{mode:0o600,flag:'wx'});}
 return size;
}
