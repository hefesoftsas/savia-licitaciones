import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flattenExpanded} from '../src/technical-outline.js';
const root={id:'efe6f68b-c909-4687-a0e2-b59c7fa0fff3',title:'Oferta económica',description:'Carta y precio',attr:'报价',content_mode:'ai-generate'};
test('confirmed leaf mode wins over desktop category defaults',()=>{
 const result=flattenExpanded([{...root,content_mode:'manual-fill'}],[root]);
 assert.equal(result[0].mode,'ai-generate');
 assert.equal(result[0].id,root.id);
});
test('mode recovery does not permit changes to selected chapter identity',()=>{
 assert.equal(flattenExpanded([{...root,title:'Otro capítulo'}],[root]),null);
 assert.equal(flattenExpanded([{...root,attr:'技术'}],[root]),null);
 assert.equal(flattenExpanded([{...root,content_mode:'unknown'}],[root]),null);
});
