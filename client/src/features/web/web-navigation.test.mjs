import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readNavigation,navigationSearch} from './web-navigation.mjs';
test('project and wizard links round-trip safely',()=>{const route={view:'projects',project:'a b/ñ',tab:'prepare',step:4,opportunity:'search'};assert.deepEqual(readNavigation(navigationSearch(route)),route);});
test('unknown or incomplete routes use safe defaults',()=>{assert.deepEqual(readNavigation('?view=unknown&tab=invalid&step=bad'),{view:'projects',project:'',tab:'documents',step:null,opportunity:'search'});assert.equal(navigationSearch({view:'secop',project:'id',tab:'prepare',step:3,opportunity:'suggestions'}),'?view=secop&opportunity=suggestions');});

test('tracking links return to the selected project',()=>{const route={view:'projects',project:'project-1',tab:'tracking',step:null,opportunity:'search'};assert.deepEqual(readNavigation(navigationSearch(route)),route);});
test('project feasibility links preserve the selected project',()=>{const route={view:'projects',project:'project-1',tab:'feasibility',step:null,opportunity:'search'};assert.deepEqual(readNavigation(navigationSearch(route)),route);});
