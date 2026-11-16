> [中文原文](开发说明.md) | [English](DEVELOPMENT.en.md) | [Español](DEVELOPMENT.es.md)

---
name: Open XML Helper Development Notes
about: Documents the process model, signal protocol, task directories, and packaging constraints for collaboration between openxmlhelper and the Electron Main process; not a feature-completion log.
---

# Open XML Helper Development Notes

This document is for developers working on the Word / Open XML helper or on the Main side that integrates with it. Actual behavior is defined by the current code; this document only records stable boundaries.

## Positioning

- The repository-root `openxmlhelper/` directory is a standalone .NET 10 console app that does Word / Open XML work for the Electron Main process.
- The Renderer never connects to the helper directly and does not go through preload.
- The main program calls it via `openXmlHelperService.runJob`; Agents call the same set of actions via the dedicated Pi tool `openxml`. Do not put the helper exe on PATH.

## Processes

- It stays resident for a long time and runs only one task at a time. The Main process lazily starts it on the first task submission and kills it on application exit.
- The only startup argument is the workspace root path: `openxmlhelper --workspace <userData/workspace>`.
- The helper does not allocate task-number directories; numbers are allocated by Main.

## Communication

The pipe only carries "start work" and "done". stdin / stdout each carry one line of UTF-8 JSON per message, no BOM, newlines use only `\n` (also on Windows). Do not stuff document body text into the pipe.

Main → helper:

```json
{"v":1,"type":"run","job":"20260819153000-ab12"}
```

Helper → Main:

```json
{"v":1,"type":"done","job":"20260819153000-ab12","ok":true}
```

- `job` only allows letters, digits, `.`, `_`, `-`, to prevent path traversal.
- Failures also only reply `ok:false`. The cause is written to `result.json` in the task directory.
- Unparseable signals are written to stderr; the process does not exit.
- When the helper is busy, later-submitted tasks get a failure result written and a `done` reply.
- There is no shutdown signal; exit relies on Main killing the process.

## Task directories

Both sides read and write files themselves and do not pass content through the pipe.

`workspace/openxml-jobs/<job>/`

| File | Written by | Meaning |
|---|---|---|
| `request.json` | Main | Contains at least `action` |
| `result.json` | Helper | Contains at least `ok`; on failure also `error` |

Convention: finish writing all inputs before sending `run`; finish writing `result.json` before sending `done`.

Current actions:

```json
{"action":"ping"}
```

```json
{
  "action": "list-blocks",
  "sources": ["technical-plan/tender-originals/xxx.docx"]
}
```

`list-blocks` writes `blocks.json` in the task directory, listing each block's sequence number, type, whether it is a heading, and a preview of the original text.

```json
{
  "action": "extract-chapters",
  "sources": ["technical-plan/tender-originals/xxx.docx"],
  "chapters": [{"id":"1","title":"施工组织设计","sourceTitle":"第五章 施工组织设计"}],
  "output": "technical-plan/bid-template.docx"
}
```

`extract-chapters` extracts chapters based on the original-document headings or block ranges given by the Agent: only original headings with `heading=true` may use `sourceTitle`; non-heading styles must provide both `startBlock` and `endBlock`, and the helper will not automatically infer end boundaries for incomplete block ranges or non-heading blocks. `title` is only the chapter name used in the template; extraction fails when there is no valid original-document定位 (location).

After successful extraction, a sidecar `.chapters.json` file with the same base name is written next to the output DOCX, e.g. `technical-plan/bid-template-source.chapters.json`. The file format is `{version:1,chapters:[{id?,title,start_block,end_block}]}`; block numbers are 0-based indexes in the target DOCX body, `start_block` is inclusive and `end_block` is exclusive. Field scanning uses it to identify the chapter each candidate belongs to; scanning fails and asks to re-extract chapters when the file is missing or invalid.

```json
{
  "action": "scan-template-fields",
  "input": "technical-plan/bid-template-source.docx"
}
```

