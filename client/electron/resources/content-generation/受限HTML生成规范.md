# Restricted HTML specification for bid body content

Write each section as one UTF-8 HTML fragment. Do not output Markdown, code fences, html/head/body wrappers, explanations or an outer section heading. The outline supplies the heading; do not use h1–h6 in the section body.

Do not use LaTeX syntax, including $...$, $$...$$, \(...\), \[...\], or commands such as \frac, \text and \circ. Express formulas, parameters and units with plain text, Unicode mathematical symbols and restricted HTML <sup>/<sub>, for example 22 ℃ ± 2 ℃, 40%–65% and ≥30 m<sup>3</sup>/(h·person). Convert LaTeX from source materials while preserving the values, units and meaning.

## Basic blocks

- Put `<!-- savia:block -->` on its own line before every top-level block, with a blank line between blocks.
- Top-level elements are only p, ol, ul, figure and table. Each has a unique id starting with an English letter and containing only English letters, digits, underscore or hyphen, at most 64 characters. Use a section-number prefix to avoid duplicate IDs across sections, for example s_1_2_p001.
- Inline elements are only strong, em, u, sup, sub and br. Lists use li; ordered lists may use start.
- Do not use div, section, style, class, CSS, scripts, SVG, width, height, color, alignment or pagination attributes. Font, paper and spacing come from the selected template configuration.
- Paragraphs may use unnumbered bold lead-ins. Ordered lists are only for sequences such as steps, processes or chronological order.

```html
<!-- savia:block -->
<p id="s_1_2_p001"><strong>Implementation:</strong> Describe concrete measures for the current project.</p>

<!-- savia:block -->
<ul id="s_1_2_ul001"><li>First measure.</li><li>Second measure.</li></ul>
```

## Data tables

Post-processing exception: when the user selects no tables (table_requirement=none), after the consistency audit convert every data table, including original-plan tables, to paragraphs or lists, preserving all data, header relationships, units, conditions and notes. Preserve imageText, threeImages and fourImages image tables as complete blocks. This exception applies only during table removal and does not change preservation rules during generation, word adjustment or audit.

For new tables follow this section’s table.needed: false means no new data tables; true permits tables serving table.purpose only when planning permits and they improve the information. Do not add tables merely for visual variety. Preserve data and meaning of original restored tables as restricted HTML regardless of this flag; resolve conflicts in favor of global facts.

- Set table data-sv-preset to plain, headerRow, headerColumn or headerRowAndColumn.
- Use caption for the title, thead/tbody containing tr, and tr containing th/td.
- Use th scope="col" for the first header row and th scope="row" for the first header column.
- Cells may contain text, inline elements, paragraphs or lists; do not nest data tables. rowspan/colspan must be positive integers. Avoid long passages in a single cell.

```html
<!-- savia:block -->
<table id="s_1_2_tbl001" data-sv-preset="headerRow">
  <caption>Stage deliverables</caption>
  <thead><tr><th scope="col">Stage</th><th scope="col">Deliverable</th></tr></thead>
  <tbody><tr><td>Preparation</td><td>Plan and responsibilities</td></tr></tbody>
</table>
```

## Image generation and references

Follow image_requirements in 正文编排决策.json for new images. In no-image mode do not add images, placeholders or call image tools. <!-- @if ai -->The AI image percentage is a planning target for the whole batch;<!-- @endif --> neither each section nor the document must use every available method. <!-- @if html -->HTML images follow the user’s allowed types.<!-- @endif --> Consult 配图类型对照表.md according to the content and structure of each new image, using only the listed methods. If no type matches, prefer the method for a similar purpose and structure; <!-- @if ai -->if still unclassifiable, generate an AI image.<!-- @endif --><!-- @if !ai -->if still unclassifiable, do not add that image.<!-- @endif -->

<!-- @if ai -->
In image mode, plan for the 60% AI-image target in image_requirements for this batch. Before parallel writing, the main agent looks for subjects suited to physical objects, scenes, outcomes, structures, processes and operations, then selects each layout, purpose, image type and method. For accurate processes, logic and data follow the guide rather than changing methods to meet the percentage. The target does not apply in no-image mode.

Count actual new images: single and imageText contain one each, threeImages contains three, and fourImages contains four. Exclude original-plan images from numerator and denominator. The 60% is a whole-batch planning target, not a cap, an exact requirement or a per-section target; keep layout quotas and do not add images to reach the percentage. Pause and retry retain the plan and count completed new images; partial generation counts only the current batch and single-section editing does not backfill the full-document ratio.

