import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recognizeScannedPdf } from '../local-ocr.mjs';
import { extractTenderSources } from '../tender-chat.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
test('local OCR reads a scanned PDF with bundled language data', {timeout:90000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),'ocr-test-'));
 try {
  const {PDFDocument}=require('pdf-lib'),{createCanvas}=require('@napi-rs/canvas');
  const canvas=createCanvas(1200,400),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1200,400);context.fillStyle='black';context.font='42px Arial';context.fillText('CONTRATO DE SERVICIOS',60,100);context.fillText('Plazo: doce meses. Valor: 15000000.',60,180);
  const pdf=await PDFDocument.create(),image=await pdf.embedPng(canvas.toBuffer('image/png'));pdf.addPage([600,200]).drawImage(image,{x:0,y:0,width:600,height:200});const bytes=await pdf.save();await writeFile(join(root,'scan.pdf'),bytes);
  const stages=[],activity=[],consoleEvents=[];const text=await recognizeScannedPdf(join(root,'scan.pdf'),{reportConsole:event=>consoleEvents.push(event),reportActivity:(code,details)=>activity.push({code,details}),reportProgress:stage=>stages.push(stage)});assert.match(text,/CONTRATO DE SERVICIOS/i);assert.match(text,/doce meses/i);assert.match(text,/15000000/);assert.ok(stages.includes('ocr'));assert.deepEqual(activity,[{code:'ocr.page',details:{page:1,totalPages:1}}]);assert.ok(consoleEvents.some(e=>e.event==='ocr.engine'&&e.status==='recognizing text'));assert.ok(consoleEvents.some(e=>e.event==='ocr.render'&&e.width>0));assert.ok(consoleEvents.some(e=>e.event==='ocr.recognized'&&e.text.includes('doce meses')&&typeof e.confidence==='number'));assert.ok(consoleEvents.some(e=>e.event==='ocr.page.complete'&&e.elapsedMs>0));
  const sources=await extractTenderSources(['scan'],{getFileInfo:async()=>({name:'scan.pdf',contentType:'application/pdf',bytes})},{isPackaged:false,getPath:()=>root},{},root,false);assert.match(sources[0].content,/doce meses/i);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('local OCR respects cancellation before starting',async()=>{const abort=new AbortController();abort.abort();await assert.rejects(recognizeScannedPdf('unused.pdf',{signal:abort.signal}),{name:'AbortError'});});
test('OCR failure is preserved as a document extraction failure',async()=>{const root=await mkdtemp(join(tmpdir(),'ocr-test-'));try{await assert.rejects(extractTenderSources(['scan'],{getFileInfo:async()=>({name:'scan.pdf',contentType:'application/pdf',bytes:Buffer.from('%PDF-1.7')})},{},{},root,false,{parse:async()=>{throw Object.assign(new Error(),{code:'pdf_text_layer_missing'});},ocr:async()=>{throw new Error('OCR fixture failed');}}),/OCR fixture failed/);}finally{await rm(root,{recursive:true,force:true});}});