`scan-template-fields` writes a single-line compact `template-field-candidates.json` in the task directory, whose top level contains `version`, `default_suggested_fill_by`, deduplicated `contexts` and `candidates`. Each `contexts` entry contains a `context_id` and provides `chapter_name`, `table_title`, `column_header`, `group_title` based on actual content; candidates reference contexts via `context_id` and provide 1-based `row_number`, `column_number` as needed. Table column numbers are computed on the logical grid expanded by `gridBefore` / `gridSpan`; empty fields are not emitted; candidates without their own `suggested_fill_by` use the top-level default. Non-table candidates emit their original location as needed, table candidates use structural context plus row/column定位 (location), and the internal original location still participates in computing the stable `candidate_id`. Candidates are only for the generic template Agent to classify, not the final business field list.

```json
{
  "action": "apply-template-fields",
  "input": "technical-plan/bid-template-source.docx",
  "output": "technical-plan/bid-template.docx",
  "fields_output": "technical-plan/bid-template-fields.json",
  "fields": [
    {"candidate_id":"c_xxx","name":"投标人名称","fill_by":"ai"},
    {"candidate_id":"c_yyy","name":"法定代表人签字","fill_by":"manual"}
  ],
  "ignored_candidate_ids": ["c_zzz"]
}
```

`apply-template-fields` requires every candidate to fall into exactly one of `fields` or `ignored_candidate_ids`. The helper re-scans the source template and writes `w:sdt` at candidate positions: the business ID is stored in `w:tag=savia:field:<id>`, the field name in `w:alias`; both AI-filled and manual fields use light-red background `FCE8E6` and black text `000000`. The final outputs are `bid-template.docx` plus a slim field JSON; the same `name` may map to multiple different IDs.

The example above is the internal request between Main and the helper. When an Agent uses `openxml`, it only passes `{"action":"apply-template-fields","fields_file":"投标模版字段分类.json"}`; the classification file's top level contains complete `fields` and `ignored_candidate_ids`. The normal path is to call this action right after `write` finishes the classification file, without running extra Bash or script pre-checks. The Pi tool first reads the UTF-8 file and performs JSON/Ajv structural validation; the helper then re-scans the source template, checks candidates for omissions, duplicates, overlaps, or invalid entries, and checks consistency of `fill_by` and same-name fields. After writing content controls, it runs Open XML and artifact validation. On failure, the Agent fixes the same complete classification file and retries based on the tool error; once application succeeds and artifact checks pass, the program ends the template-extraction task directly.

```json
{
  "action": "insert-body-html",
  "input": "technical-plan/template.docx",
  "target_id": "technical-plan",
  "image_max_width_percent": 90,
  "html": "<!-- savia:block -->\n<p id=\"p_001\">正文内容</p>\n<!-- savia:block -->\n<figure id=\"fig_001\" data-sv-generation=\"htmlImage\" data-sv-size=\"wide\"><template data-sv-role=\"prompt\">配图提示</template><img alt=\"质量控制图\" data-sv-asset-ref=\"generated-images/quality.png\"><figcaption>质量控制图</figcaption></figure>"
}
```

`insert-body-html` converts restricted HTML of Savia (Savia) into Open XML blocks, and replaces in place the single block-level content control `w:tag=savia:body:<target_id>` in the Word file. The target must be a `w:sdtBlock`; run-level and table-cell-level content controls are not body-insertion positions. The action uses a temporary copy to complete conversion and Open XML validation, and only replaces the original file afterwards. `image_max_width_percent` is the global maximum width for standalone images; `figure` must use `data-sv-size=square|wide|tall|panorama`, and `img`'s `data-sv-asset-ref` must be a workspace-relative path; images are center-cropped into the preset frame with captions preserved, and the illustration prompt `template` is not written into Word.

```json
{
  "action": "blind-check-inspect",
  "source": "blind-check/source/<fileId>.docx",
  "profile": {"page": {}, "body": {}, "headings": {}, "table": {}, "structure": {}, "text": {}, "privacy": {}, "props": {}, "consistency": {}, "image": {}, "rules": {}},
  "sensitive_words": [{"text": "某某建设有限公司", "source": "credential"}],
  "image_facts": [{"part": "word/media/image1.png", "color": true, "color_ratio": 0.23}]
}
```

