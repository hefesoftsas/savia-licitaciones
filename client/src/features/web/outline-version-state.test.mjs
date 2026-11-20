import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as state from './outline-version-state.mjs';
const {proposalForOutline} = state;
test('descartar la propuesta más reciente no reactiva intentos anteriores',()=>{
 const old={id:'old',state:'succeeded'},latest={id:'new',state:'succeeded',discarded:true};
 assert.equal(proposalForOutline([latest,old],[],true),undefined);
 assert.equal(proposalForOutline([{...latest,discarded:false},old],[],true).id,'new');
 assert.equal(proposalForOutline([old],[{selectionJobId:'old',appliedVersion:2}],true),undefined);
 assert.equal(proposalForOutline([old],[],false).id,'old');
});

test('revisar capítulos confirmados no reabre la edición automáticamente', () => {
 const proposal = {id:'new',state:'succeeded',stale:false,result:{outline:[{id:'chapter'}]}};
 const current = {jobId:proposal.id,current:true};
 assert.equal(state.needsOutlineReview(proposal, current), false);
 assert.equal(state.needsOutlineReview(proposal, null), true);
 assert.equal(state.needsOutlineReview(proposal, {...current,jobId:'older'}), true);
 assert.equal(state.needsOutlineReview({...proposal,stale:true}, null), false);
});
