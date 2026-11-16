import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from '../../../brand.json' with {type:'json'};
import restoration from '../../../electron/services/originalPlanRestoration.cjs';

test('Savia asset URLs remain valid restoration references',()=>{
  for(const scheme of [legacy.assetScheme]) {
    const url=`${scheme}://imported-images/batch/image.png`;
    assert.equal(restoration.originalImageReferences(`![Ejemplo](${url})`).length,1);
  }
});