For diversity, specify each new AI image’s type from the guide, subject, viewpoint (close-up, medium, wide, aerial, isometric, cutaway, etc.) and visual form (see style under image tools). Vary all four throughout the document. Avoid mostly showing staff at desks or sites; management and coordination can show equipment, systems, spaces, object details or results. Do not repeat the same combination in adjacent sections. Use one visual form within a group and multiple appropriate forms across the document. This affects content only, not percentage or quotas.
<!-- @endif -->

正文编排决策.json supplies this batch’s image_layout_quota: total_groups is the total; single, imageText, threeImages and fourImages are separate quotas. The main agent allocates groups to target sections before parallel writing and specifies each section’s layout, group count, purpose, image type and generation method ({{generations}}). Parallel writers execute their own assignments; do not change methods, assume or redistribute quotas<!-- @if ai --> or independently meet the AI percentage<!-- @endif -->. A section without an assigned layout gets no new image. Quotas apply only to this batch; later single-section edits follow the user request without reallocating full-document quotas.

image_needed indicates whether a section can receive new images: false means no new image; true means it can receive a main-agent assignment. image_suitability_score is a 0–10 suitability score used to select suitable sections, not cancel quotas. Multiple groups may be assigned to suitable sections; do not require exactly one group per selected section or impose an image limit per section. Follow each layout’s separate group quota, without exchanging quotas or splitting groups into other layouts. Group images share a theme but convey different information. <!-- @if ai -->AI images within a group must differ clearly in subject or viewpoint; for sequential steps vary both, such as overview, component close-up, terminal/instrument detail and completed result. Do not simply change the action in identical compositions.<!-- @endif --> Choose layout and generation method separately; use the guide for the method.

Parallel writing produces only assigned new image layouts and restricted HTML structures, including generation method, purpose, alt text and necessary captions; do not add asset references yet. The main agent generates images within this session and applies the returned asset_ref using apply-section-images; original images use provided references. Pause or retry retains quotas and completed layouts and fills only unfinished work. After all parallel writing and image generation, the main agent checks quotas, group content, image references and generation distribution before checking words<!-- @if ai -->; the AI percentage is a planning target, and deviation does not add a failure condition or require extra images<!-- @endif -->.

These quotas and image_needed apply only to new images. Reuse original images from restored_content.images with their asset_ref, order and correspondence to table text, without regeneration. They are exempt from no-image mode and consume no new-image layout quotas. Original images use complete figure, template, img and caption structure, data-sv-generation="original", and one nonempty template data-sv-role="prompt" stating “复用原方案图片，不重新生成”, optionally with a description. Original identity and path come from restored_content.images. A figure may preserve an original image in an original table cell.

Every img in final body content must have data-sv-asset-ref set to the workspace-relative asset_ref returned by the image tool or provided for the original image, such as 图片/xxx.png or 原图/xxx.png. Do not write src, absolute paths, remote URLs or base64, or invent image files. Complete every image reference in every group before submitting the result manifest.

- Every figure, including originals, requires a unique id and valid data-sv-generation and data-sv-size.
- Close every non-void element. Close every figure with </figure>; img must be its direct child and not wrapped in strong, a or other elements. Do not put a figure inside a paragraph, list item or inline element. Incomplete structures will not be saved.
- New image data-sv-generation values follow the guide: {{kind_mapping}}. Use generate-section-images with corresponding kind ({{kinds}}). Type and actual tool must agree. Originals use original and no generation tool.
- data-sv-size is the document frame, not the image-service size: square=1:1, wide=3:2 landscape, tall=3:4 portrait, panorama=16:9 landscape.
- data-sv-fit="contain" preserves the whole image without cropping; "cover" fills the frame and may crop. Omitted fit defaults to cover in Word conversion. Explicitly use contain for diagrams, infographics and original images that must remain complete. Use cover for realistic scenes only when edge cropping is acceptable.
- Each figure contains exactly one nonempty template[data-sv-role="prompt"]. For new images describe purpose, main objects and relationships, and text or data if needed; do not embed drawing source. <!-- @if ai -->For AI images describe subject, visible elements, viewpoint and composition, environment and light positively, with distinctive visual details and the visual form name. Do not invent numeric values, models, brands, organization names or readable text; describe illustrative shape, materials, space and lighting concretely without stacking negative constraints.<!-- @endif --> Original image templates explain reuse. Every figure has one img with nonempty alt; independent figures and images in groups have figcaption.
- Connect image blocks with body text instead of stacking them. Do not copy the template’s example images.

