import {test} from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('permite editar el formato básico en español e inglés conservando los valores guardados',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {ExportFormatForm}=await server.ssrLoadModule('/src/features/web/WebExportFormat.tsx'),{DEFAULT_EXPORT_FORMAT}=await server.ssrLoadModule('/src/shared/types/exportFormat.ts');const format={...DEFAULT_EXPORT_FORMAT,page:{...DEFAULT_EXPORT_FORMAT.page,paper_size:'letter',orientation:'landscape',header_text:'Cabecera guardada'}};const props={format,dirty:true,busy:false,onChange:()=>{},onSave:()=>{},onDiscard:()=>{}};const es=renderToStaticMarkup(React.createElement(ExportFormatForm,{...props,language:'es'}));assert.match(es,/Tamaño de papel/);assert.match(es,/Cabecera guardada/);assert.match(es,/Cambios sin guardar/);assert.match(es,/Guardar formato/);assert.match(es,/Estilos de títulos/);assert.match(es,/Nivel 6/);assert.match(es,/Texto del documento/);assert.match(es,/Numeración/);assert.match(es,/Estilo de tablas/);assert.match(es,/Fila de encabezado/);assert.match(es,/Estilo de imágenes/);assert.match(es,/Marco de títulos/);assert.match(es,/Opciones avanzadas de encabezado y pie/);const en=renderToStaticMarkup(React.createElement(ExportFormatForm,{...props,language:'en'}));assert.match(en,/Paper size/);assert.match(en,/Unsaved changes/);assert.match(en,/Save format/);assert.match(en,/Heading styles/);assert.match(en,/Level 6/);assert.match(en,/Document text/);assert.match(en,/Table style/);assert.match(en,/Header row/);assert.match(en,/Image style/);assert.match(en,/Heading frame/);assert.match(en,/Advanced header and footer/);}finally{await server.close();}
});

test('editar una celda de tabla conserva el resto de la configuración',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebExportTablesImages}=await server.ssrLoadModule('/src/features/web/WebExportTablesImages.tsx'),{DEFAULT_EXPORT_FORMAT}=await server.ssrLoadModule('/src/shared/types/exportFormat.ts');const format=structuredClone(DEFAULT_EXPORT_FORMAT);format.table.header_row.text_color='#123456';format.image.max_width_percent=77;let changed;const tree=WebExportTablesImages({language:'es',format,busy:false,onChange:value=>{changed=value;}});const nodes=[];function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(node.props){nodes.push(node);visit(node.props.children);}}visit(tree);const target=nodes.find(node=>node.props.value==='#123456'&&typeof node.props.onChange==='function');assert.ok(target);target.props.onChange({target:{value:'#abcdef'}});assert.equal(changed.table.header_row.text_color,'#abcdef');assert.equal(changed.image.max_width_percent,77);assert.deepEqual(changed.table.body_cell,format.table.body_cell);assert.equal(format.table.header_row.text_color,'#123456');}finally{await server.close();}
});

test('al elegir estilo de encabezado actualiza geometría sin perder texto ni otras secciones',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebExportAdvanced}=await server.ssrLoadModule('/src/features/web/WebExportAdvanced.tsx'),{DEFAULT_EXPORT_FORMAT}=await server.ssrLoadModule('/src/shared/types/exportFormat.ts');const format=structuredClone(DEFAULT_EXPORT_FORMAT);format.page.header_text='Empresa';format.image.max_width_percent=66;let changed;const tree=WebExportAdvanced({language:'es',format,busy:false,onChange:value=>{changed=value;}}),nodes=[];function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(node.props){nodes.push(node);visit(node.props.children);}}visit(tree);const selector=nodes.find(node=>node.type==='select'&&node.props.value==='plain');assert.ok(selector);selector.props.onChange({target:{value:'band'}});assert.equal(changed.page.header_footer_style,'band');assert.equal(changed.page.header_enabled,true);assert.equal(changed.page.page_number_enabled,true);assert.equal(changed.page.header_text,'Empresa');assert.equal(changed.image.max_width_percent,66);assert.notEqual(changed.page.header_chrome_height_cm,null);}finally{await server.close();}
});

test('presenta las plantillas guardadas y sus acciones en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {TemplateListView}=await server.ssrLoadModule('/src/features/web/WebExportTemplates.tsx');const item={id:'tpl',name:'Oferta Ñ',version:2,format:{},createdAt:'',updatedAt:''},props={templates:[item],disabled:false,onSelect:()=>{},onEdit:()=>{},onDelete:()=>{}};const es=renderToStaticMarkup(React.createElement(TemplateListView,{...props,language:'es'}));assert.match(es,/Oferta Ñ/);assert.match(es,/Usar formato/);assert.match(es,/Editar/);assert.match(es,/Eliminar/);const en=renderToStaticMarkup(React.createElement(TemplateListView,{...props,language:'en'}));assert.match(en,/Use format/);assert.match(en,/Edit/);assert.match(en,/Delete/);}finally{await server.close();}
});

