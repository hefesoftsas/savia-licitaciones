const path = require('node:path');
const { workspaceDatabasePath } = require('./brandCompatibility.cjs');
const companyBindings = new WeakMap();

function getUserDataPath(app) {
  return app.getPath('userData');
}

// Bind once, before any workspace path is resolved. Switching requires a new process.
function bindWorkspaceCompany(app, companyId) {
  const id=String(companyId||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw Error('Identificador de empresa no válido.');
  if(companyBindings.has(app))throw Error('La empresa del espacio de trabajo ya está definida.');
  companyBindings.set(app,id);
}
function getWorkspaceScopeRoot(app) {
  if(!companyBindings.has(app))companyBindings.set(app,null);
  const id=companyBindings.get(app);
  return id ? path.join(getUserDataPath(app),'company-profiles',id) : getUserDataPath(app);
}

function getConfigFilePath(app) {
  return path.join(getUserDataPath(app), 'user_config.json');
}

// Store official-account sessions separately from settings forms.
function getOfficialApiSessionFilePath(app) {
  return path.join(getUserDataPath(app), 'official_api_session.json');
}

// Cache payment QR codes independently; the server still manages order state.
function getOfficialRechargeQrCachePath(app) {
  return path.join(getUserDataPath(app), 'official_recharge_qr_cache.json');
}

function getLicenseFilePath(app) {
  return path.join(getUserDataPath(app), 'license.json');
}

function getDonationStateFilePath(app) {
  return path.join(getUserDataPath(app), 'donation_state.json');
}

function getGpuStartupProbePath(app) {
  return path.join(getUserDataPath(app), 'gpu_startup_probe.json');
}

function getWorkspaceDir(app) {
  return path.join(getWorkspaceScopeRoot(app), 'workspace');
}

/** Recovery directory for failed forced deletions, outside workspace to avoid workspace scans. */
function getWorkspaceTrashDir(app) {
  return path.join(getWorkspaceScopeRoot(app), 'workspace-trash');
}

function getWorkspaceDatabasePath(app) {
  return workspaceDatabasePath(getWorkspaceDir(app));
}

function getTechnicalPlanDir(app) {
  return path.join(getWorkspaceDir(app), 'technical-plan');
}

function getFeasibilityReportDir(app) {
  return path.join(getWorkspaceDir(app), 'feasibility-report');
}

function getFeasibilityReportSourcesDir(app) {
  return path.join(getFeasibilityReportDir(app), 'sources');
}

function getTechnicalPlanTenderMarkdownPath(app) {
  return path.join(getTechnicalPlanDir(app), 'tender.md');
}

/** Original tender Word directory. */
function getTechnicalPlanTenderOriginalsDir(app) {
  return path.join(getTechnicalPlanDir(app), 'tender-originals');
}

/** Final bid template generated after root-outline confirmation. */
function getTechnicalPlanBidTemplatePath(app) {
  return path.join(getTechnicalPlanDir(app), 'bid-template.docx');
}

/** Internal extracted-chapter source for field scanning and annotation. */
function getTechnicalPlanBidTemplateSourcePath(app) {
  return path.join(getTechnicalPlanDir(app), 'bid-template-source.docx');
}

/** Pending-field manifest saved alongside the final bid template. */
function getTechnicalPlanBidTemplateFieldsPath(app) {
  return path.join(getTechnicalPlanDir(app), 'bid-template-fields.json');
}

function getTechnicalPlanOriginalPlanMarkdownPath(app) {
  return path.join(getTechnicalPlanDir(app), 'original-plan.md');
}

function getDuplicateCheckDir(app) {
  return path.join(getWorkspaceDir(app), 'duplicate-check');
}

function getDuplicateCheckContentDir(app) {
  return path.join(getDuplicateCheckDir(app), 'contents');
}

function getRejectionCheckDir(app) {
  return path.join(getWorkspaceDir(app), 'rejection-check');
}

function getBlindCheckDir(app) {
  return path.join(getWorkspaceDir(app), 'blind-check');
}

/** Inspection-copy directory for blind-bid documents. */
function getBlindCheckSourceDir(app) {
  return path.join(getBlindCheckDir(app), 'source');
}

/** Blind-bid automatic repair output directory; originals remain unchanged. */
function getBlindCheckFixedDir(app) {
  return path.join(getBlindCheckDir(app), 'fixed');
}

/** Tender text saved during AI preset extraction, named by preset ID, for review source comparisons; retained with presets and not cleared by inspection resets. */
function getBlindCheckTenderDir(app) {
  return path.join(getWorkspaceDir(app), 'blind-check-tenders');
}

function getRejectionCheckDocumentMarkdownPath(app, role, documentId) {
  if (role === 'bid') {
    const safeDocumentId = String(documentId || 'bid').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(getRejectionCheckDir(app), 'bids', `${safeDocumentId}.md`);
  }
  const tenderDocumentId = String(documentId || '').trim();
  if (tenderDocumentId && tenderDocumentId !== 'tender') {
    const safeDocumentId = tenderDocumentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(getRejectionCheckDir(app), 'tenders', `${safeDocumentId}.md`);
  }
  return path.join(getRejectionCheckDir(app), 'tender.md');
}

function getGeneratedImagesDir(app) {
  return path.join(getWorkspaceDir(app), 'generated-images');
}

function getImportedImagesDir(app) {
  return path.join(getWorkspaceDir(app), 'imported-images');
}

function getKnowledgeBaseDir(app) {
  return path.join(getWorkspaceDir(app), 'knowledge-base');
}

/** Workspace root for credential-library originals and other files. */
function getCredentialLibraryDir(app) {
  return path.join(getWorkspaceDir(app), 'credential-library');
}

function getAiLogsDir(app) {
  return path.join(getWorkspaceScopeRoot(app), 'logs', 'ai');
}

function getDeveloperLogsDir(app, moduleName) {
  return path.join(getWorkspaceScopeRoot(app), 'logs', String(moduleName || 'app'));
}

function getTechnicalPlanLogsDir(app) {
  return getDeveloperLogsDir(app, 'technical-plan');
}

function getAgentRuntimeDir(app) {
  return path.join(getWorkspaceScopeRoot(app), 'agent-runtime');
}

function getPlatformArchKey() {
  return `${process.platform}-${process.arch}`;
}

function getBundledAgentToolsBinDir(app) {
  if (process.env.SAVIA_AGENT_TOOLS_BIN_DIR) {
    return process.env.SAVIA_AGENT_TOOLS_BIN_DIR;
  }

  const platformArch = getPlatformArchKey();
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'agent-tools', platformArch, 'bin');
  }

  return path.join(__dirname, '..', '..', 'vendor', 'agent-tools', platformArch, 'bin');
}