<!-- @if html -->
```html
<!-- savia:block -->
<figure id="s_1_2_fig001" data-sv-generation="htmlImage" data-sv-size="wide" data-sv-fit="contain">
  <template data-sv-role="prompt">Project implementation stages and handoffs.</template>
  <img alt="Implementation stages and handoffs" data-sv-asset-ref="图片/实施阶段.png">
  <figcaption>Implementation stages and handoffs</figcaption>
</figure>
```
<!-- @endif -->
<!-- @if mermaid -->
```html
<!-- savia:block -->
<figure id="s_1_2_fig002" data-sv-generation="mermaid" data-sv-size="wide" data-sv-fit="contain">
  <template data-sv-role="prompt">Quality issue handling from discovery and registration to corrective action and closure.</template>
  <img alt="Quality issue handling flowchart" data-sv-asset-ref="图片/质量问题处理流程.png">
  <figcaption>Quality issue handling</figcaption>
</figure>
```
<!-- @endif -->
<!-- @if ai -->
```html
<!-- savia:block -->
<figure id="s_1_2_fig003" data-sv-generation="aiImage" data-sv-size="wide" data-sv-fit="cover">
  <template data-sv-role="prompt">Equipment racks and cable trays in a server room, visible indicators and floor markings, medium eye-level composition, cool white overhead lighting; realistic photography.</template>
  <img alt="Installed server room equipment" data-sv-asset-ref="图片/机房设备.png">
  <figcaption>Installed server room equipment</figcaption>
</figure>
```
<!-- @endif -->

A single image uses an independent figure that conveys its own purpose with a short caption. imageText is a one-row, two-column table with one figure on the left and explanatory text on the right. threeImages has one row of three figures; fourImages has a two-by-two grid. The left image in imageText may omit figcaption; all other images require captions. A group shares a frame size; its table has caption and no thead, merged cells or nested tables. Complete each asset reference.

Original image reuse example (asset_ref must come from this section’s original mapping):

```html
<!-- savia:block -->
<figure id="original_fig_001" data-sv-generation="original" data-sv-size="wide" data-sv-fit="contain">
  <template data-sv-role="prompt">复用原方案现场图片，不重新生成。</template>
  <img alt="Site image" data-sv-asset-ref="原图/xxx.png">
  <figcaption>Site image</figcaption>
</figure>
```

## Image inventory and applying references

After saving layouts, the main agent calls list-section-images for the current target inventory; do not write a scanning script. It includes section, figure ID, method, frame, prompt, caption and current reference. image_id combines section and figure IDs and must be passed unchanged. Different sections may share figure IDs, but each section’s IDs must be unique. Reuse valid images. reused_original marks originals: reuse only and repair missing references. If structure or prompts need correction, read and edit the body and re-extract; section_ids may refresh only affected sections.

After status=success, write items needing application to 任务/图片回填.json and call apply-section-images. Each supplies image_id, returned asset_ref, and the original inventory asset_ref as previous_asset_ref (empty string if absent). The program rereads the body and modifies only img data-sv-asset-ref, saving per section while preserving all other text, comments, line breaks and group layouts. This is not an image-generation tool: submit only successful images and never drawing source. If an application error occurs within a section, none of that section’s items are written; other successful sections remain. Fix errors and refresh the inventory if references changed. Resubmitting identical references is idempotent. After pause, reuse successful outputs from the latest inventory. Do not apply images after full-document image protection starts; single-section edits affect only their target.

## Image tools

Write this batch’s new image requests to 任务/配图生成.json as {"images":[…]}, then call generate-section-images. Large task files may be written in multiple operations: use write first, edit afterwards, and keep valid complete JSON after every write. Each entry has inventory image_id, kind ({{kinds}}) and prompt. Valid existing images are skipped; set "regenerate": true to replace an image, but never regenerate original-plan images. The program submits all entries to appropriate queues and automatically queues overflow<!-- @if html,mermaid -->; each source is sent for local rendering as soon as it is ready without waiting for other images<!-- @endif -->. Progress is reported per item; submission returns counts and unresolved items. Match image_id to body images and inspect status, stage, error<!-- @if html,mermaid -->, source_file<!-- @endif --> and asset_ref. Successful images are applied directly; error/cancelled means failed or unfinished<!-- @if html,mermaid -->; saved source alone does not mean an image is complete<!-- @endif -->.

