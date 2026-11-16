import {createRequire} from 'node:module';
import wordCount from '../client/electron/utils/wordCount.cjs';
import {planTechnicalWordAdjustment} from './technical-word-budget.mjs';
const require=createRequire(new URL('../client/package.json',import.meta.url));
const MarkdownIt=require('markdown-it');
const markdown=new MarkdownIt({html:true});

// Conservative lower bound: omit complete tables, HTML blocks, code and links.
// Those structures must survive a word adjustment unchanged.
export function countTechnicalEditableWords(content){
 if(typeof content!=='string')throw new TypeError('Expected chapter text.');
 const tokens=markdown.parse(content,{});let tableDepth=0,text='';
 for(const token of tokens){
  if(token.type==='table_open'){tableDepth++;continue;}
  if(token.type==='table_close'){tableDepth--;continue;}
  if(tableDepth||token.type!=='inline')continue;
  let linkDepth=0;
  for(const child of token.children||[]){
   if(child.type==='link_open'){linkDepth++;continue;}
   if(child.type==='link_close'){linkDepth--;continue;}
   if(linkDepth)continue;
   if(child.type==='text')text+=child.content;
   else if(child.type==='softbreak'||child.type==='hardbreak')text+=' ';
  }
  text+='\n';
 }
 return Math.min(wordCount.countReadableWords(content),wordCount.countReadableWords(text));
}

// Resolved destinations also catch changes to reference-style links, whose
// definitions can be far away from the visible link text.
export function technicalProtectedInlineSignature(content){
 const protectedTokens=[];
 for(const token of markdown.parse(content,{})){
  if(token.type!=='inline')continue;
  let link=null;
  for(const child of token.children||[]){
   if(child.type==='link_open'){link={href:child.attrGet('href'),title:child.attrGet('title'),children:[]};continue;}
   if(child.type==='link_close'){if(link)protectedTokens.push(['link',link]);link=null;continue;}
   if(link)link.children.push([child.type,child.content,child.markup,child.attrs]);
   else if(child.type==='code_inline')protectedTokens.push(['code',child.content,child.markup]);
   else if(child.type==='image')protectedTokens.push(['image',child.attrGet('src'),child.attrGet('title'),child.content]);
  }
 }
 return JSON.stringify(protectedTokens);
}

export function buildTechnicalWordAdjustment(payload,chapters){
 if(!Array.isArray(chapters))throw new TypeError('Expected chapters.');
 const measured=chapters.map(chapter=>({nodeId:chapter.id,wordCount:wordCount.countReadableWords(chapter.content),editableWords:countTechnicalEditableWords(chapter.content),targetWords:chapter.targetWords}));
 return planTechnicalWordAdjustment(payload,measured);
}