`blind-check-inspect` is the blind-bid compliance check (暗标合规检查), implemented in `BlindCheck/`. It only opens a copy of the docx in the workspace for reading: it locates parts directly via zip entries and relationship files, then reads with LINQ to XML, without going through the SDK's strongly-typed wrappers, so malformed hyperlink relationships cannot prevent the document from opening. `profile` is the complete preset normalized and default-merged by Main, with null meaning the item is not checked (not required by the tender documents): `BlindCheckProfile.Bool` distinguishes missing fields (fallback value used) from null (not checked), `body.allow_*` null means allowed, `table.allow_*` null means same as body text; `sensitive_words` are custom sensitive words from the preset plus company information from the credential library.

- Evaluation: fonts, font sizes, etc. resolve effective values via docDefaults → table style → paragraph style chain → character style chain → direct formatting. Theme fonts resolve theme1.xml, falling back via the Hans and other script tables when ea is empty. Font lookup goes slot by slot down the layers; a layer that only writes `w:hint` does not obscure lower layers. Paragraph-mark formatting `w:pPr/w:rPr` only applies to the paragraph mark, not to text-block evaluation. Known simplification: switch properties such as bold and italic take the highest-priority single layer and do not XOR across style layers; table styles only take top-level `pPr/rPr` and do not merge `w:tblStylePr` conditional formatting (first row, first column, banding, etc.). Fix writes explicit direct formatting, which is unaffected by these two points; deleting hidden text is the exception: when hidden text has no direct hidden setting but two or more style layers set hidden (`RunFormat.VanishStacked`), the switches may cancel each other and the text is actually visible — such text is only reported, not deleted, and left for manual handling.
- Headings: first look at TOC (TOC field or toc-style) entries, then heading styles and outline levels; only when there is no TOC, fall back to the first two levels of numbering such as "第X章 (Chapter X)" or "一、 (1.)". For a paragraph containing the TOC field start or end, when the text is entirely outside the field (e.g. "field-end + page break + heading text" in one paragraph), it counts as body text, not TOC; paragraphs styled with TOC styles outside fields only count as TOC when they appear in runs, preceded by a TOC title or with more than half ending in page numbers — occasional body paragraphs accidentally using TOC styles do not count.
- Scope: alignment and first-line indent only check body text; figure/table captions (within 40 characters, starting with "图/表/附图/附表 (Figure/Table/Supplementary Figure/Supplementary Table)" plus a number or punctuation, immediately adjacent to an image paragraph or table) and a standalone TOC title on its own line before the TOC (a short line ending in "目录/目次 (Contents)", `OutlineAnalyzer.IsTocTitle`) are excluded; line spacing and space before/after check headings too; bold, italic, underline, color, highlight, and text shading check table text too, and when tables have no separate rule they follow the body-text requirement. Table cell shading and page background color fall under "no color allowed", only checked when colored body text is disallowed; charts, SmartArt, and shapes are judged by fill and line colors (including style defaults and chart auto-colors), vector graphics prompt manual confirmation. English punctuation, extra spaces, manual line breaks, columns, and consistency rules do not come from the tender documents and are always low-risk suggestions.
- Heading numbering: `structure.heading_numbering` arabic checks each heading's numbering — auto numbering by numbering.xml's numbering format and level (`NumberingFormats`, including lvlOverride and isLgl, without expanding numStyleLink), handwritten numbering by leading "1、", "1.1", etc. at the start; non-Arabic numerals or level mismatching the heading level are medium risk, missing numbers are low risk, headings before the first numbered heading are treated as the document's overall title and not reported; headings identified only via numbering-style fallback are only compared for Arabic numerals, not levels. Line-break characters embedded directly in text (rendered as spaces in Word) are described separately under the manual-line-break check.
- Rules: 64 rules total, categorized by privacy / structure / image / page / paragraph / font / text / table / consistency. A single failing rule does not interrupt; errors are written to `rule_errors`. Results are grouped by "rule + severity + conclusion + whether candidate", keeping 6 samples covering head/tail distribution per group, plus up to 200定位 (location) entries in document order with paragraph numbers (`items[].locator`) for AI review. Severity levels are high / medium / low; preset `rules.<id>.enabled / severity` can override individual rules.
- Candidate issues (`candidate`): issues that rules can only pre-screen and whose final verdict requires AI review. Entire consistency rules are candidates (`RuleSpec.Candidate`); company names identified by suffix, form field names, suspected bank account numbers, and placeholders are candidates (`Finding.Candidate`), while sensitive words, self-identification, contact info, and ID numbers are deterministic findings. Candidates and non-candidates are grouped separately.
- Paragraph numbers (`DocumentModel.Locators`): body `p{number}`, tables `t{table}.r{row}.c{col}` (append `.{index}` for multiple paragraphs in one cell), headers/footers `hdr{n}.{k}` / `ftr{n}.{k}`, footnotes/endnotes `fn.{k}` / `en.{k}`, text boxes `tb{k}`. The same file models to the same numbers every time; inspection results, tender-structure export, and Agent edits all use them for定位 (location).
- Consistency rules (`ConsistencyRules`) only act as fallback when the corresponding preset item is null (not checked): same-level headings and body text use majority-vs-minority, body Chinese fonts only count Chinese text blocks; heading numbering only looks at handwritten numbers, groups by parent heading, and only reports skipped or duplicate numbers. Nine fine-grained items — section page setup, snap-to-grid, superscript/subscript, table alignment, merged cells, named bookmarks, half-width parentheses, full-width digits, full-width letters — are controlled by preset switches and off by default.
- Cover and handwritten TOC: with `structure.skip_cover` (on by default), body content from the start to the first page break or section break that has no headings or tables and is within 15 paragraphs / 300 characters is treated as the cover, excluded from body formatting rules, while identity information and hidden text are still checked and statistics return `cover_paragraphs`. Hidden text (`text.hidden`, `AllRegions`) covers all regions: body, tables, cover, TOC, headers/footers, footnotes/endnotes, and text boxes are all checked, and fixes delete region by region; font-size checks do not distinguish East Asian vs. Western scripts, and standalone numbers/Western text also follow body font-size requirements. Without a TOC field, 3+ consecutive "handwritten TOC" entries in the front whose text matches later headings (numbering-fallback "headings") are归入 (归入 (grouped into)) the TOC; numbering-fallback gives nominal levels that do not participate in heading-level-skip checks. Form field names (contact phone, company name, etc.) are only reported when followed by a colon or occupying a table cell alone.
- Headers/footers: page numbers are judged by `structure.page_number` (forbid means no page numbers; footer_only means page numbers may only appear in footers, all other footer content is reported; null means unlimited). Content is read paragraph by paragraph as display text, text-box content counts as in-box text, images count as "[图片 (image)]", tables count their text; visible paragraph borders (direct setting first, then along the paragraph style chain, nil/none count as none) count as "[横线 (horizontal line)]", and the Chinese Word "页眉 (Header)" style carries a bottom border by default, which remains even after the text is deleted; inspection and fix share `StructureRules.HeaderFooterMarks` for whether there is content; paragraphs containing only page-number fields count as page numbers, not content, so page-number text boxes inserted by WPS are not treated as images.
- Images: `ImageCatalog` collects images referenced by body, headers/footers, footnotes/endnotes by part, deduplicates by part, and locates them at the first paragraph where they appear; `ImageFormats` identifies format and dimensions by file header, reads author/copyright fields and GPS from EXIF / XMP / PNG text chunks, and extracts text from EMF (EXTTEXTOUT and EMF+ DrawString), WMF (TEXTOUT / EXTTEXTOUT, ANSI text decoded as GBK), and SVG for identity-information detection. Color judgment requires pixel decoding, which the helper does not do; Main samples and passes results via `image_facts`; statistics return `images / image_formats / vector_images` with the results.
- Progress is written to `progress.json` in the task directory as `{frac, label}`, first to a temp file then replaced; results are written to `blind-check-result.json` (snake_case naming), while `result.json` still only carries `ok/output`.

