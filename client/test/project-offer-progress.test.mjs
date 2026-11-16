import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectOfferProgress} from '../src/features/web/project-offer-progress.mjs';

test('orienta con el avance interno sin confundirlo con SECOP',()=>{
 assert.deepEqual(projectOfferProgress({fileCount:0}),{stage:'empty',next:'documents'});
 assert.deepEqual(projectOfferProgress({fileCount:2}),{stage:'documents',next:'prepare'});
 assert.deepEqual(projectOfferProgress({fileCount:2,hasPreparation:1}),{stage:'preparation',next:'prepare'});
 assert.deepEqual(projectOfferProgress({fileCount:2,hasDraft:1}),{stage:'draft',next:'prepare'});
 assert.deepEqual(projectOfferProgress({fileCount:2,hasReviewedWord:1}),{stage:'word',next:'submit'});
 assert.deepEqual(projectOfferProgress({fileCount:2,hasSubmission:1}),{stage:'submitted',next:'after'});
 assert.deepEqual(projectOfferProgress({fileCount:2,hasSubmission:1,latestResult:'awarded'}),{stage:'awarded',next:'after'});
 assert.deepEqual(projectOfferProgress({fileCount:2,hasSubmission:1,latestResult:'not_awarded'}),{stage:'not-awarded',next:'after'});
});
