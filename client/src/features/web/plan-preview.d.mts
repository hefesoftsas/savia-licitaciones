export type PlanAsset = { id: string; kind: 'url' | 'agent'; reference: string };
export type PreviewNode = { type: 'text'; value: string } | { type: 'image'; src: string; alt: string } | { type: 'missing'; alt: string } | { type: 'truncated' } | { type: 'element'; tag: string; children: PreviewNode[] };
export type LibraryImage = { id: string; missingReason: string | null; deleting: boolean };
export function buildPlanPreview(content: string, assets: PlanAsset[], projectId: string, library?: LibraryImage[]): PreviewNode[];
