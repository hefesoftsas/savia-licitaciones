import {createManagedWorkspace} from './managed-workspaces.mjs';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fillTemplateValues } from './template-values.mjs';
import { imageReferences } from './desktop-assets.mjs';

const require = createRequire(import.meta.url);
const requireClient = createRequire(new URL('../client/package.json', import.meta.url));
const { createTechnicalPlanExport, templateChapterIds } = require('../client/electron/services/technicalPlanExport.cjs');
const { createOpenXmlHelperService } = require('../client/electron/services/openXmlHelperService.cjs');
const { normalizeExportFormat } = require('../client/electron/services/exportFormatDefaults.cjs');

export function resolvePackagedHelper(root, platform = process.platform, arch = process.arch) {
  const candidate = join(root, 'client', 'vendor', 'openxml-tools', `${platform}-${arch}`, platform === 'win32' ? 'openxmlhelper.exe' : 'openxmlhelper');
  return existsSync(candidate) ? candidate : undefined;
}

// Web plans persist section bodies in the snapshot; the desktop exporter expects
// AI sections in an agent workspace file. Render saved bodies through its
// Markdown path without changing the stored content mode.
function prepareWebOutline(nodes) {
  return nodes.map(node => ({ ...node, ...(node.content_mode === 'ai-generate' && !node.children?.length && String(node.content || '').trim() ? { content_mode: 'manual-fill' } : {}), ...(node.children ? { children: prepareWebOutline(node.children) } : {}) }));
}
function referencedAssets(nodes, result = new Set()) {
  for (const node of nodes) { if (node.children?.length) referencedAssets(node.children, result); else for (const item of imageReferences(node.content || '')) result.add(JSON.stringify([item.kind, item.reference])); }
  return result;
}

/** Assemble the desktop Word format in an isolated local runner workspace. */
export async function exportTechnicalPlan(snapshot, { language = 'es', tempRoot = tmpdir(), executablePath, signal, createHelper = createOpenXmlHelperService } = {}) {
  if (!Array.isArray(snapshot?.outline) || !snapshot.outline.length) throw new Error(language === 'en' ? 'The plan has no chapters.' : 'El plan no tiene capítulos.');
  signal?.throwIfAborted();
  const directory = await createManagedWorkspace(tempRoot,'word');
  const app = { isPackaged: false, getPath: () => directory };
  const selectedExecutable = executablePath || resolvePackagedHelper(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  let helper;
  const cancel = () => { void helper?.close().catch(() => {}); };
  try {
    helper = createHelper({ app, executablePath: selectedExecutable, configStore: { load: () => ({ language }) } });
    signal?.addEventListener('abort', cancel, { once: true });
    signal?.throwIfAborted();
    const service = createTechnicalPlanExport({ openXmlHelperService: helper });
    const planAssets = new Map((snapshot.planAssets || []).map(asset => [JSON.stringify([asset.kind, asset.reference]), asset]));
    const resolveImage = ({ kind, reference }) => {
      const asset = planAssets.get(JSON.stringify([kind, reference]));
      if (asset) return { buffer: Buffer.from(asset.bytes), type: ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' })[asset.contentType] };
      return kind === 'agent' || /^savia-asset:\/\//i.test(reference) ? null : undefined;
    };
    const convertWebp = async buffer => {
      const image = requireClient('sharp')(buffer);
      const metadata = await image.metadata();
      if (metadata.pages > 1) throw new Error(language === 'en' ? 'Animated WebP images cannot be exported.' : 'No se pueden exportar imágenes WebP animadas.');
      return image.rotate().png().toBuffer();
    };
    const result = await service.build({ project_name: snapshot.projectTitle, outline: prepareWebOutline(snapshot.outline),
      export_format: normalizeExportFormat(snapshot.exportFormat), export_template_scope: 'document', workspaceDir: directory, resolveImage, convertWebp, bidTemplate: snapshot.bidTemplate ? fillTemplateValues(snapshot.bidTemplate, snapshot.templateValues || {}) : undefined, bidTemplateChapterIds: snapshot.bidTemplate ? templateChapterIds(snapshot.bidTemplate) : [] }, { locale: language, stats: {} });
    signal?.throwIfAborted();
    return { bytes: result.buffer, warnings: result.warnings };
  } finally {
    signal?.removeEventListener('abort', cancel);
    try { if (helper) await helper.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
}

export function createWordExportHandler({ convert = exportTechnicalPlan } = {}) {
  return async (payload, context) => {
    context.signal?.throwIfAborted();
    let snapshot = await context.getPlanContext();
    const references = referencedAssets(snapshot.outline || []), assets = (snapshot.assets || []).filter(asset => references.has(JSON.stringify([asset.kind, asset.reference])));
    if (assets.length) {
      const planAssets = [];
      for (const asset of assets) { try { planAssets.push({ ...asset, bytes: Buffer.from(await context.getPlanAsset(asset.id)) }); } catch (error) { if (error?.status !== 404) throw error; } }
      snapshot = { ...snapshot, planAssets };
    }
    if (snapshot.hasTemplate) snapshot.bidTemplate = Buffer.from(await context.getBidTemplate());
    const result = await convert(snapshot, { language: payload.language, signal: context.signal });
    await context.getPlanContext();
    context.signal?.throwIfAborted();
    const artifact = await context.uploadArtifact(result.bytes);
    return { artifactId: artifact.id, warnings: result.warnings };
  };
}
