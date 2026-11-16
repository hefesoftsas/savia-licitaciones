import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isWaitingForAnswer} from './pending-question-state.mjs';

test('only the running task that owns a pending question waits for an answer',()=>{
 const questions=[{id:'q1',jobId:'job-1'}];
 assert.equal(isWaitingForAnswer({id:'job-1',state:'running'},questions),true);
 assert.equal(isWaitingForAnswer({id:'job-2',state:'running'},questions),false);
 assert.equal(isWaitingForAnswer({id:'job-1',state:'succeeded'},questions),false);
 assert.equal(isWaitingForAnswer({id:'job-1',state:'running'},[]),false);
});
