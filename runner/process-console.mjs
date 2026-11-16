import { StringDecoder } from 'node:string_decoder';
// The connector protocol writes through the original stdout handle, outside this tap.
export function captureProcessConsole(report, streams = { stdout: process.stdout, stderr: process.stderr }) {
 const restore=[];
 for(const [name,stream] of Object.entries(streams)){
  const original=stream.write, decoder=new StringDecoder('utf8');let pending='';
  const emit=text=>{if(text)report({event:`process.${name}`,text});};
  stream.write=function(chunk,encoding,callback){
   pending+=typeof chunk==='string'?chunk:decoder.write(chunk);
   let end;while((end=pending.indexOf('\n'))>=0){emit(pending.slice(0,end));pending=pending.slice(end+1);}
   // Keep an unusually long line bounded; task console applies its own chunking.
   if(pending.length>1_000_000){emit(pending);pending='';}
   const done=typeof encoding==='function'?encoding:callback;if(done)queueMicrotask(done);
   return true;
  };
  restore.push(()=>{stream.write=original;pending+=decoder.end();emit(pending);});
 }
 return ()=>{for(const restoreStream of restore)restoreStream();};
}
