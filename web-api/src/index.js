import {wordFormatPreview} from './word-format-preview.js';
import {agendaLayout} from './agenda-layout.js';
import {ensureUserTenant} from './tenant-scope.js';
import {tenantAdmin} from './tenant-admin.js';
import {projectSelectFeasibilitySources} from './project-feasibility-selection.js';
import {readJobActivity} from './job-activity.js';
import {projectSelection} from './project-selection.js';
import {runnerDownloads} from './runner-downloads.js';
import {navigationPreferences} from './navigation-preferences.js';
import {authCapabilities, disabledAuthFeature} from './auth-features.js';
import {importDesktopAddenda,projectAddenda} from './desktop-addendum-import.js';
import {bootstrapSuperadmin} from './superadmin-bootstrap.js';
import {listProjectDeletions} from './project-delete.js';
import {runnerExperienceCapture} from './account-experience-capture.js';
import {runnerPaaCapture} from './account-paa-capture.js';
import {runnerKnowledgeCapture} from './account-knowledge-capture.js';
import {runnerExportFormatCapture} from './account-export-format-capture.js';
import {feasibilitySnapshotImport,feasibilitySnapshotCommit,feasibilitySnapshotDiscard} from './account-feasibility-restore.js';
import {runnerFeasibilityCapture} from './account-feasibility-capture.js';
import {runnerCertificatesCapture} from './account-certificates-capture.js';
import {runnerRupCapture} from './account-rup-capture.js';
import {runnerImageLibraryCapture} from './account-image-library-capture.js';
import { runnerPreferencesSnapshot } from './account-preferences-recovery.js';
import {runnerTechnicalBatch,runnerTechnicalBatchPlans,runnerTechnicalBatchConsistency,runnerTechnicalBatchLedger,runnerTechnicalBatchSection,runnerTechnicalBatchWordAdjustment,runnerTechnicalBatchWordPlan,userTechnicalBatch} from './technical-batch.js';
import { runnerProjectCapture } from './project-capture-route.js';
import { runnerBlindCapture } from './project-blind-capture.js';
import { runnerReviewCapture } from './project-review-capture.js';
import { restoreKnowledgeIndex } from './knowledge-index-restore.js';
import { checkSecopAvailability, restoreSecopLinks } from './secop-restore-links.js';
import {userExportTemplates,importDesktopExportTemplate} from './export-templates.js';
import {importDesktopExportFormat} from './desktop-export-format.js';
import {exportFormat} from './export-format.js';
import {agendaReminders} from './agenda-reminders.js';
import {handleAccountRunnerQuestions,handleAccountUserQuestions} from './account-job-questions.js';
import {userFeasibilityContent,runnerFeasibilityContent} from './feasibility-content.js';
import {userFeasibilityParameters,runnerFeasibilityParametersContext} from './feasibility-parameters.js';
import {userFeasibilityOutlines,runnerFeasibilityOutlineContext} from './feasibility-outline.js';
import {userFeasibilityAnalysis,runnerFeasibilityAnalysis} from './feasibility-analysis.js';
import {projectFeasibilityAnalysis,runnerProjectFeasibilityAnalysis} from './project-feasibility-analysis.js';
import {projectFeasibilityContent,runnerProjectFeasibilityContent} from './project-feasibility-content.js';
import {projectFeasibilityExports,projectFeasibilityExportContext,projectUploadAccountArtifact,projectFeasibilityExportAsset} from './project-feasibility-export.js';
import {projectFeasibilityStructure,runnerProjectFeasibilityStructure} from './project-feasibility-structure.js';
import {userFeasibilityExtractions,runnerFeasibilityOriginal,runnerFeasibilityExtractionCheck,uploadFeasibilityText,downloadFeasibilityText,uploadFeasibilityImage,downloadFeasibilityImage,listFeasibilityImages} from './feasibility-extraction.js';
import {uploadFeasibilitySource,selectFeasibilitySources,downloadWebFeasibilitySource,deleteWebFeasibilitySource} from './feasibility-web-sources.js';
import {importFeasibilityAsset,runnerFeasibilityAsset} from './feasibility-assets.js';
import {userFeasibilityExports,runnerFeasibilityContext,uploadAccountArtifact} from './feasibility-export.js';
import {importFeasibility,importFeasibilitySource,feasibilitySource} from './desktop-feasibility-import.js';
import { feasibilityReport } from './feasibility-report.js';
import { projectFeasibilityReport } from './project-feasibility-report.js';
import {projectFeasibilityUploads,projectFeasibilitySource} from './project-feasibility-sources.js';
import {projectFeasibilityExtractions,runnerProjectFeasibilityOriginal,runnerProjectFeasibilityExtractionCheck,uploadProjectFeasibilityText,uploadProjectFeasibilityImage,downloadProjectFeasibilityText,downloadProjectFeasibilityImage,listProjectFeasibilityImages} from './project-feasibility-extraction.js';
import { importDesktopBidEvaluation } from './desktop-bid-evaluation.js';
import { importDesktopBlindTask } from './desktop-blind-import.js';
import { desktopBlindLarge } from './desktop-blind-large.js';
import { importDesktopReviewTask } from './desktop-review-import.js';
import { bidEvaluation } from './bid-evaluation.js';
import { uploadRepairReport, downloadRepairReport } from './repair-reports.js';
import { blindProfile } from './blind-profile.js';
import { rejectionDraft } from './rejection-draft.js';
import { importDuplicateReview, importedDuplicateReview, importDuplicateFile, duplicateFile } from './desktop-duplicate-check.js';
import { removeRejectionFinding } from './rejection-findings.js';
import { importLibraryImage } from './desktop-image-library-import.js';
import { imageLibrary } from './image-library.js';
import { importSavedTender, importedSavedTender } from './desktop-saved-tenders.js';
import { importDesktopSecop } from './desktop-secop-import.js';
import { secopWatch } from './secop-watch.js';
import { importDesktopPaa } from './desktop-paa-import.js';
import { paaWatch } from './paa-watch.js';
import { importCertificateImage } from './desktop-certificate-image-import.js';
import { certificateImages } from './certificate-images.js';
import { importDesktopCertificate } from './desktop-certificate-import.js';
import { companyCertificates } from './company-certificates.js';
import { userAgenda } from './agenda.js';
import { importDesktopChat, importedDesktopChat } from './desktop-chat-import.js';
import { cleanupDesktopUploadsRequest } from './desktop-file-cleanup.js';
import { importDesktopFile } from './desktop-file-import.js';
import { desktopMultipart } from './desktop-multipart-import.js';
import { importDesktopPlan } from './desktop-plan-import.js';
import { knowledgeAnalysis, runnerKnowledgeSource } from './knowledge-analysis.js';
import { knowledgeLibrary } from './knowledge-library.js';
import { globalFacts } from './global-facts.js';
import { importDesktopFacts } from './desktop-fact-import.js';
import { importDesktopWorkflow } from './desktop-workflow-import.js';
import { importDesktopOffer } from './desktop-offer-import.js';
import { importDesktopBlindProfile } from './desktop-blind-profile-import.js';
import { importDesktopRejectionDraft } from './desktop-rejection-draft-import.js';
import { importDesktopRup } from './desktop-rup-import.js';
import { importDesktopComparison, importedComparisons } from './desktop-comparison-import.js';
import { importKnowledgeFolder, importKnowledgeDocument, importedKnowledgeItems } from './desktop-knowledge-import.js';
import { importDesktopAsset, downloadPlanAsset, runnerPlanAsset } from './desktop-asset-import.js';
import { importDesktopAnalyses } from './desktop-analysis-import.js';
import { templateValues } from './template-values.js';
import { runnerTemplate } from './runner-template.js';
import { technicalTemplate } from './technical-template.js';
import { technicalOutline } from './technical-outline.js';
import { technicalAnalysis } from './technical-analysis.js';
import { handleRunnerQuestions, handleUserQuestions } from './job-questions.js';
import { createAuth } from './auth.js';
import { handleProjects } from './projects.js';
import { authenticateRunner, handleRunnerAgent, handleRunnerUser } from './runners.js';
import { handleAdminRunnerConfig, handleRunnerFetchConfig } from './runner-config.js';
import {previewWakeStub} from './preview-wake.js';
export {PreviewWake} from './preview-wake.js';
import {runnerProjectInventory} from './project-inventory.js';
import { clearChatHistory, handleAgentJobs, handleUserJobs } from './jobs.js';
import { uploadSecopZipPart, commitSecopZipParts } from './secop-zip-parts.js';
import { companyProfile } from './company-profile.js';
import { runnerCompanyProfileCapture } from './account-company-profile-capture.js';
import { opportunitySuggestionSettings } from './opportunity-suggestion-settings.js';
import { opportunitySearch, opportunityJobs, opportunityResults, runnerOpportunityDue, runnerOpportunityContext } from './opportunity-candidates.js';
import { companyExperience } from './company-experience.js';
import { experienceImages } from './company-experience-images.js';
import { importDesktopCompanyExperience } from './desktop-company-experience.js';
import { importDesktopExperienceImage } from './desktop-company-experience-image.js';
import { profileImages } from './company-profile-images.js';
import { importDesktopCompanyProfile } from './desktop-company-profile.js';
import { importAccountCompanyProfileSnapshot } from './account-company-profile-restore.js';
import { importDesktopCompanyProfileImage } from './desktop-company-profile-image.js';
import { handleRunnerCredential, handleRunnerFile, handleUserCredentials } from './credentials.js';
import { handleEconomicOffer } from './economic-offer.js';
import { searchSecop, secopPreferences, secopCategories, secopDetail, secopDocumentCatalog, secopSelectedImports, createSecopProject, getProjectSecop, secopDocuments, marketSearch, syncPlacsp } from './secop.js';
import { workflow } from './workflow.js';
import { opportunityTracking } from './opportunity-tracking.js';
import {submissionTracking} from './submission-tracking.js';
import {submissionAttachments} from './submission-attachments.js';
import {submissionRecords} from './submission-records.js';
import {runnerSubmissionCapture} from './project-submission-capture.js';
import {importSubmissionTrackingItem} from './desktop-submission-tracking-import.js';
import {desktopSubmissionFileStage} from './desktop-submission-file-stage.js';
import {importSubmissionRecord} from './desktop-submission-record-import.js';
import {importSubmissionAttachment} from './desktop-submission-attachment-import.js';
import {importDesktopOfferDocuments} from './desktop-offer-documents-import.js';
import {runnerOfferDocumentsCapture} from './project-offer-documents-capture.js';
import {repairOfferDocument,replaceOfferDocument} from './project-offer-documents-repair.js';
import {createOfferDocument,removeOfferDocument} from './project-offer-document-create.js';
import {reviewOfferPackageItem} from './project-offer-package-review.js';
import {createOfferPackageItem} from './project-offer-package-create.js';
import {removeOfferPackageItem} from './project-offer-package-remove.js';
import {moveOfferPackageItem} from './project-offer-package-move.js';
import {repairOfferPackageItem} from './project-offer-package-repair.js';
import {offerSupportCandidates,createOfferSupportLink,removeOfferSupportLink,repairOfferSupportLink} from './project-offer-support-links.js';
import { requirementSupports } from './requirement-support.js';
import { preflight } from './preflight.js';
import { importDesktopRequirementSupports } from './desktop-requirement-support-import.js';
import { importDesktopOpportunityTracking } from './desktop-opportunity-tracking-import.js';
import { runnerRequirementContext, userRequirementSuggestions } from './requirement-suggestions.js';
import { rupComparison } from './rup-comparison.js';
import { rup } from './rup.js';
import { userAccountJobs, runnerRupSource } from './account-jobs.js';
import { technicalPlan, runnerPlanContext, runnerKnowledgeDocument } from './technical-plan.js';
import { uploadJobArtifact, downloadJobArtifact } from './job-artifacts.js';
import { wordRecovery } from './word-recovery.js';
import { wordFieldReview } from './word-field-review.js';
import { jobLargeArtifact } from './job-large-artifact.js';
import {withBackupGate} from './backup-gate.js';
export {BackupGate} from './backup-gate.js';

