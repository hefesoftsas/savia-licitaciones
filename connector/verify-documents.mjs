// Real document operations using only dependencies inside the shipped runner.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const bundle=resolve(process.argv[2]),require=createRequire(join(bundle,'client/package.json'));
const sharp=require('sharp');
const png=await sharp({create:{width:8,height:8,channels:3,background:'#ffffff'}}).png().toBuffer();
assert.equal((await sharp(png).metadata()).width,8);
const {Document,Packer,Paragraph}=require('docx');
const document=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Savia documento de prueba')]}]}));
const parsed=await require('mammoth').extractRawText({buffer:document});
assert.match(parsed.value,/Savia documento de prueba/);
const xlsx=require('xlsx'),workbook=xlsx.utils.book_new();xlsx.utils.book_append_sheet(workbook,xlsx.utils.aoa_to_sheet([['Savia',42]]),'Datos');
const sheet=xlsx.read(xlsx.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
assert.equal(sheet.Sheets.Datos.B1.v,42);
const {PDFDocument,StandardFonts}=require('pdf-lib'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage().drawText('Savia PDF de prueba',{x:50,y:700,font,size:12});
const {PDFParse}=require('pdf-parse'),reader=new PDFParse({data:await pdf.save()});
try{assert.match((await reader.getText()).text,/Savia PDF de prueba/);}finally{await reader.destroy();}
console.log('OK: packaged image processing, Word, Excel and PDF generation/parsing.');

// Verify offline OCR after PDF parsing: the readers use different PDF.js versions.
const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
const {tmpdir}=await import('node:os');
const {pathToFileURL}=await import('node:url');
const ocrDirectory=await mkdtemp(join(tmpdir(),'connector-ocr-'));
try {
 const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(1000,200),context=canvas.getContext('2d');
 context.fillStyle='white';context.fillRect(0,0,1000,200);context.fillStyle='black';context.font='40px Arial';context.fillText('SAVIA DOCUMENTO DE PRUEBA',30,100);
 const scan=await PDFDocument.create(),image=await scan.embedPng(canvas.toBuffer('image/png'));scan.addPage([500,100]).drawImage(image,{x:0,y:0,width:500,height:100});
 const path=join(ocrDirectory,'scan.pdf');await writeFile(path,await scan.save());
 const {recognizeScannedPdf}=await import(pathToFileURL(join(bundle,'runner/local-ocr.mjs')).href);
 assert.match(await recognizeScannedPdf(path),/SAVIA DOCUMENTO DE PRUEBA/i);
 console.log('OK: packaged offline OCR with bundled language data.');
} finally {await rm(ocrDirectory,{recursive:true,force:true});}