<!-- @if ai -->- AI images: kind=ai. size is required: read each figure’s data-sv-size and choose a concrete matching size for square=1:1, wide=3:2, tall=3:4 or panorama=16:9; the current gpt-image-2-1k tall size is the verified 768x1024. style is required and follows the template’s visual form: realistic_photo, product_shot, architectural_render, 3d_render, isometric_illustration, cutaway_illustration, exploded_view, line_drawing or flat_illustration. Do not describe a conflicting style; the program adds brand, watermark and unrelated-text restrictions. Optional title is a short image name. Never use frame names like tall as the size, omit size, or default all images to square. Preserve the same ratio and orientation in prompt. If the service rejects a size, fix the item rather than retrying without size. Service output pixels may differ from requested pixels. Returned asset_ref points to the workspace copy.<!-- @endif -->
<!-- @if html -->- HTML images: kind=html and frame_size must match the body frame. Supply type, purpose, accurate content and data in prompt, not just a path or a request to search; parallel models do not have main-session context. Source is saved under a new file in 图片/ and rendered automatically. Repair and render unfinished items with source_file rather than regenerating source; retry generation only when no source exists.<!-- @endif -->
<!-- @if mermaid -->- Mermaid images: kind=mermaid. Supply type, purpose, accurate content and data in prompt, not just a path or a request to search; parallel models do not have main-session context. Source is saved under a new file in 图片/ and rendered automatically. Repair and render unfinished items with source_file rather than regenerating source; retry generation only when no source exists.<!-- @endif -->

<!-- @if html -->- HTML repair: the first generation renders automatically. To retry based on tool feedback, write source entries to images in 任务/HTML转图.json and call render-html-image. Each requires image_id, source_file and frame_size matching the figure. Source can use html/head/body, style, div and SVG and is separate from restricted body HTML; no external resources. Fixed design sizes: square=1240×1240, wide=1240×827, tall=1240×1653, panorama=1240×698. Use body as canvas; program-set dimensions include 40px padding on all sides, so square content area is 1160×1160. Preserve body Flex/Grid without another wrapper or repeated margins. Use title and main areas together, distributing remaining height with Flex/Grid and balancing cards, nodes and graphics instead of large blank space below. Use a restrained professional palette, consistent fonts and lines, coordinated spacing, and text of at least 24px. Do not use meaningless text, stretched graphics, empty cards or global shrinking to fill space. The program renders fixed dimensions at 2× pixels and does not enlarge screenshots to scroll height; content must remain within the padding and canvas. Match each result by image_id, inspect status and error, correct and retry as instructed, and use the returned image reference on success.<!-- @endif -->
<!-- @if mermaid -->- Mermaid repair: initial generation saves a .mmd file and renders it automatically. For repair or retry, put source entries in images in 任务/Mermaid转图.json and call render-mermaid-image. Each requires image_id and source_file; match by image_id and inspect status and error. Use flowchart for flowcharts, mindmap for mind maps and erDiagram for entity relationships. Handle labels in the proposal language correctly; keep nodes and links clear and avoid overcrowding. Modify source and retry syntax or render errors.<!-- @endif -->

<!-- @if html,mermaid -->Render tools read images from their task files and skip already valid images. They only render locally through existing queues; overflow is queued and no model is called to write or fix source. On failure, read and modify the relevant source based on feedback, resubmit only failed or incorrect items, and preserve other successes. Keep source files and use returned paths; after success apply asset_ref to img via apply-section-images.<!-- @endif --> On pause the tool waits for the batch to exit and returns completed images<!-- @if html,mermaid -->, saved sources<!-- @endif --> and unfinished status to the same session. On resume compare the session results and latest inventory, reuse successful images, <!-- @if html,mermaid -->repair or render items with source and submit items without source<!-- @endif --> for generation. Completed images are skipped on resubmission. Complete only missing or incorrect items. Image generation happens within the current body-agent session.

## Template and word count

正文模板.html is a structural reference and 所选模板配置.json contains the user’s formatting. Choose paragraph, list and table structures appropriate to the content; do not require every element in every section or copy sample body text.

The sample shares the template settings page and includes h1–h6 for showing heading styles; those are not body-generation requirements. Section content must still avoid h1–h6 and outer section titles. Sample images only demonstrate layout, prompt and captions; their references are removed. Do not copy their captions or prompts. Generate content appropriate to the section and illustration requirements and use real tool-returned references.

Word requirements are in 正文编排决策.json. Count readable body text, excluding HTML tags and image-purpose text in template elements. The document-wide target is not a per-section target. The main agent uses word_control.checkTotalWords to decide whether to check total limits: false means count only current target sections and do not expand or shorten them to meet document-wide limits. Parallel writers follow explicit section word requirements and do not independently assume the whole-document target.

When this section has restored_content, check its entire draft and follow restoration_requirements: the main agent reads the specified draft, and parallel writers check the full draft provided in their requests. Organize it as restricted HTML for the current project, section responsibilities and writing focus. Preserve substantive content, original tables and original images; do not replace information that must be retained with rewritten content. Resolve conflicts in favor of global facts. If the draft exceeds its section word target or existing document content exceeds the total maximum, organize only, without expansion or deleting substance merely to reduce length. Otherwise expand appropriately under existing requirements. Unset word targets do not participate in the comparison. Sections without drafts follow the normal generation flow and do not borrow other sections’ materials.
