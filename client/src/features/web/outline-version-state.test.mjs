import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proposalForOutline} from './outline-version-state.mjs';
test('descartar la propuesta más reciente no reactiva intentos anteriores',()=>{
 const old={id:'old',state:'succeeded'},latest={id:'new',state:'succeeded',discarded:true};
 assert.equal(proposalForOutline([latest,old],[],true),undefined);
 assert.equal(proposalForOutline([{...latest,discarded:false},old],[],true).id,'new');
 assert.equal(proposalForOutline([old],[{selectionJobId:'old',appliedVersion:2}],true),undefined);
 assert.equal(proposalForOutline([old],[],false).id,'old');
});