test('presenta preajustes del sistema con acciones para usar y duplicar',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {SystemTemplateList}=await server.ssrLoadModule('/src/features/web/WebExportTemplates.tsx');const items=[{id:'tpl-system-a3-landscape-visual',format:{template_name:'A3 横版图文'}}];const props={templates:items,disabled:false,onSelect:()=>{},onCopy:()=>{}};const es=renderToStaticMarkup(React.createElement(SystemTemplateList,{...props,language:'es'}));assert.match(es,/A3 horizontal con gráficos/);assert.match(es,/Usar formato/);assert.match(es,/Duplicar/);const en=renderToStaticMarkup(React.createElement(SystemTemplateList,{...props,language:'en'}));assert.match(en,/A3 landscape visual/);assert.match(en,/Duplicate/);}finally{await server.close();}
});

test('selector de exportación ofrece formato de cuenta y plantillas por separado',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {ExportFormatPickerView}=await server.ssrLoadModule('/src/features/web/WebExportFormatPicker.tsx');const props={language:'es',value:'',disabled:false,templates:[{id:'own',name:'Mi formato',format:{}}],systemTemplates:[{id:'tpl-co-matrices',format:{template_name:'Colombia'}}],onChange:()=>{}};const html=renderToStaticMarkup(React.createElement(ExportFormatPickerView,props));assert.match(html,/Formato de la cuenta/);assert.match(html,/Mi formato/);assert.match(html,/Matrices horizontales/);assert.match(html,/Plantillas del sistema/);}finally{await server.close();}
});

test('filtra y etiqueta plantillas de España LCSP A4 y Colombia según el mercado activo',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {ExportFormatPickerView}=await server.ssrLoadModule('/src/features/web/WebExportFormatPicker.tsx');
  const {SystemTemplateList,DocumentTemplateList}=await server.ssrLoadModule('/src/features/web/WebExportTemplates.tsx');
  const systemTemplates=[
   {id:'tpl-co-matrices',format:{template_name:'Colombia'}},
   {id:'tpl-es-memoria-tecnica',format:{template_name:'España'}},
   {id:'tpl-system-a4-visual',format:{template_name:'A4 图文版'}},
  ];
  const docTemplates=[
   {id:'es-sobre-a-deuc',name:'Sobre A · DEUC',nameEn:'Envelope A · ESPD',summary:'Checklist LCSP',summaryEn:'LCSP checklist',source:'https://boe.es',reviewedAt:'2026-11-17',html:'<h1>Sobre A</h1>',config:{},market:'ES'},
   {id:'co-presentacion',name:'Carta de presentación',nameEn:'Cover letter',summary:'SECOP',summaryEn:'SECOP',source:'https://colombiacompra.gov.co',reviewedAt:'2026-10-29',html:'<h1>Carta</h1>',config:{},market:'CO'},
  ];
  const esPicker=renderToStaticMarkup(React.createElement(ExportFormatPickerView,{language:'es',market:'ES',value:'',disabled:false,templates:[],systemTemplates,onChange:()=>{}}));
  assert.match(esPicker,/España · Memoria técnica LCSP \(A4\)/);
  assert.doesNotMatch(esPicker,/Colombia · Matrices horizontales/);
  const coPicker=renderToStaticMarkup(React.createElement(ExportFormatPickerView,{language:'es',market:'CO',value:'',disabled:false,templates:[],systemTemplates,onChange:()=>{}}));
  assert.match(coPicker,/Colombia · Matrices horizontales/);
  assert.doesNotMatch(coPicker,/España · Memoria técnica LCSP/);
  const allList=renderToStaticMarkup(React.createElement(SystemTemplateList,{language:'en',market:'ALL',templates:systemTemplates,disabled:false,onSelect:()=>{},onCopy:()=>{}}));
  assert.match(allList,/Spain · Technical proposal LCSP \(A4\)/);
  assert.match(allList,/Colombia · Landscape schedules/);
  const esDocs=renderToStaticMarkup(React.createElement(DocumentTemplateList,{language:'es',market:'ES',templates:docTemplates,disabled:false,onUseFormat:()=>{},onCopyFormat:()=>{},onPreview:()=>{}}));
  assert.match(esDocs,/Sobre A · DEUC/);
  assert.match(esDocs,/España · LCSP · A4/);
  assert.doesNotMatch(esDocs,/Carta de presentación/);
  const coDocs=renderToStaticMarkup(React.createElement(DocumentTemplateList,{language:'es',market:'CO',templates:docTemplates,disabled:false,onUseFormat:()=>{},onCopyFormat:()=>{},onPreview:()=>{}}));
  assert.match(coDocs,/Carta de presentación/);
  assert.doesNotMatch(coDocs,/Sobre A · DEUC/);
 }finally{await server.close();}
});
