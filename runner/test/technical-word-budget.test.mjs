import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessTechnicalWordBudget} from '../technical-word-budget.mjs';
const payload={mode:'missing',targets:['a','b'],existingWords:200,planningOptions:{minimumWords:800,maximumWords:1200}};
test('evalúa solo cuando todos los borradores están disponibles',()=>{
 assert.deepEqual(assessTechnicalWordBudget(payload,[{nodeId:'a',wordCount:300}]),{status:'incomplete',totalWords:500,minimumWords:800,maximumWords:1200,missingChapters:1});
 assert.deepEqual(assessTechnicalWordBudget(payload,[{nodeId:'a',wordCount:300},{nodeId:'b',wordCount:100}]),{status:'below',totalWords:600,minimumWords:800,maximumWords:1200,missingChapters:0});
 assert.equal(assessTechnicalWordBudget(payload,[{nodeId:'a',wordCount:300},{nodeId:'b',wordCount:500}]).status,'within');
 assert.equal(assessTechnicalWordBudget(payload,[{nodeId:'a',wordCount:600},{nodeId:'b',wordCount:500}]).status,'above');
});
test('conserva compatibilidad con tareas previas y ausencia de límites',()=>{
 assert.equal(assessTechnicalWordBudget({...payload,existingWords:undefined},[]),null);
 assert.equal(assessTechnicalWordBudget({...payload,planningOptions:{minimumWords:0,maximumWords:0}},[]),null);
 assert.equal(assessTechnicalWordBudget({...payload,mode:'all',existingWords:undefined},[{nodeId:'a',wordCount:500},{nodeId:'b',wordCount:500}]).status,'within');
 assert.throws(()=>assessTechnicalWordBudget(payload,[{nodeId:'a',wordCount:1},{nodeId:'a',wordCount:1}]));
});

test('planifica el ajuste del texto editable sin tocar capítulos conservados',async()=>{
 const {planTechnicalWordAdjustment}=await import('../technical-word-budget.mjs');
 const chapters=[{nodeId:'a',wordCount:200,editableWords:200,targetWords:500},{nodeId:'b',wordCount:300,editableWords:300,targetWords:500}];
 assert.deepEqual(planTechnicalWordAdjustment(payload,chapters),{direction:'expand',totalWords:700,goal:816,shortfall:0,jobs:[{nodeId:'a',fromWords:200,targetWords:316}]});
 assert.equal(planTechnicalWordAdjustment(payload,[chapters[0]]),null);
 assert.equal(planTechnicalWordAdjustment(payload,[{...chapters[0],wordCount:300},{...chapters[1],wordCount:500}]),null);
});
test('señala lo que no puede ajustar y respeta el límite de texto editable',async()=>{
 const {planTechnicalWordAdjustment}=await import('../technical-word-budget.mjs');
 const chapters=[{nodeId:'a',wordCount:1500,editableWords:500,targetWords:500},{nodeId:'b',wordCount:500,editableWords:100,targetWords:500}],result=planTechnicalWordAdjustment({...payload,existingWords:0},chapters);
 assert.equal(result.direction,'shrink');assert.equal(result.goal,1176);assert.equal(result.shortfall,624);assert.deepEqual(result.jobs,[{nodeId:'a',fromWords:1500,targetWords:1300}]);
 assert.throws(()=>planTechnicalWordAdjustment(payload,[{...chapters[0],editableWords:1501},chapters[1]]));
});
