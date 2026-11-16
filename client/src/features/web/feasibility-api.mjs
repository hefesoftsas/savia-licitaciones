const legacyBase = '/api/feasibility-report';

/** Scope every feasibility operation to the selected project; unrelated APIs remain unchanged. */
export function feasibilityUrl(projectId, url = legacyBase) {
 if (!projectId || typeof projectId !== 'string') throw new TypeError('A project is required for a project feasibility report.');
 if (typeof url !== 'string' || (url !== legacyBase && !url.startsWith(`${legacyBase}/`) && !url.startsWith(`${legacyBase}?`))) {
  throw new TypeError('Expected a feasibility API path.');
 }
 return `/api/projects/${encodeURIComponent(projectId)}/feasibility-report${url.slice(legacyBase.length)}`;
}
