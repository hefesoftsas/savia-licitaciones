import templateZhHtml from '../../../electron/resources/content-generation/正文模板.html?raw';
import templateEsHtml from '../../../electron/resources/content-generation/正文模板.es.html?raw';
import templateEnHtml from '../../../electron/resources/content-generation/正文模板.en.html?raw';
import standardQualityControlUrl from '../../../assets/content-template-preview/standard-quality-control.webp';
import visualMasterPlanSceneUrl from '../../../assets/content-template-preview/visual-master-plan-scene.webp';
import visualQualityClosedLoopUrl from '../../../assets/content-template-preview/visual-quality-closed-loop.webp';
import visualTechnicalArchitectureUrl from '../../../assets/content-template-preview/visual-technical-architecture.webp';
import visualWbsMindmapUrl from '../../../assets/content-template-preview/visual-wbs-mindmap.webp';

/** Sample image URLs in the shared template, replaced with Vite-bundled local assets for preview. */
const previewImages: Record<string, string> = {
  'assets/standard-quality-control.webp': standardQualityControlUrl,
  'assets/visual-master-plan-scene.webp': visualMasterPlanSceneUrl,
  'assets/visual-quality-closed-loop.webp': visualQualityClosedLoopUrl,
  'assets/visual-technical-architecture.webp': visualTechnicalArchitectureUrl,
  'assets/visual-wbs-mindmap.webp': visualWbsMindmapUrl,
};

/** All languages share original sample markup; only preview image URLs are inserted, preserving body structure. */
const displayTemplateSources: Record<'zh' | 'es' | 'en', string> = {
  zh: templateZhHtml,
  es: templateEsHtml,
  en: templateEnHtml,
};

function resolveDisplayTemplateHtml(language: 'zh' | 'es' | 'en'): string {
  const source = displayTemplateSources[language] ?? displayTemplateSources.zh;
  return Object.entries(previewImages).reduce(
    (html, [assetRef, url]) => html.replaceAll(`src="${assetRef}"`, `src="${url}"`),
    source,
  );
}

/** Preview sample follows UI language with Chinese fallback; export still uses the original Chinese sample. */
export function getDisplayTemplateHtml(language: 'zh' | 'es' | 'en'): string {
  return resolveDisplayTemplateHtml(language);
}

/** Original Chinese export sample with preview image URLs inserted and body structure preserved. */
export const DOCUMENT_DISPLAY_TEMPLATE_HTML = resolveDisplayTemplateHtml('zh');