const SECURITY_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
];

function withSecurityHeaders(response) {
  if (!response || response.status === 101) return response;
  const result = new Response(response.body, response);
  for (const [name, value] of SECURITY_HEADERS) {
    if (!result.headers.has(name)) result.headers.set(name, value);
  }
  return result;
}

function privateResponse(response) {
  const result = new Response(response.body, response);
  result.headers.set('cache-control', 'no-store');
  return result;
}

const apiWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = createAuth(env);
    let scopedSession;
    const getScopedSession = async () => {
      if (scopedSession !== undefined) return scopedSession;
      const session = await auth.api.getSession({headers:request.headers});
      if (!session) return scopedSession = null;
      const tenant = await ensureUserTenant(env,session.user.id);
      return scopedSession = {...session, workspaceId:tenant.ownerId, tenant:{id:tenant.id,name:tenant.name}};
    };
    if(url.pathname.startsWith('/api/')){try{await bootstrapSuperadmin(env);}catch{return privateResponse(Response.json({error:'superadmin_bootstrap_failed'},{status:503}));}}
    if (url.pathname === '/api/admin/runner-config' || url.pathname.startsWith('/api/admin/runner-config/')) {
      const session = await getScopedSession();
      return privateResponse(await handleAdminRunnerConfig(request, env, session, url));
    }
    if (url.pathname.startsWith('/api/admin/')) {
      const session=await getScopedSession();
      return privateResponse(await tenantAdmin(request,env,session));
    }
    if (url.pathname === '/api/auth-capabilities' && request.method === 'GET') return privateResponse(Response.json(authCapabilities(env)));
    if (disabledAuthFeature(url.pathname, env)) return privateResponse(Response.json({error:'feature_disabled'},{status:403}));
    if (url.pathname.startsWith('/api/auth/')) return privateResponse(await auth.handler(request));
    if (env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true' && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/runner/')) {
      const existing = await getScopedSession();
      if (existing && !existing.user.emailVerified) return privateResponse(Response.json({ error: 'email_not_verified' }, { status: 403 }));
    }
    if(url.pathname==='/api/project-deletions'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await listProjectDeletions(request,env,session.workspaceId));}
    if (url.pathname === '/api/me' && request.method === 'GET') {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(Response.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role || 'user', twoFactorEnabled: Boolean(session.user.twoFactorEnabled), tenant:session.tenant } }));
    }
    if(url.pathname==='/api/runner-downloads'&&request.method==='GET'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(runnerDownloads(env,request.url));}
    if(url.pathname==='/api/project-selection'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectSelection(request,env,session.user.id,session.workspaceId));}
    if (url.pathname === '/api/runner/config') {
      return privateResponse(await handleRunnerFetchConfig(request, env));
    }
    if(url.pathname==='/api/runner/preview-wake'){
      const runner=await authenticateRunner(request,env);
      if(!runner)return Response.json({error:'unauthorized'},{status:401});
      const stub=previewWakeStub(env,runner.ownerId);
      return stub?stub.fetch(request):new Response('Unavailable',{status:503});
    }
    const wordPreview=/^\/api\/word-format-preview(?:\/([^/]+)(?:\/(cancel))?)?$/.exec(url.pathname);
    if(wordPreview){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await wordFormatPreview(request,env,session.workspaceId,wordPreview[1],wordPreview[2]));}
    if(url.pathname==='/api/agenda-layout'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await agendaLayout(request,env,session.user.id));}
    if(url.pathname==='/api/navigation-preferences'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await navigationPreferences(request,env,session.user.id));}
    if (url.pathname === '/api/preferences') {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT savia_language AS language, savia_theme AS theme, savia_color_theme AS colorTheme, savia_visual_style AS visualStyle, savia_market AS market FROM "user" WHERE id = ?').bind(session.user.id).first();
        return privateResponse(Response.json({ language: row?.language === 'en' ? 'en' : 'es', theme: ['light', 'dark', 'system'].includes(row?.theme) ? row.theme : 'system', colorTheme: ['neutral', 'blue', 'green', 'violet', 'rose'].includes(row?.colorTheme) ? row.colorTheme : 'neutral', visualStyle: ['vega', 'nova', 'maia', 'lyra', 'mira'].includes(row?.visualStyle) ? row.visualStyle : 'vega', market: ['CO', 'ES', 'ALL'].includes(row?.market) ? row.market : 'ALL' }));
      }
      if (request.method !== 'PUT') return privateResponse(new Response('Method not allowed', { status: 405 }));
      if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return privateResponse(Response.json({ error: 'invalid_origin' }, { status: 403 }));
      let input;
      try { input = await request.json(); } catch { return privateResponse(Response.json({ error: 'invalid_json' }, { status: 400 })); }
      if (!input || typeof input !== 'object' || Array.isArray(input) || (input.language === undefined && input.theme === undefined && input.colorTheme === undefined && input.visualStyle === undefined && input.market === undefined)) return privateResponse(Response.json({ error: 'invalid_preferences' }, { status: 400 }));
      if (input.language !== undefined && !['es', 'en'].includes(input.language)) return privateResponse(Response.json({ error: 'invalid_language' }, { status: 400 }));
      if (input.theme !== undefined && !['light', 'dark', 'system'].includes(input.theme)) return privateResponse(Response.json({ error: 'invalid_theme' }, { status: 400 }));
      if (input.colorTheme !== undefined && !['neutral', 'blue', 'green', 'violet', 'rose'].includes(input.colorTheme)) return privateResponse(Response.json({ error: 'invalid_color_theme' }, { status: 400 }));
      if (input.visualStyle !== undefined && !['vega', 'nova', 'maia', 'lyra', 'mira'].includes(input.visualStyle)) return privateResponse(Response.json({ error: 'invalid_visual_style' }, { status: 400 }));
      if (input.market !== undefined && !['CO', 'ES', 'ALL'].includes(input.market)) return privateResponse(Response.json({ error: 'invalid_market' }, { status: 400 }));
      const updated = await env.DB.prepare('UPDATE "user" SET savia_language = COALESCE(?, savia_language), savia_theme = COALESCE(?, savia_theme), savia_color_theme = COALESCE(?, savia_color_theme), savia_visual_style = COALESCE(?, savia_visual_style), savia_market = COALESCE(?, savia_market), savia_preferences_revision = savia_preferences_revision + 1 WHERE id = ? RETURNING savia_language AS language, savia_theme AS theme, savia_color_theme AS colorTheme, savia_visual_style AS visualStyle, savia_market AS market').bind(input.language ?? null, input.theme ?? null, input.colorTheme ?? null, input.visualStyle ?? null, input.market ?? null, session.user.id).first();
      return privateResponse(Response.json(updated));
    }
    if(url.pathname==='/api/runner/export-format-capture'){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerExportFormatCapture(request,env,runner));}
    if(url.pathname==='/api/runner/paa-capture'){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerPaaCapture(request,env,runner));}
    if (url.pathname === '/api/runner/preferences-snapshot') {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({error:'unauthorized'}, {status:401}));
      return privateResponse(await runnerPreferencesSnapshot(request, env, runner));
    }
    const submissionCapture=/^\/api\/runner\/project-submission-captures\/([^/]+)(?:\/(attachments|evidence)\/([^/]+))?$/.exec(url.pathname);
    if(submissionCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerSubmissionCapture(request,env,runner,submissionCapture[1],submissionCapture[2],submissionCapture[3]));}
    const reviewCapture = /^\/api\/runner\/project-review-captures\/([^/]+)(?:\/artifact\/([^/]+))?$/.exec(url.pathname);
    if(reviewCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerReviewCapture(request,env,runner,reviewCapture[1],reviewCapture[2]));}
    const blindCapture = /^\/api\/runner\/project-blind-captures\/([^/]+)(?:\/(artifact|report)\/([^/]+))?$/.exec(url.pathname);
    if (blindCapture) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error:'unauthorized' }, { status:401 }));
      return privateResponse(await runnerBlindCapture(request,env,runner,blindCapture[1],blindCapture[3],blindCapture[2]));
    }
    const companyProfileRestore = /^\/api\/runner\/imports\/company-profile-snapshots\/([^/]+)(?:\/images\/([^/]+))?$/.exec(url.pathname);
    if(companyProfileRestore){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await (companyProfileRestore[2]?importDesktopCompanyProfileImage(request,env,runner,companyProfileRestore[1],companyProfileRestore[2],true):importAccountCompanyProfileSnapshot(request,env,runner,companyProfileRestore[1])));}
    const companyProfileCapture = /^\/api\/runner\/company-profile-captures(?:\/images\/([^/]+))?$/.exec(url.pathname);
    if(companyProfileCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerCompanyProfileCapture(request,env,runner,companyProfileCapture[1]));}
    if(url.pathname==='/api/runner/project-inventory'){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerProjectInventory(request,env,runner));}
    const projectCapture = /^\/api\/runner\/project-captures\/([^/]+)(?:\/(files|assets|knowledge|library|comparisons|evaluations)\/([^/]+))?$/.exec(url.pathname);
    if (projectCapture) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error:'unauthorized' }, { status:401 }));
      return privateResponse(await runnerProjectCapture(request, env, runner, projectCapture[1], projectCapture[3], projectCapture[2]));
    }
    const knowledgeIndexRestore = /^\/api\/runner\/imports\/knowledge\/([^/]+)\/documents\/([^/]+)\/index$/.exec(url.pathname);
    if (knowledgeIndexRestore) {
      const runner = await authenticateRunner(request,env);
      if (!runner) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await restoreKnowledgeIndex(request,env,runner,knowledgeIndexRestore[1],knowledgeIndexRestore[2]));
    }
    if (url.pathname === '/api/runner/imports/technical-plan/secop-check') {
      const runner=await authenticateRunner(request,env);
      if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await checkSecopAvailability(request,env,runner));
    }
    const secopLinksRestore=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/secop-links$/.exec(url.pathname);
    if(secopLinksRestore){
      const runner=await authenticateRunner(request,env);
      if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await restoreSecopLinks(request,env,runner,secopLinksRestore[1]));
    }
    const feasibilityCapture=/^\/api\/runner\/feasibility-capture(?:\/objects\/(original|historical|asset|text|image)\/([^/]+))?$/.exec(url.pathname);
    if(feasibilityCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerFeasibilityCapture(request,env,runner,feasibilityCapture[1],feasibilityCapture[2]));}
    const feasibilitySnapshotDiscardRoute=/^\/api\/runner\/imports\/feasibility-snapshots\/([^/]+)\/discard$/.exec(url.pathname);
    if(feasibilitySnapshotDiscardRoute){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await feasibilitySnapshotDiscard(request,env,runner,feasibilitySnapshotDiscardRoute[1]));}
    const feasibilitySnapshotCommitRoute=/^\/api\/runner\/imports\/feasibility-snapshots\/([^/]+)\/commit$/.exec(url.pathname);
    if(feasibilitySnapshotCommitRoute){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await feasibilitySnapshotCommit(request,env,runner,feasibilitySnapshotCommitRoute[1]));}
    const feasibilitySnapshotImportRoute=/^\/api\/runner\/imports\/feasibility-snapshots\/([^/]+)(?:\/objects\/(original|historical|asset|text|image)\/([^/]+))?$/.exec(url.pathname);
    if(feasibilitySnapshotImportRoute){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await feasibilitySnapshotImport(request,env,runner,feasibilitySnapshotImportRoute[1],feasibilitySnapshotImportRoute[2],feasibilitySnapshotImportRoute[3]));}
    const desktopFeasibilityAsset=/^\/api\/runner\/imports\/feasibility\/([^/]+)\/assets\/([^/]+)$/.exec(url.pathname);
    if(desktopFeasibilityAsset){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importFeasibilityAsset(request,env,runner,desktopFeasibilityAsset[1],desktopFeasibilityAsset[2]));}
    const feasibilityAsset=/^\/api\/runner\/jobs\/([^/]+)\/feasibility-assets\/([^/]+)$/.exec(url.pathname);
    if(feasibilityAsset){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityAsset[1],runner.ownerId).first();return privateResponse(await (job?.project_id?projectFeasibilityExportAsset(request,env,runner,feasibilityAsset[1],feasibilityAsset[2]):runnerFeasibilityAsset(request,env,runner,feasibilityAsset[1],feasibilityAsset[2])));}
    const desktopFeasibility=/^\/api\/runner\/imports\/feasibility\/([^/]+)(?:\/sources\/([^/]+))?$/.exec(url.pathname);
    if(desktopFeasibility){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await (desktopFeasibility[2]?importFeasibilitySource(request,env,runner,desktopFeasibility[1],desktopFeasibility[2]):importFeasibility(request,env,runner,desktopFeasibility[1])));}
    if(['/api/feasibility-report/uploads','/api/feasibility-report/source-selection'].includes(url.pathname)){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await (url.pathname.endsWith('/uploads')?uploadFeasibilitySource(request,env,session.workspaceId):selectFeasibilitySources(request,env,session.workspaceId)));}
    const feasibilityFile=/^\/api\/feasibility-report\/sources\/([^/]+)$/.exec(url.pathname);
    if(feasibilityFile){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await deleteWebFeasibilitySource(request,env,session.workspaceId,feasibilityFile[1]) || await downloadWebFeasibilitySource(request,env,session.workspaceId,feasibilityFile[1]) || await feasibilitySource(request,env,session.workspaceId,feasibilityFile[1]));}
    const feasibilityContent=/^\/api\/feasibility-report\/content-jobs(?:\/([^/]+)\/(apply|cancel|resume|drafts))?$/.exec(url.pathname);
    if(feasibilityContent){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userFeasibilityContent(request,env,session.workspaceId,feasibilityContent[1],feasibilityContent[2]));}
    const feasibilityContentRunner=/^\/api\/runner\/jobs\/([^/]+)\/(?:feasibility-content-context|feasibility-content-(drafts|reviews)\/([^/]+))$/.exec(url.pathname);
    if(feasibilityContentRunner){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityContentRunner[1],runner.ownerId).first();return privateResponse(await (job?.project_id?runnerProjectFeasibilityContent(request,env,runner,feasibilityContentRunner[1],feasibilityContentRunner[3],feasibilityContentRunner[2]==='reviews'):runnerFeasibilityContent(request,env,runner,feasibilityContentRunner[1],feasibilityContentRunner[3],feasibilityContentRunner[2]==='reviews')));}
    const feasibilityParameters=/^\/api\/feasibility-report\/parameters(?:\/([^/]+)\/(apply|cancel))?$/.exec(url.pathname);
    if(feasibilityParameters){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userFeasibilityParameters(request,env,session.workspaceId,feasibilityParameters[1],feasibilityParameters[2]));}
    const feasibilityParametersRunner=/^\/api\/runner\/jobs\/([^/]+)\/feasibility-parameters-context$/.exec(url.pathname);
    if(feasibilityParametersRunner){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityParametersRunner[1],runner.ownerId).first();return privateResponse(await (job?.project_id?runnerProjectFeasibilityStructure(request,env,runner,feasibilityParametersRunner[1],'parameters'):runnerFeasibilityParametersContext(request,env,runner,feasibilityParametersRunner[1])));}
    const feasibilityOutlines=/^\/api\/feasibility-report\/outlines(?:\/([^/]+)\/(apply|cancel))?$/.exec(url.pathname);
    if(feasibilityOutlines){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userFeasibilityOutlines(request,env,session.workspaceId,feasibilityOutlines[1],feasibilityOutlines[2]));}
    const feasibilityOutlineRunner=/^\/api\/runner\/jobs\/([^/]+)\/feasibility-outline-context$/.exec(url.pathname);
    if(feasibilityOutlineRunner){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityOutlineRunner[1],runner.ownerId).first();return privateResponse(await (job?.project_id?runnerProjectFeasibilityStructure(request,env,runner,feasibilityOutlineRunner[1],'outline'):runnerFeasibilityOutlineContext(request,env,runner,feasibilityOutlineRunner[1])));}
    const feasibilityAnalyses=/^\/api\/feasibility-report\/analyses(?:\/([^/]+)\/(apply|cancel))?$/.exec(url.pathname);
    if(feasibilityAnalyses){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userFeasibilityAnalysis(request,env,session.workspaceId,feasibilityAnalyses[1],feasibilityAnalyses[2]));}
    const desktopExportTemplate=/^\/api\/runner\/imports\/export-templates\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if(desktopExportTemplate){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopExportTemplate(request,env,runner,desktopExportTemplate[1],desktopExportTemplate[2]));}
    const desktopExportFormat=/^\/api\/runner\/imports\/export-format\/([^/]+)$/.exec(url.pathname);
    if(desktopExportFormat){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopExportFormat(request,env,runner,desktopExportFormat[1]));}
    const opportunityRunner=/^\/api\/runner\/jobs\/([^/]+)\/opportunity-context$/.exec(url.pathname);
    if(opportunityRunner){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerOpportunityContext(request,env,runner,opportunityRunner[1]));}
    const feasibilityAnalysisRunner=/^\/api\/runner\/jobs\/([^/]+)\/feasibility-analysis(?:\/([^/]+))?$/.exec(url.pathname);
    if(feasibilityAnalysisRunner){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityAnalysisRunner[1],runner.ownerId).first();return privateResponse(await (job?.project_id?runnerProjectFeasibilityAnalysis(request,env,runner,feasibilityAnalysisRunner[1],feasibilityAnalysisRunner[2]):runnerFeasibilityAnalysis(request,env,runner,feasibilityAnalysisRunner[1],feasibilityAnalysisRunner[2])));}
    const extractedImage=/^\/api\/feasibility-report\/extractions\/images\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if(extractedImage){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await downloadFeasibilityImage(request,env,session.workspaceId,extractedImage[1],extractedImage[2],extractedImage[3]));}
    const runnerExtractedImage=/^\/api\/runner\/jobs\/([^/]+)\/feasibility-image\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if(runnerExtractedImage){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(runnerExtractedImage[1],runner.ownerId).first();return privateResponse(await (job?.project_id?uploadProjectFeasibilityImage(request,env,runner,runnerExtractedImage[1],runnerExtractedImage[2],runnerExtractedImage[3]):uploadFeasibilityImage(request,env,runner,runnerExtractedImage[1],runnerExtractedImage[2],runnerExtractedImage[3])));}
    const feasibilityExtractions=/^\/api\/feasibility-report\/extractions(?:\/([^/]+)\/cancel)?$/.exec(url.pathname);
    if(feasibilityExtractions){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userFeasibilityExtractions(request,env,session.workspaceId,feasibilityExtractions[1]));}
    const feasibilitySourceImages=/^\/api\/feasibility-report\/sources\/([^/]+)\/images$/.exec(url.pathname);
    if(feasibilitySourceImages){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await listFeasibilityImages(request,env,session.workspaceId,feasibilitySourceImages[1]));}
    const feasibilityText=/^\/api\/feasibility-report\/sources\/([^/]+)\/text$/.exec(url.pathname);
    if(feasibilityText){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await downloadFeasibilityText(request,env,session.workspaceId,feasibilityText[1]));}
    const feasibilityExtractFile=/^\/api\/runner\/jobs\/([^/]+)\/(feasibility-original|feasibility-text)\/([^/]+)$/.exec(url.pathname);
    if(feasibilityExtractFile){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityExtractFile[1],runner.ownerId).first();return privateResponse(await (job?.project_id?(feasibilityExtractFile[2]==='feasibility-original'?runnerProjectFeasibilityOriginal(request,env,runner,feasibilityExtractFile[1],feasibilityExtractFile[3]):uploadProjectFeasibilityText(request,env,runner,feasibilityExtractFile[1],feasibilityExtractFile[3])):(feasibilityExtractFile[2]==='feasibility-original'?runnerFeasibilityOriginal(request,env,runner,feasibilityExtractFile[1],feasibilityExtractFile[3]):uploadFeasibilityText(request,env,runner,feasibilityExtractFile[1],feasibilityExtractFile[3]))));}
    const feasibilityExtractCheck=/^\/api\/runner\/jobs\/([^/]+)\/feasibility-extraction-check$/.exec(url.pathname);
    if(feasibilityExtractCheck){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityExtractCheck[1],runner.ownerId).first();return privateResponse(await (job?.project_id?runnerProjectFeasibilityExtractionCheck(request,env,runner,feasibilityExtractCheck[1]):runnerFeasibilityExtractionCheck(request,env,runner,feasibilityExtractCheck[1])));}
    const feasibilityExports=/^\/api\/feasibility-report\/exports(?:\/([^/]+)\/(artifact|cancel))?$/.exec(url.pathname);
    if(feasibilityExports){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userFeasibilityExports(request,env,session.workspaceId,feasibilityExports[1],feasibilityExports[2]));}
    const feasibilityRunner=/^\/api\/runner\/jobs\/([^/]+)\/(feasibility-context|account-artifact)$/.exec(url.pathname);
    if(feasibilityRunner){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));const job=await env.DB.prepare('SELECT project_id FROM account_jobs WHERE id=? AND owner_id=?').bind(feasibilityRunner[1],runner.ownerId).first();return privateResponse(await (job?.project_id?(feasibilityRunner[2]==='feasibility-context'?projectFeasibilityExportContext(request,env,runner,feasibilityRunner[1]):projectUploadAccountArtifact(request,env,runner,feasibilityRunner[1])):(feasibilityRunner[2]==='feasibility-context'?runnerFeasibilityContext(request,env,runner,feasibilityRunner[1]):uploadAccountArtifact(request,env,runner,feasibilityRunner[1]))));}
    const projectFeasibilityContentRoute=/^\/api\/projects\/([^/]+)\/feasibility-report\/content-jobs(?:\/([^/]+)\/(apply|cancel|resume|drafts))?$/.exec(url.pathname);
    if(projectFeasibilityContentRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityContent(request,env,session.workspaceId,projectFeasibilityContentRoute[1],projectFeasibilityContentRoute[2],projectFeasibilityContentRoute[3]));}
    const projectFeasibilityExportsRoute=/^\/api\/projects\/([^/]+)\/feasibility-report\/exports(?:\/([^/]+)\/(artifact|cancel))?$/.exec(url.pathname);
    if(projectFeasibilityExportsRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityExports(request,env,session.workspaceId,projectFeasibilityExportsRoute[1],projectFeasibilityExportsRoute[2],projectFeasibilityExportsRoute[3]));}
    const projectFeasibilityOCR=/^\/api\/projects\/([^/]+)\/feasibility-report\/extractions(?:\/([^/]+)\/cancel)?$/.exec(url.pathname);
    if(projectFeasibilityOCR){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityExtractions(request,env,session.workspaceId,projectFeasibilityOCR[1],projectFeasibilityOCR[2]));}
    const projectFeasibilityImages=/^\/api\/projects\/([^/]+)\/feasibility-report\/extractions\/images\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if(projectFeasibilityImages){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await downloadProjectFeasibilityImage(request,env,session.workspaceId,projectFeasibilityImages[1],projectFeasibilityImages[2],projectFeasibilityImages[3],projectFeasibilityImages[4]));}
    const projectFeasibilitySourceContent=/^\/api\/projects\/([^/]+)\/feasibility-report\/sources\/([^/]+)\/(text|images)$/.exec(url.pathname);
    if(projectFeasibilitySourceContent){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await (projectFeasibilitySourceContent[3]==='text'?downloadProjectFeasibilityText(request,env,session.workspaceId,projectFeasibilitySourceContent[1],projectFeasibilitySourceContent[2]):listProjectFeasibilityImages(request,env,session.workspaceId,projectFeasibilitySourceContent[1],projectFeasibilitySourceContent[2])));}
    const projectFeasibilityQuestions=/^\/api\/projects\/([^/]+)\/feasibility-report\/questions(?:\/([^/]+)\/answer)?$/.exec(url.pathname);
    if(projectFeasibilityQuestions){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await handleAccountUserQuestions(request,env,session.workspaceId,projectFeasibilityQuestions[2],projectFeasibilityQuestions[1]));}
    const projectFeasibilityStructureRoute=/^\/api\/projects\/([^/]+)\/feasibility-report\/(outlines|parameters)(?:\/([^/]+)\/(apply|cancel))?$/.exec(url.pathname);
    if(projectFeasibilityStructureRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityStructure(request,env,session.workspaceId,projectFeasibilityStructureRoute[1],projectFeasibilityStructureRoute[3],projectFeasibilityStructureRoute[4],projectFeasibilityStructureRoute[2]==='outlines'?'outline':'parameters'));}
    const projectFeasibilityAnalyses=/^\/api\/projects\/([^/]+)\/feasibility-report\/analyses(?:\/([^/]+)\/(apply|cancel))?$/.exec(url.pathname);
    if(projectFeasibilityAnalyses){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityAnalysis(request,env,session.workspaceId,projectFeasibilityAnalyses[1],projectFeasibilityAnalyses[2],projectFeasibilityAnalyses[3]));}
    const projectFeasibilitySelection=/^\/api\/projects\/([^/]+)\/feasibility-report\/source-selection$/.exec(url.pathname);
    if(projectFeasibilitySelection){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectSelectFeasibilitySources(request,env,session.workspaceId,projectFeasibilitySelection[1]));}
    const projectFeasibilityUpload=/^\/api\/projects\/([^/]+)\/feasibility-report\/uploads$/.exec(url.pathname);
    if(projectFeasibilityUpload){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityUploads(request,env,session.workspaceId,projectFeasibilityUpload[1]));}
    const projectFeasibilityFile=/^\/api\/projects\/([^/]+)\/feasibility-report\/sources\/([^/]+)$/.exec(url.pathname);
    if(projectFeasibilityFile){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilitySource(request,env,session.workspaceId,projectFeasibilityFile[1],projectFeasibilityFile[2]));}
    const projectFeasibility=/^\/api\/projects\/([^/]+)\/feasibility-report$/.exec(url.pathname);
    if(projectFeasibility){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectFeasibilityReport(request,env,session.workspaceId,projectFeasibility[1]));}
    if (url.pathname === '/api/feasibility-report') {
      const session=await getScopedSession();
      if (!session) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await feasibilityReport(request,env,session.workspaceId));
    }
    if (url.pathname === '/api/runner/imports/cleanup') {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await cleanupDesktopUploadsRequest(request, env, runner));
    }
    const rupCapture=/^\/api\/runner\/rup-capture(?:\/(pdf))?$/.exec(url.pathname);
    if(rupCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerRupCapture(request,env,runner,rupCapture[1]));}
    const desktopRup = /^\/api\/runner\/imports\/rup\/([^/]+)$/.exec(url.pathname);
    if (desktopRup) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopRup(request, env, runner, desktopRup[1]));
    }
    const desktopKnowledge = /^\/api\/runner\/imports\/knowledge\/([^/]+)\/(folders|documents)\/([^/]+)$/.exec(url.pathname);
    if (desktopKnowledge) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await (desktopKnowledge[2] === 'folders' ? importKnowledgeFolder : importKnowledgeDocument)(request, env, runner, desktopKnowledge[1], desktopKnowledge[3]));
    }
    const importedKnowledge = /^\/api\/knowledge\/documents\/([^/]+)\/imported-items$/.exec(url.pathname);
    if (importedKnowledge) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importedKnowledgeItems(request, env, session.workspaceId, importedKnowledge[1]));
    }
    const jobPlanAsset = /^\/api\/runner\/jobs\/([^/]+)\/plan-assets\/([^/]+)$/.exec(url.pathname);
    if (jobPlanAsset) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerPlanAsset(request, env, runner, jobPlanAsset[1], jobPlanAsset[2]));
    }
    const desktopAddenda=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/addenda$/.exec(url.pathname);
    if(desktopAddenda){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopAddenda(request,env,runner,desktopAddenda[1]));}
    const projectAddendaPath=/^\/api\/projects\/([^/]+)\/addenda$/.exec(url.pathname);
    if(projectAddendaPath){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await projectAddenda(request,env,session.workspaceId,projectAddendaPath[1]));}
    const desktopAsset = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/assets\/([^/]+)$/.exec(url.pathname);
    if (desktopAsset) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopAsset(request, env, runner, desktopAsset[1], desktopAsset[2]));
    }
    const desktopComparison = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/rup-comparisons\/([^/]+)$/.exec(url.pathname);
    if (desktopComparison) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopComparison(request, env, runner, desktopComparison[1], desktopComparison[2]));
    }
    const importedRup = /^\/api\/projects\/([^/]+)\/imported-rup-comparisons(?:\/([^/]+)\/pdf)?$/.exec(url.pathname);
    if (importedRup) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importedComparisons(request, env, session.workspaceId, importedRup[1], importedRup[2]));
    }
    const planAsset = /^\/api\/projects\/([^/]+)\/plan-assets(?:\/([^/]+))?$/.exec(url.pathname);
    if (planAsset) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await downloadPlanAsset(request, env, session.workspaceId, planAsset[1], planAsset[2]));
    }
    const savedTenderImport = /^\/api\/runner\/imports\/saved-tenders\/([^/]+)$/.exec(url.pathname);
    if(savedTenderImport){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importSavedTender(request,env,runner,savedTenderImport[1]));}
    const savedTenderView = /^\/api\/projects\/([^/]+)\/imported-saved-tender$/.exec(url.pathname);
    if(savedTenderView){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importedSavedTender(request,env,session.workspaceId,savedTenderView[1]));}
    const desktopSecop = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/secop$/.exec(url.pathname);
    if (desktopSecop) {
      const runner = await authenticateRunner(request,env);
      if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await importDesktopSecop(request,env,runner,desktopSecop[1]));
    }
    const rejectionImport=/^\/api\/runner\/imports\/rejection-check\/([^/]+)$/.exec(url.pathname);
    if(rejectionImport){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDuplicateReview(request,env,runner,rejectionImport[1],'rejection'));}
    const rejectionUpload=/^\/api\/runner\/imports\/rejection-check-files\/([^/]+)\/([a-f0-9]{64})\/(original|content)$/.exec(url.pathname);
    if(rejectionUpload){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDuplicateFile(request,env,runner,rejectionUpload[1],rejectionUpload[2],rejectionUpload[3],false,'rejection'));}
    const rejectionDownload=/^\/api\/imported-rejection-checks\/([^/]+)\/files\/([a-f0-9]{64})\/(original|content)$/.exec(url.pathname);
    if(rejectionDownload){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await (request.method==='PUT'?importDuplicateFile(request,env,{ownerId:session.workspaceId},rejectionDownload[1],rejectionDownload[2],rejectionDownload[3],true,'rejection'):duplicateFile(request,env,session.workspaceId,rejectionDownload[1],rejectionDownload[2],rejectionDownload[3],'rejection')));}
    const rejectionView=/^\/api\/imported-rejection-checks(?:\/([^/]+))?$/.exec(url.pathname);
    if(rejectionView){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importedDuplicateReview(request,env,session.workspaceId,rejectionView[1],'rejection'));}
    const duplicateImport=/^\/api\/runner\/imports\/duplicate-check\/([^/]+)$/.exec(url.pathname);
    if(duplicateImport){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDuplicateReview(request,env,runner,duplicateImport[1]));}
    const duplicateUpload=/^\/api\/runner\/imports\/duplicate-check-files\/([^/]+)\/([a-f0-9]{64})\/(original|content)$/.exec(url.pathname);
    if(duplicateUpload){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDuplicateFile(request,env,runner,duplicateUpload[1],duplicateUpload[2],duplicateUpload[3]));}
    const duplicateDownload=/^\/api\/imported-duplicate-checks\/([^/]+)\/files\/([a-f0-9]{64})\/(original|content)$/.exec(url.pathname);
    if(duplicateDownload){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await (request.method==='PUT'?importDuplicateFile(request,env,{ownerId:session.workspaceId},duplicateDownload[1],duplicateDownload[2],duplicateDownload[3],true):duplicateFile(request,env,session.workspaceId,duplicateDownload[1],duplicateDownload[2],duplicateDownload[3])));}
    const duplicateView=/^\/api\/imported-duplicate-checks(?:\/([^/]+))?$/.exec(url.pathname);
    if(duplicateView){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importedDuplicateReview(request,env,session.workspaceId,duplicateView[1]));}
    const knowledgeCapture=/^\/api\/runner\/knowledge-captures(?:\/documents\/([^/]+))?$/.exec(url.pathname);
    if(knowledgeCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerKnowledgeCapture(request,env,runner,knowledgeCapture[1]));}
    const imageLibraryCapture=/^\/api\/runner\/image-library-captures(?:\/images\/([^/]+))?$/.exec(url.pathname);
    if(imageLibraryCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerImageLibraryCapture(request,env,runner,imageLibraryCapture[1]));}
    const desktopLibraryImage=/^\/api\/runner\/imports\/image-library\/([^/]+)\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopLibraryImage){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importLibraryImage(request,env,runner,desktopLibraryImage[1],desktopLibraryImage[2]));}
    const imageLibraryRoute=/^\/api\/image-library(?:\/([^/]+)(?:\/(file))?)?$/.exec(url.pathname);
    if(imageLibraryRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await imageLibrary(request,env,session.workspaceId,imageLibraryRoute[1],imageLibraryRoute[2]));}
    const desktopPaa = /^\/api\/runner\/imports\/paa\/([^/]+)\/([a-f0-9]{64})$/.exec(url.pathname);
    if (desktopPaa) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await importDesktopPaa(request, env, runner, desktopPaa[1], desktopPaa[2]));
    }
    const desktopExperienceImage = /^\/api\/runner\/imports\/company-experience\/([^/]+)\/images\/([a-f0-9]{64})$/.exec(url.pathname);
    if (desktopExperienceImage) {
      const runner=await authenticateRunner(request,env);
      if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await importDesktopExperienceImage(request,env,runner,desktopExperienceImage[1],desktopExperienceImage[2]));
    }
    const desktopExperience = /^\/api\/runner\/imports\/company-experience\/([^/]+)\/([a-f0-9]{64})$/.exec(url.pathname);
    if (desktopExperience) {
      const runner=await authenticateRunner(request,env);
      if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await importDesktopCompanyExperience(request,env,runner,desktopExperience[1],desktopExperience[2]));
    }
    const desktopCompanyProfileImage = /^\/api\/runner\/imports\/company-profile\/([^/]+)\/images\/([a-f0-9]{64})$/.exec(url.pathname);
    if (desktopCompanyProfileImage) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await importDesktopCompanyProfileImage(request,env,runner,desktopCompanyProfileImage[1],desktopCompanyProfileImage[2]));
    }
    const desktopCompanyProfile = /^\/api\/runner\/imports\/company-profile\/([^/]+)$/.exec(url.pathname);
    if (desktopCompanyProfile) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await importDesktopCompanyProfile(request, env, runner, desktopCompanyProfile[1]));
    }
    const experienceCapture=/^\/api\/runner\/experience-captures(?:\/images\/([^/]+))?$/.exec(url.pathname);
    if(experienceCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerExperienceCapture(request,env,runner,experienceCapture[1]));}
    const certificatesCapture=/^\/api\/runner\/certificate-captures(?:\/images\/([^/]+))?$/.exec(url.pathname);
    if(certificatesCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerCertificatesCapture(request,env,runner,certificatesCapture[1]));}
    const desktopCertificateImage = /^\/api\/runner\/imports\/certificates\/([^/]+)\/images\/([a-f0-9]{64})$/.exec(url.pathname);
    if (desktopCertificateImage) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importCertificateImage(request, env, runner, desktopCertificateImage[1], desktopCertificateImage[2]));
    }
    const desktopCertificate = /^\/api\/runner\/imports\/certificates\/([^/]+)\/([a-f0-9]{64})$/.exec(url.pathname);
    if (desktopCertificate) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopCertificate(request, env, runner, desktopCertificate[1], desktopCertificate[2]));
    }
    const certificateImage = /^\/api\/company-certificates\/([^/]+)\/images(?:\/([^/]+))?$/.exec(url.pathname);
    if (certificateImage) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await certificateImages(request, env, session.workspaceId, certificateImage[1], certificateImage[2]));
    }
    const companyCertificate = /^\/api\/company-certificates(?:\/([^/]+))?$/.exec(url.pathname);
    if (companyCertificate) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await companyCertificates(request, env, session.workspaceId, companyCertificate[1]));
    }
    const reminders=/^\/api\/agenda\/reminders(?:\/([^/]+)(?:\/(dismiss|claim|ack|release))?)?$/.exec(url.pathname);
    if(reminders){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await agendaReminders(request,env,session.workspaceId,reminders[1],reminders[2]));}
    if (url.pathname === '/api/agenda') {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await userAgenda(request, env, session.workspaceId));
    }
    const secopWatchProject = /^\/api\/projects\/([^/]+)\/secop-watch$/.exec(url.pathname);
    const secopWatchAlert = /^\/api\/secop-alerts\/([^/]+)\/review$/.exec(url.pathname);
    if (secopWatchProject || secopWatchAlert || url.pathname === '/api/secop-watch/check-due' || url.pathname === '/api/secop-watch') {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await secopWatch(request,env,session.workspaceId,secopWatchProject?'project':secopWatchAlert?'review':url.pathname === '/api/secop-watch'?'overview':'due',secopWatchProject?.[1] || secopWatchAlert?.[1]));
    }
    const paaRoute = /^\/api\/paa-watches(?:\/([^/]+)(?:\/(check))?)?$/.exec(url.pathname);
    const paaAlert = /^\/api\/paa-alerts\/([^/]+)\/review$/.exec(url.pathname);
    if (paaRoute || paaAlert) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error:'unauthorized' }, { status:401 }));
      const kind = paaAlert ? 'review' : paaRoute[1] === 'check-due' ? 'due' : paaRoute[2] ? 'check' : 'watches';
      return privateResponse(await paaWatch(request, env, session.workspaceId, kind, paaAlert ? paaAlert[1] : paaRoute[1]));
    }
    if (url.pathname === '/api/secop/market' || url.pathname === '/api/secop/market/summary') {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await marketSearch(request, env, url.pathname.endsWith('/summary')));
    }
    const offerDocumentsCapture=/^\/api\/runner\/project-offer-document-captures\/([^/]+)$/.exec(url.pathname);
    if(offerDocumentsCapture){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerOfferDocumentsCapture(request,env,runner,offerDocumentsCapture[1]));}
    const desktopOfferDocuments=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/offer-documents$/.exec(url.pathname);
    if(desktopOfferDocuments){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopOfferDocuments(request,env,runner,desktopOfferDocuments[1]));}
    const desktopSubmissionAttachment=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/submission-restores\/attachments\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopSubmissionAttachment){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importSubmissionAttachment(request,env,runner,desktopSubmissionAttachment[1],desktopSubmissionAttachment[2]));}
    const desktopSubmissionRecord=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/submission-restores\/records\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopSubmissionRecord){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importSubmissionRecord(request,env,runner,desktopSubmissionRecord[1],desktopSubmissionRecord[2]));}
    const desktopSubmissionStage=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/submission-files\/([a-f0-9]{64})\/stage\/(start|part|complete|abort)(?:\/([^/]+))?$/.exec(url.pathname);
    if(desktopSubmissionStage){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await desktopSubmissionFileStage(request,env,runner,desktopSubmissionStage[1],desktopSubmissionStage[2],desktopSubmissionStage[3],desktopSubmissionStage[4]));}
    const desktopSubmissionItem=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/submission-tracking\/(requests|results)\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopSubmissionItem){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importSubmissionTrackingItem(request,env,runner,desktopSubmissionItem[1],desktopSubmissionItem[2],desktopSubmissionItem[3]));}
    const desktopReviewTask = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/review-tasks\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopReviewTask){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopReviewTask(request,env,runner,desktopReviewTask[1],desktopReviewTask[2]));}
    const desktopBlindLargeMatch=/^\/api\/runner\/imports\/technical-plan\/([^/]+)\/blind-tasks\/([a-f0-9]{64})\/large-artifact\/(start|part|complete|abort)(?:\/([^/]+))?$/.exec(url.pathname);
    if(desktopBlindLargeMatch){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await desktopBlindLarge(request,env,runner,desktopBlindLargeMatch[1],desktopBlindLargeMatch[2],desktopBlindLargeMatch[3],desktopBlindLargeMatch[4]));}
    const desktopBlindTask = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/blind-tasks\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopBlindTask){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopBlindTask(request,env,runner,desktopBlindTask[1],desktopBlindTask[2]));}
    const desktopBidEvaluation = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/bid-evaluations\/([a-f0-9]{64})$/.exec(url.pathname);
    if(desktopBidEvaluation){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopBidEvaluation(request,env,runner,desktopBidEvaluation[1],desktopBidEvaluation[2]));}
    const desktopChat = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/chat$/.exec(url.pathname);
    if (desktopChat) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopChat(request, env, runner, desktopChat[1]));
    }
    const importedChat = /^\/api\/projects\/([^/]+)\/imported-chat$/.exec(url.pathname);
    if (importedChat) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importedDesktopChat(request, env, session.workspaceId, importedChat[1]));
    }
    const desktopAnalyses = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/analyses$/.exec(url.pathname);
    if (desktopAnalyses) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopAnalyses(request, env, runner, desktopAnalyses[1]));
    }
    const desktopFacts = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/facts$/.exec(url.pathname);
    if (desktopFacts) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopFacts(request, env, runner, desktopFacts[1]));
    }
    const desktopOpportunity = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/opportunity-tracking$/.exec(url.pathname);
    if (desktopOpportunity) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopOpportunityTracking(request, env, runner, desktopOpportunity[1]));
    }
    const desktopSupports = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/requirement-supports$/.exec(url.pathname);
    if(desktopSupports){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopRequirementSupports(request,env,runner,desktopSupports[1]));}
    const desktopWorkflow = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/workflow$/.exec(url.pathname);
    if (desktopWorkflow) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopWorkflow(request, env, runner, desktopWorkflow[1]));
    }
    const desktopRejectionDraft = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/rejection-draft$/.exec(url.pathname);
    if(desktopRejectionDraft){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await importDesktopRejectionDraft(request,env,runner,desktopRejectionDraft[1]));}
    const desktopBlindProfile = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/blind-profile$/.exec(url.pathname);
    if (desktopBlindProfile) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error:'unauthorized' },{status:401}));
      return privateResponse(await importDesktopBlindProfile(request,env,runner,desktopBlindProfile[1]));
    }
    const desktopOffer = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/economic-offer$/.exec(url.pathname);
    if (desktopOffer) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopOffer(request, env, runner, desktopOffer[1]));
    }
    const desktopMultipartMatch = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/files\/([^/]+)\/multipart\/(start|complete|abort|part)(?:\/([^/]+))?$/.exec(url.pathname);
    if (desktopMultipartMatch) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({error:'unauthorized'}, {status:401}));
      return privateResponse(await desktopMultipart(request,env,runner,desktopMultipartMatch[1],desktopMultipartMatch[2],desktopMultipartMatch[3],desktopMultipartMatch[4]));
    }
    const desktopFile = /^\/api\/runner\/imports\/technical-plan\/([^/]+)\/files\/([^/]+)$/.exec(url.pathname);
    if (desktopFile) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopFile(request, env, runner, desktopFile[1], desktopFile[2]));
    }
    if (url.pathname === '/api/runner/imports/technical-plan') {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await importDesktopPlan(request, env, runner));
    }
    const knowledgeDocument = /^\/api\/runner\/jobs\/([^/]+)\/knowledge-documents\/([^/]+)$/.exec(url.pathname);
    if (knowledgeDocument) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerKnowledgeDocument(request, env, runner, knowledgeDocument[1], knowledgeDocument[2]));
    }
    const runnerKnowledge = /^\/api\/runner\/jobs\/([^/]+)\/knowledge-source$/.exec(url.pathname);
    if (runnerKnowledge) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerKnowledgeSource(request, env, runner, runnerKnowledge[1]));
    }
    if (url.pathname === '/api/knowledge' || url.pathname.startsWith('/api/knowledge/')) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await (/^\/api\/knowledge\/entries$/.test(url.pathname) || /^\/api\/knowledge\/documents\/[^/]+\/analyses(?:\/[^/]+\/(?:apply|cancel))?$/.test(url.pathname) ? knowledgeAnalysis(request, env, session.workspaceId) : knowledgeLibrary(request, env, session.workspaceId)));
    }
    if (/^\/api\/rup\/analyses(?:\/[^/]+\/cancel)?$/.test(url.pathname)) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await userAccountJobs(request, env, session.workspaceId));
    }
    const runnerRup = /^\/api\/runner\/jobs\/([^/]+)\/rup$/.exec(url.pathname);
    if (runnerRup) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerRupSource(request, env, runner, runnerRup[1]));
    }
    if (url.pathname === '/api/rup' || url.pathname.startsWith('/api/rup/')) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await rup(request, env, session.workspaceId));
    }
    const suggestionContext = /^\/api\/runner\/jobs\/([^/]+)\/requirements-context$/.exec(url.pathname);
    if (suggestionContext) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerRequirementContext(request, env, runner, suggestionContext[1]));
    }
    const suggestionRoute = /^\/api\/projects\/([^/]+)\/requirement-suggestions(?:\/([^/]+)\/accept)?$/.exec(url.pathname);
    if (suggestionRoute) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await userRequirementSuggestions(request, env, session.workspaceId, suggestionRoute[1], suggestionRoute[2]));
    }
    const facts = /^\/api\/projects\/([^/]+)\/technical-facts(?:\/(apply|review-import|attempts))?$/.exec(url.pathname);
    if (facts) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await globalFacts(request, env, session.workspaceId, facts[1], facts[2]));
    }
    const values = /^\/api\/projects\/([^/]+)\/technical-template\/values$/.exec(url.pathname);
    if (values) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await templateValues(request, env, session.workspaceId, values[1]));
    }
    const template = /^\/api\/projects\/([^/]+)\/technical-template$/.exec(url.pathname);
    if (template) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await technicalTemplate(request, env, session.workspaceId, template[1]));
    }
    const outline = /^\/api\/projects\/([^/]+)\/technical-outline(?:\/(selection|apply|discard))?$/.exec(url.pathname);
    if (outline) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await technicalOutline(request, env, session.workspaceId, outline[1], outline[2]));
    }
    const plan = /^\/api\/projects\/([^/]+)\/technical-plan(?:\/(nodes)(?:\/([^/]+)(?:\/(content|move|apply-job))?)?)?$/.exec(url.pathname);
    if (plan) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await technicalPlan(request, env, session.workspaceId, plan[1], plan[3], plan[3] ? plan[4] : plan[2]));
    }
    const runnerTemplateRoute = /^\/api\/runner\/jobs\/([^/]+)\/template$/.exec(url.pathname);
    if (runnerTemplateRoute) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerTemplate(request, env, runner, runnerTemplateRoute[1]));
    }
    const blindProfileRoute = /^\/api\/projects\/([^/]+)\/blind-profile$/.exec(url.pathname);
    if (blindProfileRoute) { const session = await getScopedSession(); if (!session) return privateResponse(Response.json({ error:'unauthorized' }, { status:401 })); return privateResponse(await blindProfile(request, env, session.workspaceId, blindProfileRoute[1])); }
    const draft = /^\/api\/projects\/([^/]+)\/rejection-draft$/.exec(url.pathname);
    if (draft) { const session = await getScopedSession(); if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 })); return privateResponse(await rejectionDraft(request, env, session.workspaceId, draft[1])); }
    const rejectionFinding=/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/rejection-findings\/remove$/.exec(url.pathname);
    if(rejectionFinding){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await removeRejectionFinding(request,env,session.workspaceId,rejectionFinding[1],rejectionFinding[2]));}
    const uploadReport = /^\/api\/runner\/jobs\/([^/]+)\/repair-report$/.exec(url.pathname);
    if(uploadReport){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await uploadRepairReport(request,env,runner,uploadReport[1]));}
    const reportRoute = /^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/repair-report$/.exec(url.pathname);
    if(reportRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await downloadRepairReport(request,env,session.workspaceId,reportRoute[1],reportRoute[2]));}
    const evaluationRoute = /^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/evaluation$/.exec(url.pathname);
    if(evaluationRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await bidEvaluation(request,env,session.workspaceId,evaluationRoute[1],evaluationRoute[2]));}
    const secopZipPart = /^\/api\/runner\/jobs\/([^/]+)\/secop-parts\/(\d+)$/.exec(url.pathname);
    if (secopZipPart) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await uploadSecopZipPart(request, env, runner, secopZipPart[1], secopZipPart[2]));
    }
    const secopZipCommit = /^\/api\/runner\/jobs\/([^/]+)\/secop-commit$/.exec(url.pathname);
    if (secopZipCommit) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await commitSecopZipParts(request, env, runner, secopZipCommit[1]));
    }
    const largeArtifact = /^\/api\/runner\/jobs\/([^/]+)\/artifact-multipart\/(start|status|part|complete|abort)(?:\/([^/]+))?$/.exec(url.pathname);
    if (largeArtifact) { const runner=await authenticateRunner(request,env); if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401})); return privateResponse(await jobLargeArtifact(request,env,runner,largeArtifact[1],largeArtifact[2],largeArtifact[3])); }
    const uploadArtifact = /^\/api\/runner\/jobs\/([^/]+)\/artifact$/.exec(url.pathname);
    if (uploadArtifact) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await uploadJobArtifact(request, env, runner, uploadArtifact[1]));
    }
    const fieldReview = /^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/artifact\/field-review$/.exec(url.pathname);
    if (fieldReview) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await wordFieldReview(request, env, session.workspaceId, fieldReview[1], fieldReview[2]));
    }
    const recoveryArtifact = /^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/artifact\/recovery$/.exec(url.pathname);
    if (recoveryArtifact) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await wordRecovery(request, env, session.workspaceId, recoveryArtifact[1], recoveryArtifact[2]));
    }
    const downloadArtifact = /^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/artifact$/.exec(url.pathname);
    if (downloadArtifact) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await downloadJobArtifact(request, env, session.workspaceId, downloadArtifact[1], downloadArtifact[2]));
    }
    const technicalBatchPlan = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch\/plan$/.exec(url.pathname);
    if (technicalBatchPlan) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatchPlans(request,env,runner,technicalBatchPlan[1])); }
    const technicalBatchConsistency = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch\/consistency$/.exec(url.pathname);
    if (technicalBatchConsistency) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatchConsistency(request,env,runner,technicalBatchConsistency[1])); }
    const technicalBatchWordPlan = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch\/word-plan$/.exec(url.pathname);
    if (technicalBatchWordPlan) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatchWordPlan(request,env,runner,technicalBatchWordPlan[1])); }
    const technicalBatchAdjustment = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch\/word-adjustment\/([^/]+)$/.exec(url.pathname);
    if (technicalBatchAdjustment) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatchWordAdjustment(request,env,runner,technicalBatchAdjustment[1],decodeURIComponent(technicalBatchAdjustment[2]))); }
    const technicalBatchLedger = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch\/ledger\/([^/]+)$/.exec(url.pathname);
    if (technicalBatchLedger) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatchLedger(request,env,runner,technicalBatchLedger[1],decodeURIComponent(technicalBatchLedger[2]))); }
    const technicalBatchSection = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch\/section\/([^/]+)$/.exec(url.pathname);
    if (technicalBatchSection) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatchSection(request,env,runner,technicalBatchSection[1],decodeURIComponent(technicalBatchSection[2]))); }
    const technicalBatch = /^\/api\/runner\/jobs\/([^/]+)\/technical-batch(?:\/drafts\/([^/]+))?$/.exec(url.pathname);
    if (technicalBatch) { const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerTechnicalBatch(request,env,runner,technicalBatch[1],technicalBatch[2])); }
    const technicalBatchDrafts = /^\/api\/projects\/([^/]+)\/technical-batches\/([^/]+)\/(drafts|plans|consistency|adjustments|resume|apply|delete)$/.exec(url.pathname);
    if (technicalBatchDrafts) { const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userTechnicalBatch(request,env,session.workspaceId,technicalBatchDrafts[1],technicalBatchDrafts[2],technicalBatchDrafts[3])); }
    const planContext = /^\/api\/runner\/jobs\/([^/]+)\/plan-context$/.exec(url.pathname);
    if (planContext) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await runnerPlanContext(request, env, runner, planContext[1]));
    }
    const requirementSupport = /^\/api\/projects\/([^/]+)\/workflow\/requirements\/([^/]+)\/supports(?:\/([^/]+))?$/.exec(url.pathname);
    if(requirementSupport){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await requirementSupports(request,env,session.workspaceId,requirementSupport[1],requirementSupport[2],requirementSupport[3]));}
    const offerDocumentItem=/^\/api\/projects\/([^/]+)\/offer-documents\/documents\/([^/]+)$/.exec(url.pathname);
    if(offerDocumentItem){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await removeOfferDocument(request,env,session.workspaceId,offerDocumentItem[1],offerDocumentItem[2]));}
    const offerDocumentCreate=/^\/api\/projects\/([^/]+)\/offer-documents\/documents$/.exec(url.pathname);
    if(offerDocumentCreate){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await createOfferDocument(request,env,session.workspaceId,offerDocumentCreate[1]));}
    const offerCandidates=/^\/api\/projects\/([^/]+)\/offer-documents\/support-candidates$/.exec(url.pathname);
    if(offerCandidates){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await offerSupportCandidates(request,env,session.workspaceId,offerCandidates[1]));}
    const offerLinkRepair=/^\/api\/projects\/([^/]+)\/offer-documents\/links\/([^/]+)\/repair$/.exec(url.pathname);
    if(offerLinkRepair){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await repairOfferSupportLink(request,env,session.workspaceId,offerLinkRepair[1],offerLinkRepair[2]));}
    const offerLinkItem=/^\/api\/projects\/([^/]+)\/offer-documents\/links\/([^/]+)$/.exec(url.pathname);
    if(offerLinkItem){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await removeOfferSupportLink(request,env,session.workspaceId,offerLinkItem[1],offerLinkItem[2]));}
    const offerLinks=/^\/api\/projects\/([^/]+)\/offer-documents\/links$/.exec(url.pathname);
    if(offerLinks){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await createOfferSupportLink(request,env,session.workspaceId,offerLinks[1]));}
    const offerPackageCreate=/^\/api\/projects\/([^/]+)\/offer-documents\/package$/.exec(url.pathname);
    if(offerPackageCreate){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await createOfferPackageItem(request,env,session.workspaceId,offerPackageCreate[1]));}
    const offerPackageItem=/^\/api\/projects\/([^/]+)\/offer-documents\/package\/([^/]+)$/.exec(url.pathname);
    if(offerPackageItem){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await removeOfferPackageItem(request,env,session.workspaceId,offerPackageItem[1],offerPackageItem[2]));}
    const offerPackageRepair=/^\/api\/projects\/([^/]+)\/offer-documents\/package\/([^/]+)\/repair$/.exec(url.pathname);
    if(offerPackageRepair){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await repairOfferPackageItem(request,env,session.workspaceId,offerPackageRepair[1],offerPackageRepair[2]));}
    const offerPackageMove=/^\/api\/projects\/([^/]+)\/offer-documents\/package\/([^/]+)\/move$/.exec(url.pathname);
    if(offerPackageMove){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await moveOfferPackageItem(request,env,session.workspaceId,offerPackageMove[1],offerPackageMove[2]));}
    const offerPackageReview=/^\/api\/projects\/([^/]+)\/offer-documents\/package\/([^/]+)\/review$/.exec(url.pathname);
    if(offerPackageReview){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await reviewOfferPackageItem(request,env,session.workspaceId,offerPackageReview[1],offerPackageReview[2]));}
    const offerDocumentReplace=/^\/api\/projects\/([^/]+)\/offer-documents\/([^/]+)\/replace$/.exec(url.pathname);
    if(offerDocumentReplace){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await replaceOfferDocument(request,env,session.workspaceId,offerDocumentReplace[1],offerDocumentReplace[2]));}
    const offerDocumentRepair=/^\/api\/projects\/([^/]+)\/offer-documents\/([^/]+)\/file$/.exec(url.pathname);
    if(offerDocumentRepair){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await repairOfferDocument(request,env,session.workspaceId,offerDocumentRepair[1],offerDocumentRepair[2]));}
    const projectOfferDocuments=/^\/api\/projects\/([^/]+)\/offer-documents$/.exec(url.pathname);
    if(projectOfferDocuments){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerOfferDocumentsCapture(request,env,{ownerId:session.workspaceId},projectOfferDocuments[1]));}
    const comparison = /^\/api\/projects\/([^/]+)\/workflow\/requirements\/([^/]+)\/rup-comparison$/.exec(url.pathname);
    if (comparison) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await rupComparison(request, env, session.workspaceId, comparison[1], comparison[2]));
    }
    const projectPreflight = /^\/api\/projects\/([^/]+)\/preflight$/.exec(url.pathname);
    if(projectPreflight){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await preflight(request,env,session.workspaceId,projectPreflight[1]));}
    const projectOpportunityTracking = /^\/api\/projects\/([^/]+)\/opportunity-tracking$/.exec(url.pathname);
    if (projectOpportunityTracking) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await opportunityTracking(request, env, session.workspaceId, projectOpportunityTracking[1]));
    }
    const submissionRecordRoute=/^\/api\/projects\/([^/]+)\/submission-tracking\/submissions(?:\/([^/]+)\/files\/(package|receipt))?$/.exec(url.pathname);
    if(submissionRecordRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await submissionRecords(request,env,session.workspaceId,submissionRecordRoute[1],submissionRecordRoute[2],submissionRecordRoute[3]));}
    const submissionFileRoute=/^\/api\/projects\/([^/]+)\/submission-tracking\/requests\/([^/]+)\/files(?:\/([^/]+))?$/.exec(url.pathname);
    if(submissionFileRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await submissionAttachments(request,env,session.workspaceId,submissionFileRoute[1],submissionFileRoute[2],submissionFileRoute[3]));}
    const submissionRoute=/^\/api\/projects\/([^/]+)\/submission-tracking(?:\/(requests|results)(?:\/([^/]+))?)?$/.exec(url.pathname);
    if(submissionRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await submissionTracking(request,env,session.workspaceId,submissionRoute[1],submissionRoute[2],submissionRoute[3]));}
    const projectWorkflow = /^\/api\/projects\/([^/]+)\/workflow(?:\/(tasks|requirements)(?:\/([^/]+))?)?$/.exec(url.pathname);
    if (projectWorkflow) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await workflow(request, env, session.workspaceId, projectWorkflow[1], projectWorkflow[2], projectWorkflow[3]));
    }
    const projectSecop = /^\/api\/projects\/([^/]+)\/secop$/.exec(url.pathname);
    const experienceImage = /^\/api\/company-experience\/([^/]+)\/images(?:\/([^/]+))?$/.exec(url.pathname);
    if (experienceImage) {
      const session=await getScopedSession();
      if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await experienceImages(request,env,session.workspaceId,experienceImage[1],experienceImage[2]));
    }
    const experience = /^\/api\/company-experience(?:\/([^/]+))?$/.exec(url.pathname);
    if (experience) {
      const session=await getScopedSession();
      if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await companyExperience(request,env,session.workspaceId,experience[1]));
    }
    if(url.pathname==='/api/runner/opportunity-suggestions/due'){const runner=await authenticateRunner(request,env);if(!runner)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await runnerOpportunityDue(request,env,runner));}
    if(url.pathname==='/api/opportunity-suggestions/due'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(Response.json({started:false}));}
    const opportunityResult=/^\/api\/opportunity-suggestions\/results(?:\/(review|save))?$/.exec(url.pathname);
    if(opportunityResult){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await opportunityResults(request,env,session.workspaceId,opportunityResult[1]));}
    const opportunityJob=/^\/api\/opportunity-suggestions\/jobs(?:\/([^/]+)\/(cancel))?$/.exec(url.pathname);
    if (opportunityJob) {
      const session=await getScopedSession();
      if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await opportunityJobs(request,env,session.workspaceId,opportunityJob[1],opportunityJob[2]));
    }
    if (url.pathname === '/api/opportunity-suggestions/search') {
      const session=await getScopedSession();
      if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await opportunitySearch(request,env,session.workspaceId));
    }
    if (url.pathname === '/api/opportunity-suggestions/settings') {
      const session=await getScopedSession();
      if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await opportunitySuggestionSettings(request,env,session.workspaceId));
    }
    const companyProfileImage = /^\/api\/company-profile\/images(?:\/([^/]+))?$/.exec(url.pathname);
    if (companyProfileImage) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await profileImages(request,env,session.workspaceId,companyProfileImage[1]));
    }
    const exportTemplates=/^\/api\/export-templates(?:\/([^/]+))?$/.exec(url.pathname);
    if(exportTemplates){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await userExportTemplates(request,env,session.workspaceId,exportTemplates[1]));}
    if(url.pathname==='/api/export-format'){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await exportFormat(request,env,session.workspaceId));}
    if (url.pathname === '/api/company-profile') {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await companyProfile(request, env, session.workspaceId));
    }
    const selectedSecopImports = /^\/api\/projects\/([^/]+)\/secop\/imports(?:\/(\d+))?$/.exec(url.pathname);
    if (selectedSecopImports) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({error:'unauthorized'},{status:401}));
      return privateResponse(await secopSelectedImports(request,env,session.workspaceId,selectedSecopImports[1],selectedSecopImports[2]));
    }
    const projectSecopDocuments = /^\/api\/projects\/([^/]+)\/secop\/documents(?:\/([^/]+)\/import)?$/.exec(url.pathname);
    if (projectSecopDocuments) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await secopDocuments(request, env, session.workspaceId, projectSecopDocuments[1], projectSecopDocuments[2]));
    }
    if (['/api/secop/search','/api/secop/preferences','/api/secop/categories','/api/secop/detail','/api/secop/documents','/api/secop/placsp/sync'].includes(url.pathname) || url.pathname === '/api/projects/from-secop' || projectSecop) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      if (url.pathname === '/api/secop/search') return privateResponse(await searchSecop(request, env, session.workspaceId));
      if (url.pathname === '/api/secop/preferences') return privateResponse(await secopPreferences(request, env, session.workspaceId));
      if (url.pathname === '/api/secop/categories') return privateResponse(await secopCategories(request, env));
      if (url.pathname === '/api/secop/detail') return privateResponse(await secopDetail(request, env));
      if (url.pathname === '/api/secop/documents') return privateResponse(await secopDocumentCatalog(request, env));
      if (url.pathname === '/api/secop/placsp/sync') return privateResponse(await syncPlacsp(request, env));
      if (url.pathname === '/api/projects/from-secop') return privateResponse(await createSecopProject(request, env, session.workspaceId));
      return privateResponse(await getProjectSecop(request, env, session.workspaceId, projectSecop[1]));
    }
    const fileJob = /^\/api\/runner\/jobs\/([^/]+)\/files\/([^/]+)$/.exec(url.pathname);
    if (fileJob) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleRunnerFile(request, env, runner, fileJob[1], fileJob[2]));
    }
    const credentialJob = /^\/api\/runner\/jobs\/([^/]+)\/credential$/.exec(url.pathname);
    if (credentialJob) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleRunnerCredential(request, env, runner, credentialJob[1]));
    }
    const economicOffer = /^\/api\/projects\/([^/]+)\/economic-offer(?:\/(export))?$/.exec(url.pathname);
    if (economicOffer) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleEconomicOffer(request, env, session.workspaceId, economicOffer[1], Boolean(economicOffer[2])));
    }
    if (url.pathname === '/api/provider-credentials' || url.pathname.startsWith('/api/provider-credentials/')) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleUserCredentials(request, env, session.workspaceId));
    }
    const accountQuestions=/^\/api\/feasibility-report\/questions(?:\/([^/]+)\/answer)?$/.exec(url.pathname);
    if(accountQuestions){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await handleAccountUserQuestions(request,env,session.workspaceId,accountQuestions[1]));}
    const runnerQuestions = /^\/api\/runner\/jobs\/([^/]+)\/questions(?:\/([^/]+))?$/.exec(url.pathname);
    if (runnerQuestions) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      const account=await env.DB.prepare('SELECT id FROM account_jobs WHERE id=? AND owner_id=?').bind(runnerQuestions[1],runner.ownerId).first();
      return privateResponse(await (account?handleAccountRunnerQuestions(request,env,runner,runnerQuestions[1],runnerQuestions[2]):handleRunnerQuestions(request, env, runner, runnerQuestions[1], runnerQuestions[2])));
    }
    const userQuestions = /^\/api\/projects\/([^/]+)\/job-questions(?:\/([^/]+)\/answer)?$/.exec(url.pathname);
    if (userQuestions) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleUserQuestions(request, env, session.workspaceId, userQuestions[1], userQuestions[2]));
    }
    const analysis = /^\/api\/projects\/([^/]+)\/technical-analyses(?:\/([^/]+)\/(?:accept|review-import|accept-proposal|edit))?$/.exec(url.pathname);
    if (analysis) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await technicalAnalysis(request, env, session.workspaceId, analysis[1], analysis[2], url.pathname.endsWith('/review-import') ? 'review-import' : url.pathname.endsWith('/accept-proposal') ? 'accept-proposal' : url.pathname.endsWith('/edit') ? 'edit' : undefined));
    }
    if (url.pathname.startsWith('/api/runner/jobs/')) {
      const runner = await authenticateRunner(request, env);
      if (!runner) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleAgentJobs(request, env, runner));
    }
    const chatHistory = /^\/api\/projects\/([^/]+)\/chat-history$/.exec(url.pathname);
    if (chatHistory) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await clearChatHistory(request, env, session.workspaceId, chatHistory[1]));
    }
    const activityRoute=/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/activity$/.exec(url.pathname);
    if(activityRoute){const session=await getScopedSession();if(!session)return privateResponse(Response.json({error:'unauthorized'},{status:401}));return privateResponse(await readJobActivity(request,env,session.workspaceId,activityRoute[1],activityRoute[2]));}
    if (/^\/api\/projects\/[^/]+\/jobs(?:\/[^/]+\/cancel)?$/.test(url.pathname)) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleUserJobs(request, env, session.workspaceId));
    }
    if (url.pathname === '/api/runners/pair' || url.pathname === '/api/runners/heartbeat') {
      return privateResponse(await handleRunnerAgent(request, env));
    }
    if (url.pathname === '/api/runner-pairings' || url.pathname === '/api/runners' || url.pathname.startsWith('/api/runners/')) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse(await handleRunnerUser(request, env, session.workspaceId));
    }
    if (url.pathname === '/api/projects' || url.pathname.startsWith('/api/projects/')) {
      const session = await getScopedSession();
      if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
      return privateResponse((await handleProjects(request, env, session.workspaceId)) ?? new Response('Not found', { status: 404 }));
    }
    return new Response('Not found', { status: 404 });
  },
};

export default {
  async fetch(request,env){
    try {
      const response = new URL(request.url).pathname.startsWith('/api/')
        ? await withBackupGate(request,env,()=>apiWorker.fetch(request,env))
        : await apiWorker.fetch(request,env);
      return withSecurityHeaders(response);
    } catch {
      return withSecurityHeaders(privateResponse(Response.json({ error: 'internal_error' }, { status: 500 })));
    }
  },
};
