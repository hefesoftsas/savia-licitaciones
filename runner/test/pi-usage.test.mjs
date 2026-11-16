import {test} from 'node:test';import assert from 'node:assert/strict';import {createPiUsageCollector} from '../pi-usage.mjs';
test('suma solo consumos válidos e identifica llamadas no informadas',()=>{
 const collector=createPiUsageCollector();
 collector.add({input:10,output:4,cacheRead:3,cacheWrite:2,totalTokens:19});
 collector.add({input:7,output:2,cacheRead:0,cacheWrite:0,totalTokens:9});
 collector.add({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0});
 collector.add({input:-1,output:2,cacheRead:0,cacheWrite:0,totalTokens:1});
 assert.deepEqual(collector.snapshot(),{input:17,output:6,cacheRead:3,cacheWrite:2,reportedCalls:2,unreportedCalls:2});
});