The Main side uses an independent `blind-check` helper process (`openXmlHelperService.runBlindCheck`), polling progress every 300ms for up to 10 minutes. After inspection ends or is cancelled, that process is terminated and the task directory deleted, to avoid an idle process holding memory from large inspection documents; the `close()` used by technical-plan reset does not affect it, and application exit ends it via `closeBlindCheck()`. Running `node --test scripts/check-blind-check.cjs` (client directory) verifies in a Chinese-temp-directory that inheritance has no false positives, various violations hit, anonymity, TOC-determined headings, consistency, image metadata and vector text, fine-grained rules, Excel export, cancellation, and 40k-paragraph performance.

```json
{
  "action": "blind-check-fix",
  "source": "blind-check/source/<fileId>.docx",
  "output": "blind-check/fixed/<fileId>.docx",
  "profile": {},
  "sensitive_words": [],
  "image_facts": [],
  "fix_rules": ["struct.doc_props", "font.size", "text.english_punct"]
}
```

`blind-check-fix` is the automatic blind-bid fix, implemented in `BlindCheck/Fix/`. It shares `BlindCheckSession` with inspection (open document, model, identify TOC titles and cover); the original file is untouched and results go to the workspace copy at `output`:

- Scheduling (`BlindCheckFixer`): instead of relying on already-merged samples from the inspection phase, it re-runs each rule's check function per paragraph and text block on the same model for the `fix_rules`, and only calls the fix when the check reports an issue. Rule switches, scopes, cover/TOC exclusions, and format targets (`TargetFor`) all match inspection.
- Writing: directly modifies XElements in the model. Attribute elements are inserted by `PropertyWriter` in schema order (rPr / pPr / sectPr / tcPr / numbering lvl), unrecognized extension elements are kept in place; closing formats write explicit off values (e.g. `<w:b w:val="0"/>`) so inherited-from-style formats can be turned off; when changing fonts, theme fonts in the same slot are removed. Punctuation, spaces, and special characters compute positions over whole-paragraph text, then map back to individual `w:t` via `DocumentModel.PieceText`.
- Structural: accept revisions (paragraph-mark deletions, deleted or merged-cell skips are written to `notes`); delete comments together with body anchors and comment extensions and comment-author lists; cancel external hyperlinks and delete relationships; delete identity-type fields wholesale; delete hidden text directly (hidden text from multi-layer style stacking is not deleted, see evaluation above); clear headers/footers and cover header lines with borderless overrides, keep paragraphs containing only page numbers when the preset allows page numbers (including page-number text boxes inserted by WPS), paragraphs kept with horizontal lines are likewise written borderless, images no longer referenced are removed from the package; page background color is deleted directly; text shading writes explicit "clear, auto" to override styles; empty paragraphs are only deleted when they have no numbering, contain no objects or bookmarks, are not cover, not required between tables, and have no page-break-before (direct or from style — deleting it would move following text to the previous page; inspection reports such paragraphs separately as "empty paragraphs with page-break-before"); empty paragraphs containing only one page break move the break to the end of the previous paragraph before deletion, keeping break count and pagination unchanged; when the previous block is a table, TOC, carries a section break, or the paragraph already page-breaks at the paragraph end (including blank pages left by consecutive breaks), no move is made; image metadata deletes JPEG APP1 / APP13 / COM segments and PNG text chunks.
- Manual line breaks (`TextFixes`): split paragraphs at `w:br`, `w:cr`, and embedded line-break characters in `w:t`; following paragraphs copy the original paragraph format, page-break-before stays only on the first paragraph and section breaks stay on the last, merged-back empty lines go to the previous paragraph, leading spaces of new paragraphs are removed; headings, numbered or text-box paragraphs, paragraphs containing fields, and breaks inside hyperlinks, revisions, and other wrappers are not split, written to `notes`. Splitting moves text blocks, so it runs after per-paragraph fixes.
- TOC (`TocFixes`, only effective when `structure.check_toc_present` is forbid): delete TOC fields (including display results, nested page-number fields, and content controls from the Word TOC gallery outside), field-identified TOC-style entries, handwritten TOCs starting with an "××目录 (×× Contents)" heading followed by 3+ consecutive lines all matching some later paragraph text (after removing dot leaders and page numbers), plus immediately adjacent TOC titles; handwritten TOCs identified only by dot leaders and page numbers without a TOC title are not deleted, written to `notes`. When the field end lands inside a body heading, only the field is deleted and the heading kept. Headings identified only via TOC without heading styles or outline levels get their TOC levels written as paragraph outline levels, so heading structure survives TOC deletion. After deletion, tidy the seam: keep only one page break between the two surrounding content blocks, preferring in order section breaks (move seam section breaks to the previous paragraph to avoid empty paragraphs occupying a whole page), the previous block's paragraph-end page break, the earliest break paragraph in the seam (it is also the cover-recognition boundary), the next block's paragraph-start page break; extra empty sections are deleted, and header/footer references carried over by later sections are patched to the next section; empty paragraphs that shared a page with the TOC are deleted together; when deletion removes pagination, add a page break at the end of the previous block; tables merged together after paragraph deletion get an empty paragraph inserted between them.
- Heading numbering (`HeadingNumberFixes`, shares `StructureRules.HeadingNumbers` with inspection): auto-numbered problematic headings get their lvl changed to decimal with isLgl, and numbering text rewritten to "%1.%2" with the same number of levels as the heading level (keeping the "、" suffix); when "level-index − heading-level" is inconsistent within the same abstract numbering, or the level is shared with body lists, no change is made. The first Arabic-numbered heading starts at 1, and same- or higher-level headings with other numbering before it are treated as overall titles with numbers removed; when no Arabic numbers exist at all, handwritten numbers expanding level by level from level 1 with consistent same-level style are renumbered as 1, 1.1, 1.1.1 (original "、" suffix kept, otherwise followed by a space). After handwritten numbers change, find TOC entries via `NormalizeTitle` and modify them together; after auto-numbering changes, TOC fields need updating in Word, written to `notes`; other mixed cases only write `notes`.
- Writing out (`DocxWriter`): builds a new package in original zip-entry order, only re-serializing modified parts, copying all other entries verbatim.
- Validation and recheck: validate original and copy separately with the Open XML SDK, compare by "error type + part + element"; when the copy has errors the original lacks, delete the copy and fail; after passing, open a new session on the copy and inspect again, with results in `blind-check-fix-result.json` (`fixes` counts per rule, `notes`, `validation`, `after` recheck report, `heading_fallback`). When the TOC was deleted and headings were originally recognized via TOC, recheck does not fall back to numbering-based heading recognition, `heading_fallback` returns false, and Main must carry it on subsequent rechecks, structure exports, and edits of this copy; otherwise numbering-like short sentences in body text would be recognized as headings and report issues not introduced by the fix.

