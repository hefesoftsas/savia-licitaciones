import {openEvaluationSource,EvaluationSnapshotError} from './project-evaluation-transport.js';
import { openProjectSnapshotSource, openProjectSnapshotFile, openProjectSnapshotAsset, ProjectSnapshotError } from './project-snapshot-source.js';
import { openReferencedKnowledge } from './project-knowledge-transport.js';
import { openComparisonSource, ComparisonSnapshotError } from './project-comparison-transport.js';
import { KnowledgeSnapshotError } from './project-knowledge-snapshot.js';
import { openPlanLibraryImage, LibrarySnapshotError } from './project-library-images.js';

// This is a partial component transfer, not an account backup or restore API.
export async function runnerProjectCapture(request, env, runner, projectId, fileId, kind='files') {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  try {
    if (fileId) {
      const params = new URL(request.url).searchParams;
      const open = kind === 'evaluations' ? openEvaluationSource : kind === 'comparisons' ? openComparisonSource : kind === 'library' ? openPlanLibraryImage : kind === 'knowledge' ? openReferencedKnowledge : kind === 'assets' ? openProjectSnapshotAsset : openProjectSnapshotFile;
      const body = await open(env,runner.ownerId,projectId,fileId,params.get('etag'),params.get('version'));
      return body ? new Response(body, { headers:{ 'content-type':'application/octet-stream', 'x-content-type-options':'nosniff' } }) : Response.json({ error:'not_found' }, { status:404 });
    }
    const source = await openProjectSnapshotSource(env, runner.ownerId, projectId);
    if (!source) return Response.json({ error:'not_found' }, { status:404 });
    await source.assertUnchanged();
    return Response.json({ complete:false, included:['project-header','project-files','project-workflow','technical-plan-nodes','plan-assets','project-knowledge','plan-library-images','project-context','project-chat','project-secop','project-offer','project-blind-profile','project-comparisons','project-evaluations','project-opportunity-tracking','project-requirement-supports'], omitted:['other-project-data','other-account-data','credentials'], revision:source.revision, project:source.project, files:source.files, assets:source.assets, knowledge:source.knowledge, libraryImages:source.libraryImages, workflow:source.workflow, technicalPlan:source.technicalPlan, context:source.context, chat:source.chat, secop:source.secop, offer:source.offer, blindProfile:source.blindProfile, rejectionDraft:source.rejectionDraft, addenda:source.addenda, comparisons:source.comparisons, evaluations:source.evaluations, opportunityTracking:source.opportunityTracking, requirementSupports:source.requirementSupports });
  } catch (error) {
    if (error instanceof KnowledgeSnapshotError || error instanceof LibrarySnapshotError || error instanceof ComparisonSnapshotError || error instanceof EvaluationSnapshotError) return Response.json({error:'source_unavailable'},{status:409});
    if (!(error instanceof ProjectSnapshotError)) throw error;
    return Response.json({ error:error.code === 'missing' ? 'stored_data_missing' : 'capture_changed' }, { status:error.code === 'missing' ? 503 : 409 });
  }
}