/** Open XML helper task root. */
function getOpenXmlJobsDir(app) {
  return path.join(getWorkspaceDir(app), 'openxml-jobs');
}

/** Individual Open XML task directory. */
function getOpenXmlJobDir(app, jobId) {
  return path.join(getOpenXmlJobsDir(app), String(jobId || ''));
}

/** Helper project path for development builds. */
function getOpenXmlHelperProjectPath() {
  return path.join(__dirname, '..', '..', '..', 'openxmlhelper', 'src', 'OpenXmlHelper', 'OpenXmlHelper.csproj');
}

/** Helper executable after development compilation. */
function getOpenXmlHelperDebugExecutablePath() {
  const fileName = process.platform === 'win32' ? 'openxmlhelper.exe' : 'openxmlhelper';
  return path.join(__dirname, '..', '..', '..', 'openxmlhelper', 'src', 'OpenXmlHelper', 'bin', 'Debug', 'net10.0', fileName);
}

/** Self-contained helper directory in the package or local vendor. */
function getBundledOpenXmlHelperDir(app) {
  if (process.env.SAVIA_OPENXML_HELPER_DIR) {
    return process.env.SAVIA_OPENXML_HELPER_DIR;
  }

  const platformArch = getPlatformArchKey();
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'openxml-tools', platformArch);
  }

  return path.join(__dirname, '..', '..', 'vendor', 'openxml-tools', platformArch);
}

/** Packaged helper executable. */
function getBundledOpenXmlHelperPath(app) {
  const fileName = process.platform === 'win32' ? 'openxmlhelper.exe' : 'openxmlhelper';
  return path.join(getBundledOpenXmlHelperDir(app), fileName);
}

module.exports = {
  bindWorkspaceCompany,
  getAgentRuntimeDir,
  getAiLogsDir,
  getBlindCheckDir,
  getBlindCheckSourceDir,
  getBlindCheckFixedDir,
  getBlindCheckTenderDir,
  getBundledAgentToolsBinDir,
  getBundledOpenXmlHelperDir,
  getBundledOpenXmlHelperPath,
  getDeveloperLogsDir,
  getDuplicateCheckContentDir,
  getDuplicateCheckDir,
  getConfigFilePath,
  getCredentialLibraryDir,
  getDonationStateFilePath,
  getGpuStartupProbePath,
  getFeasibilityReportDir,
  getFeasibilityReportSourcesDir,
  getGeneratedImagesDir,
  getImportedImagesDir,
  getKnowledgeBaseDir,
  getLicenseFilePath,
  getOfficialApiSessionFilePath,
  getOfficialRechargeQrCachePath,
  getOpenXmlHelperDebugExecutablePath,
  getOpenXmlHelperProjectPath,
  getOpenXmlJobDir,
  getOpenXmlJobsDir,
  getRejectionCheckDir,
  getRejectionCheckDocumentMarkdownPath,
  getTechnicalPlanDir,
  getTechnicalPlanLogsDir,
  getTechnicalPlanOriginalPlanMarkdownPath,
  getTechnicalPlanBidTemplatePath,
  getTechnicalPlanBidTemplateSourcePath,
  getTechnicalPlanBidTemplateFieldsPath,
  getTechnicalPlanTenderMarkdownPath,
  getTechnicalPlanTenderOriginalsDir,
  getWorkspaceDir,
  getWorkspaceScopeRoot,
  getWorkspaceDatabasePath,
  getWorkspaceTrashDir,
  getUserDataPath,
};
