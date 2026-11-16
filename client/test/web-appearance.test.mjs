import {test} from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';import {readFile} from 'node:fs/promises';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const luminance=hex=>{const channels=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];};
test('ofrece modos claro, oscuro y de sistema en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebAppearance}=await server.ssrLoadModule('/src/features/web/WebAppearance.tsx');const render=language=>renderToStaticMarkup(React.createElement(WebAppearance,{language,theme:'system',colorTheme:'neutral',visualStyle:'vega',busy:false,onChange(){},onColorChange(){},onStyleChange(){}}));assert.match(render('es'),/Claro/);assert.match(render('es'),/Oscuro/);assert.match(render('es'),/Sistema/);assert.match(render('en'),/Light/);assert.match(render('en'),/Dark/);assert.match(render('en'),/System/);assert.match(render('es'),/Azul/);assert.match(render('en'),/Violet/);assert.match(render('es'),/Nova/);assert.match(render('en'),/Mira/);}finally{await server.close();}
});
test('la paleta oscura conserva contraste para texto principal, secundario y enlaces',async()=>{
 const css=await readFile(resolve(root,'src/features/web/web.css'),'utf8'),block=css.match(/\.dark \.web-shell[^{}]*\{([^}]*)\}/)?.[1];assert.ok(block);
 const value=name=>{const match=block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`,'i'));assert.ok(match,name);return luminance(match[1]);};
 const bg=value('web-bg');for(const name of ['web-text','web-muted','web-link']){const fg=value(name),ratio=(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);assert.ok(ratio>=4.5,`${name}: ${ratio}`);}
 for(const [textName,bgName] of [['web-active-text','web-active-bg'],['web-warning-text','web-warning-bg'],['web-muted','web-subtle-bg']]){const fg=value(textName),background=value(bgName),ratio=(Math.max(fg,background)+0.05)/(Math.min(fg,background)+0.05);assert.ok(ratio>=4.5,`${textName}/${bgName}: ${ratio}`);}
});
test('el modo sistema sigue cambios del dispositivo y retira el listener',async()=>{
 const {bindWebTheme}=await import('../src/features/web/web-theme.mjs');let listener,removed=false;const classes=new Set(),root={classList:{toggle:(name,enabled)=>enabled?classes.add(name):classes.delete(name)},dataset:{},style:{}},media={matches:false,addEventListener:(name,fn)=>{assert.equal(name,'change');listener=fn;},removeEventListener:(name,fn)=>{assert.equal(fn,listener);removed=true;}};
 const cleanup=bindWebTheme('system',root,media);assert.equal(root.dataset.theme,'light');media.matches=true;listener();assert.equal(root.dataset.theme,'dark');assert.equal(classes.has('dark'),true);assert.equal(root.style.colorScheme,'dark');cleanup();assert.equal(removed,true);
 const fixed=bindWebTheme('light',root,media);assert.equal(root.dataset.theme,'light');media.matches=true;listener();assert.equal(root.dataset.theme,'light');fixed();
});

test('los acentos de navegación conservan contraste en ambos modos',async()=>{
 const css=await readFile(resolve(root,'src/styles/blocks.css'),'utf8');
 const rgb=hex=>hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16));
 const toHex=channels=>'#'+channels.map(x=>Math.round(x).toString(16).padStart(2,'0')).join('');
 for(const dark of [false,true])for(const color of ['blue','green','violet','rose']){
  const selector=dark?`:root.dark[data-color-theme='${color}']`:`:root[data-color-theme='${color}']`;
  const line=css.split('\n').find(value=>value.startsWith(selector+' '));assert.ok(line,selector);const fg=line.match(/--primary:\s*(#[a-f0-9]{6})/i)?.[1];assert.ok(fg);
  const base=rgb(dark?'141a17':'ffffff'),foreground=rgb(fg),background=toHex(foreground.map((value,index)=>value*0.05+base[index]*0.95));
  const a=luminance(fg),b=luminance(background),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);assert.ok(ratio>=4.5,`${selector}: ${ratio}`);
 }
});