The two AI-review actions in `BlindCheck/Review/` use the same request as `blind-check-inspect` (`source`, `profile`, `sensitive_words`, `heading_fallback`):

- `blind-check-dump`: exports tender structure (`blind-check-dump.json` `text` and `images`). Text is one paragraph per line, starting with the paragraph number, marking heading levels, TOC, cover, page-break-before, page breaks, section breaks, and contained images; in-paragraph text corresponds character by character to rendered text, only replacing manual line breaks, tabs, and image placeholders with ⏎ ⇥ ◇; the start lists each section's paper size, margins, header/footer references, and page-number start, and the end is an image inventory (`img{n}` numbered by occurrence, with name, alt text, dimensions, and containing paragraph). Newlines uniformly use `\n`.
- `blind-check-edit`: executes `edits` (`{op, target, find, replace}`) on `source`, with `original` as the structural-validation baseline document. `replace` replaces one occurrence of text within a paragraph, `find` must occur exactly once in display text, and edits spanning line breaks, tabs, images, fields, or other non-`w:t` content are rejected; `delete_paragraph` deletes a whole paragraph, `find` must equal the paragraph's full text (ignoring whitespace), paragraphs with section or page breaks, headings, TOC, or the only paragraph in a cell cannot be deleted; `clear_image_alt` removes image alt text and titles. The same batch uses submission-time numbers for定位 (location) and returns per-item results; after edits, it validates Open XML against `original`, rolls back the whole batch on new errors, and on passing overwrites `source` and returns the new tender structure (paragraph numbers shift after deletions).

