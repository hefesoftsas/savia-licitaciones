import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readNavigation,navigationSearch} from './web-navigation.mjs';
test('autopilot is only a mode of the offer preparation tab', () => {
 for (const tab of ['documents','chat','tracking','reviews','feasibility','history','prepare']) {
  const route = readNavigation(`?view=projects&project=p&tab=${tab}&mode=autopilot`);
  assert.equal(route.tab, tab);
  assert.equal(route.projectMode, tab === 'prepare' ? 'autopilot' : 'detailed', tab);
  const query = new URLSearchParams(navigationSearch({...route,projectMode:'autopilot'}));
  assert.equal(query.has('mode'), tab === 'prepare', tab);
 }
});
test('preparation defaults to autopilot unless detailed is explicitly requested', () => {
 for (const tab of ['documents','chat','prepare','tracking','reviews','feasibility','history']) {
  const route = readNavigation(`?view=projects&project=p&tab=${tab}`);
  assert.equal(route.projectMode, tab === 'prepare' ? 'autopilot' : 'detailed', tab);
  assert.equal(route.tab, tab);
 }
 assert.equal(readNavigation('?view=projects&project=p&tab=prepare&mode=detailed').projectMode, 'detailed');
 assert.equal(readNavigation('?view=projects&project=p').projectMode, null);
});
test('autopilot and focused review destinations survive reload and browser history', () => {
 const route = {view:'projects',project:'p',tab:'prepare',step:2,opportunity:'search',projectMode:'autopilot',reviewFocus:null};
 assert.deepEqual(readNavigation(navigationSearch(route)), route);
 for (const focus of ['duplicates','rejection']) {
  const review = {...route,tab:'reviews',step:null,projectMode:'detailed',reviewFocus:focus};
  assert.deepEqual(readNavigation(navigationSearch(review)), review);
 }
 assert.equal(readNavigation('?view=projects&project=p&tab=chat&review=duplicates').reviewFocus,null);
});
test('project and wizard links round-trip safely',()=>{const route={view:'projects',projectMode:'detailed',reviewFocus:null,project:'a b/ñ',tab:'prepare',step:4,opportunity:'search'};assert.deepEqual(readNavigation(navigationSearch(route)),route);});
test('unknown or incomplete routes use safe defaults',()=>{assert.deepEqual(readNavigation('?view=unknown&tab=invalid&step=bad'),{view:'projects',project:'',tab:'documents',step:null,opportunity:'search',projectMode:null,reviewFocus:null});assert.equal(navigationSearch({view:'secop',project:'id',tab:'prepare',step:3,opportunity:'suggestions'}),'?view=secop&opportunity=suggestions');});

test('tracking links return to the selected project',()=>{const route={view:'projects',projectMode:'detailed',reviewFocus:null,project:'project-1',tab:'tracking',step:null,opportunity:'search'};assert.deepEqual(readNavigation(navigationSearch(route)),route);});
test('project feasibility links preserve the selected project',()=>{const route={view:'projects',projectMode:'detailed',reviewFocus:null,project:'project-1',tab:'feasibility',step:null,opportunity:'search'};assert.deepEqual(readNavigation(navigationSearch(route)),route);});
