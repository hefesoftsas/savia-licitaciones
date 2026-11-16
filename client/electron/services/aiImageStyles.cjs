// Single source for AI illustration styles: content tools restrict style values here, and the image service appends the matching instructions.
const AI_IMAGE_STYLES = {
  realistic_photo: { label: 'Realistic photography', usage: 'sites, work and environments', hint: 'Use professional realistic photography, authentic materials and natural lighting, with restrained composition suitable for a technical bid.' },
  product_shot: { label: 'Equipment close-up', usage: 'physical objects and component details', hint: 'Use equipment product photography with a prominent subject, a clean simple background, and clear materials and details.' },
  architectural_render: { label: 'Architectural or site render', usage: 'site, campus and spatial overviews', hint: 'Use architectural and site visualization with clear spatial scale, natural light and a recognizable completed result.' },
  '3d_render': { label: '3D model render', usage: 'equipment and system structures', hint: 'Use a clean 3D model rendering with simple materials, soft lighting and clear relationships between volumes and components.' },
  isometric_illustration: { label: 'Isometric illustration', usage: 'layouts and spatial system relationships', hint: 'Use an isometric engineering illustration with clear structure, restrained consistent colors, and legible spatial and zoning relationships.' },
  cutaway_illustration: { label: 'Cutaway illustration', usage: 'sections, physical structure and principles', hint: 'Use a technical cutaway illustration showing internal construction through exposed shells or layers, with clear layers and connections.' },
  exploded_view: { label: 'Exploded view', usage: 'components and assembly', hint: 'Use an exploded view with components separated in assembly order and clear assembly relationships.' },
  line_drawing: { label: 'Technical line drawing', usage: 'processes, structures and operations', hint: 'Use a clean monochrome technical line drawing with consistent lines and clearly visible important details.' },
  flat_illustration: { label: 'Flat vector illustration', usage: 'concepts and comparisons', hint: 'Use flat vector illustration with simple colors, abstract shapes and clear relationships between subjects.' },
};

// Append instructions for known styles; omit a default when unspecified to avoid overriding the prompt's visual design.
function buildImageStylePrompt(prompt, style) {
  const hint = AI_IMAGE_STYLES[style]?.hint;
  return `${prompt}\n\n${hint ? `${hint}\n` : ''}Avoid brand logos, watermarks, exaggerated marketing elements and unrelated text.`;
}
module.exports = { AI_IMAGE_STYLES, buildImageStylePrompt };