When adding a new action: only add `action` handling inside the helper; requests and results stay in the same task directory, signal format unchanged.

## Development startup

The dev machine needs the .NET 10 SDK. Before Main is packaged, first `dotnet build`, then launch `bin/Debug/net10.0/openxmlhelper`; do not use `dotnet run` (build logs pollute stdout).

```powershell
dotnet build openxmlhelper\src\OpenXmlHelper\OpenXmlHelper.csproj
```

Do not commit self-contained exes to git.

## Packaging

The shipped installer must carry its own runtime; depending on the user's local .NET is forbidden.

- Publish: `--self-contained true`, `PublishSingleFile=true`, no Native AOT, no trimming.
- RIDs: `win-x64` / `osx-x64` / `osx-arm64`.
- Artifact directory names match existing command-tool conventions: `win32-x64`, `darwin-x64`, `darwin-arm64`.
- Output to `client/vendor/openxml-tools/<platform>-<arch>/`, then packed by electron-builder `extraResources` into `openxml-tools/<platform>-<arch>/`.
- Run `client/scripts/prepare-openxml-helper.cjs` before packaging. Release CI publishes for the current platform.

Launch path in the installed app: `resources/openxml-tools/<platform>-<arch>/openxmlhelper(.exe)`.

## Client integration

Full tender-document export reuses `render-restricted-html-docx`, with the request containing `html`, `export_format`, `asset_root`, `chrome_assets`, and setting `whole_document: true`. Main assembles the in-memory HTML whose top level uses `section[data-sv-export-template][data-sv-export-page-template]` to mark body styles and page ranges, both values `true` or `false`; TOC titles carry `data-sv-outline-number`, numbered by current tree order, while body headings do not participate in TOC counting. These are internal conversion markers and are not written back to the Agent's source files.

