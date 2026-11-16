import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feasibilityUrl} from '../../client/src/features/web/feasibility-api.mjs';

test('project feasibility routes cannot silently use account-scoped paths', () => {
 assert.equal(feasibilityUrl('project-1'), '/api/projects/project-1/feasibility-report');
 assert.equal(feasibilityUrl('project-2','/api/feasibility-report/uploads'), '/api/projects/project-2/feasibility-report/uploads');
 assert.equal(feasibilityUrl('id with spaces','/api/feasibility-report/exports/abc/artifact?download=1'), '/api/projects/id%20with%20spaces/feasibility-report/exports/abc/artifact?download=1');
 assert.throws(() => feasibilityUrl('','/api/feasibility-report'));
 assert.throws(() => feasibilityUrl('project-1','/api/feasibility-reports'));
 assert.throws(() => feasibilityUrl('project-1','https://example.test/api/feasibility-report'));
});