The whole-document conversion completes in a single Word package, applying base or template formats by range; list-numbering definitions are isolated by range, new sections start only on page-range changes, and undecorated ranges explicitly use empty headers/footers to block inheritance. When chapter page-frames are enabled, after formatting body, lists, images, and business tables, content between any two heading levels is fused into one flat table; business table rows merge into the unified grid, keeping merged cells, without nesting and without repeating business headers alone. Small sections without headings also fuse, never crossing template-style ranges or page sections; body rows may break across pages, images move whole pages or columns. Headings always remain top-level paragraphs, `heading_border.include_headings` defaults to and is `true` when missing; turning it off only removes heading borders, while shading, indent, navigation, and other formats stay unchanged. Without chapter page-frames, landscape dual-column continues reusing first-level heading full-width logic; the page-number start value is written only once.

Generated documents declare compatibility mode 15 in `settings.xml` (`w:compat/w:compatSetting compatibilityMode=15`). Full-width business tables and chapter page-frame tables uniformly use `tblW` `pct 5000` (100% of column width), while grid columns are still computed from export-time column widths, only as column ratios; when users adjust page margins in Word, body frames and heading paragraph borders move together, and dual-column uses single-column width. Do not remove compatibility mode or change table widths back to dxa: without the declaration Word lays out by 2007 rules, percentage-table cell margins are added outside column widths, and hard-coded dxa widths misalign with heading borders after margin changes. docx-editor does not read compatibility mode and converts percentages by body width; preview and format self-check calibers stay unchanged. Known difference: Word draws paragraph-border outer edges about 1.45pt further out than the spec position, docx-editor draws by spec; the existing 115 twips padding and 5pt spacing are calibrated to fully aligned preview, with heading boxes about 1.5pt wider per side than body boxes in Word. Images are absolute-size; after enlarging page margins, over-wide images need manual scaling in Word.

Main uses the formal helper queue with up to 30-minute waits; normal small sections and template samples do not pass `whole_document` and reuse the preview queue sharing the same page-frame conversion logic. Images go through the existing temp transit directory, and Main only writes to the user-selected target file after successful conversion.

Restricted-HTML illustrations are identified by file header as PNG, JPEG, GIF, BMP, WebP, TIFF, EMF, WMF (including placeable and standard WMF), with size reading and Word image-part declaration using the same true format, independent of file extension; EMF takes rclFrame from record headers, WMF takes the placeable-header bounding box or SetWindowExt, TIFF takes the first image-directory width/height. Images with mismatched extension and content are inserted with original bytes, without renaming, transcoding, or modifying source images. Files whose headers are recognizable but whose dimensions cannot be read are placed at frame size without cropping. When file headers are unrecognizable, if the `render-restricted-html-docx` request's `asset_types` (declared by Main at image transit time by extension via mime-types, keyed by `data-sv-asset-ref`) gives an `image/*` type other than the eight above, it is embedded as-is at frame size and left for Word to render; declared-as-verifiable formats with mismatched headers, or no declaration, mean non-exportable. A single unexportable image (missing file, unrecognizable format, or read failure) writes "[图片无法导出：alt (image cannot be exported: alt)]" in place with the caption kept, while the rest of the body converts normally, and `result.json`'s `imageWarnings` returns `assetRef` and `reason` per image; `insert-body-html` returns the same. Run `node scripts/check-technical-plan-export.cjs` to check the eight formats, format mismatches, Word image types, dimension ratios, dimension fallbacks, unknown-format as-is embedding, and broken-image in-place prompts in whole-document and section conversions.

"Different first page" reserves the cover; whole-document export has not yet integrated the cover, so `whole_document: true` ignores `first_page_different`: no `w:titlePg` is written and no first-page-specific blank headers/footers are created; the first page follows the normal page rules of its range. User configuration keeps its original value; normal section conversion and template samples still follow that setting.

In the client directory, `node scripts/check-technical-plan-export.cjs --ipc` checks both real conversion and the preload, IPC, save, progress, and cancellation chains in a real Electron window.

- Paths: `client/electron/utils/paths.cjs`
- Service: `client/electron/services/openXmlHelperService.cjs`
- Agent tool: `client/electron/services/pi/piOpenXmlTool.cjs`
- Exit: hangs under `ipc/index.cjs` `closeServices()`
- Tasks queue serially; `ping` times out after 15 seconds; when the helper crashes the current task fails and is launched again next time.
- stderr goes to developer logs with module name `openxml-helper`.

Format self-check continues using the same whole-document conversion action. Main only inserts `SAVIALAYOUT:yb_layout_<number>` locator paragraphs before each TOC title and AI body top-level block in the self-check copy; `RestrictedHtmlDocumentRenderer` deletes those paragraphs before formatting and inserts zero-width bookmarks at the corresponding Word block starts. Bookmarks add no paragraphs or visible text; the mapping is held in memory by Main and not written back to body HTML, and formal export carries no such markers. For dual-column with full-width first-level headings, the final dual-column body section properties must also explicitly be continuous; do not rely on the missing default nextPage, otherwise the last chapter will show a heading occupying a page alone.

## Don't do

- Do not change to HTTP, gRPC, or named pipes.
- Do not stuff document content or large JSON into signals.
- Do not make the installer depend on the user's machine .NET.
- Do not parse `.doc` / `.wps`; first convert them to `.docx` before handing to the helper.
