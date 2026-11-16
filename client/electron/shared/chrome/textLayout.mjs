/**
 * Text-layer description: the counterpart to decorations.
 *
 * Decorations are images, but text stays native in Word: page numbers require refreshable PAGE fields,
 * and headings must remain editable, searchable, and accessible to docx-editor.dev automation.
 *
 * Text regions use cm relative to the paper top-left; ordinary paragraphs have null boxes.
 * Regions vertically center text in transparent table cells; align specifies horizontal alignment.
 *
 * Colors follow runOptions in exportService.cjs build*Header/Footer functions,
 * matching the actual exported artifact.
 */
import {
  pxToCm, ptToCm, resolveChromeLayout, FOOTER_COLUMNS, lineHeightCm, chineseSizeToPt,
  HEADER_BADGE_WIDTH_CM, HEADER_SLOT, HEADER_FRAME, FOOTER_FRAME_INSET_CM,
  HEADER_CHROME_HEIGHT_CM, FOOTER_HEIGHT_CM, resolvePaperCm, isDecorative, clampCm,
} from './geometry.mjs';
import { contrastText } from './colors.mjs';

/** Height occupied by rules-style double rules, reserved by both decorations and text. */
export const RULES_LINE_BAND_CM = ptToCm(1.5 + 2 + 0.75);

/**
 * Horizontal text insets for formal styles (rules/footer-badge).
 *
 * Previously these followed margin_left_cm/margin_right_cm and body edges. Text positions are now configurable
 * absolute values, so dynamic following conflicts with user entries: changing margins could silently turn
 * a displayed 2.00 into 3.00. Use static defaults equal to default page margins instead;
 * users can adjust once when body alignment is needed.
 */
const CHROME_TEXT_INSET_CM = 2;

/** Complete header text region, clearing white slots and inner borders according to decoration boundaries. */
function headerTextBox(style, pageWidthCm, heightCm) {
  switch (style) {
    case 'band':
      return { startCm: HEADER_BADGE_WIDTH_CM, endCm: pageWidthCm, topCm: 0, heightCm };
    case 'top-bar':
      return {
        startCm: HEADER_SLOT.leftCm + pxToCm(4), endCm: pageWidthCm - HEADER_SLOT.rightCm - pxToCm(4),
        topCm: heightCm * HEADER_SLOT.topRatio + pxToCm(3),
        heightCm: heightCm * (1 - HEADER_SLOT.topRatio - HEADER_SLOT.bottomRatio) - pxToCm(6),
      };
    case 'slant':
      return { startCm: pxToCm(22), endCm: pageWidthCm * 0.45, topCm: 0, heightCm };
    case 'letterhead':
      return { startCm: pxToCm(56), endCm: pageWidthCm - pxToCm(16), topCm: 0, heightCm: heightCm - pxToCm(8) };
    case 'frame':
      return {
        startCm: HEADER_FRAME.xCm + pxToCm(10), endCm: pageWidthCm - HEADER_FRAME.xCm - pxToCm(10),
        topCm: HEADER_FRAME.yCm + pxToCm(2), heightCm: heightCm - 2 * (HEADER_FRAME.yCm + pxToCm(2)),
      };
    case 'rules':
      // Draw double rules at the band bottom and place text above them within body width.
      return {
        startCm: CHROME_TEXT_INSET_CM, endCm: pageWidthCm - CHROME_TEXT_INSET_CM,
        topCm: 0, heightCm: heightCm - RULES_LINE_BAND_CM,
      };
    case 'footer-badge':
      // Only one 1pt bottom border; text still sits above it.
      return {
        startCm: CHROME_TEXT_INSET_CM, endCm: pageWidthCm - CHROME_TEXT_INSET_CM,
        topCm: 0, heightCm: heightCm - ptToCm(1),
      };
    default:
      return null;   // plain has no decoration and uses configured header_alignment.
  }
}

/**
 * Default footer text region; coordinates include footerTopCm relative to paper top-left.
 * Extracted from buildTextLayout so default style positions can be evaluated independently of user values.
 */
function footerTextBox(style, pageWidthCm, footerHeightCm, footerTopCm) {
  if (!(footerHeightCm > 0)) return null;
  const cols = FOOTER_COLUMNS[style] || FOOTER_COLUMNS.plain;
  const insetCm = style === 'frame' ? FOOTER_FRAME_INSET_CM + ptToCm(0.75) : 0;
  // rules puts double rules at the footer top and text below; it has no partitions, so page numbers share the text region.
  if (style === 'rules') {
    return {
      startCm: CHROME_TEXT_INSET_CM, endCm: pageWidthCm - CHROME_TEXT_INSET_CM,
      topCm: footerTopCm + RULES_LINE_BAND_CM,
      heightCm: footerHeightCm - RULES_LINE_BAND_CM,
    };
  }
  if (!(cols.right > 0)) return null;
  return {
    startCm: cols.left + insetCm,
    endCm: pageWidthCm - cols.right - (cols.barCm || 0) - insetCm,
    topCm: footerTopCm + insetCm,
    heightCm: footerHeightCm - insetCm * 2,
  };
}

/** Header text colors: the four HTML styles derive from decoration backgrounds; others use configured header_color. */
function headerTextColor(style, colors, page) {
  switch (style) {
    case 'band': return colors.onBar;
    case 'top-bar': return colors.accent;      // On a white inset panel.
    case 'slant': return colors.onAccent;      // On a dark beveled block.
    case 'letterhead':
    case 'frame': return colors.accent;
    default: return page.header_color || '#536176';
  }
}

const HEADER_BOLD = new Set(['band', 'top-bar', 'slant', 'letterhead', 'frame']);

/** Page-number text color and shading; use run-level w:shd so background width fits text automatically. */
function pageNumberStyle(style, colors) {
  switch (style) {
    case 'band':
      return { color: contrastText(colors.badge), shadingFill: colors.badge };
    case 'top-bar':
    case 'slant':
      return { color: colors.onAccent, shadingFill: colors.badge };
    case 'footer-badge':
      return { color: colors.onAccent, shadingFill: colors.accent };
    case 'letterhead':
    case 'frame':
      return { color: colors.accent, shadingFill: null };
    default:
      return { color: null, shadingFill: null };   // plain/rules use footer_color.
  }
}

/**
 * Estimate text width in em (one em equals font size).
 *
 * Without actual font metrics, approximate by character class: CJK ideographs and full-width punctuation
 * count as full-width, others as half-width. This estimates wrapping within regions, affecting box height only.
 * Slight overestimation does not misalign text, while underestimation clips it, so err toward wider estimates.
 */
const FULL_WIDTH = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/;

function textWidthEm(text) {
  let em = 0;
  for (const ch of String(text || '')) em += FULL_WIDTH.test(ch) ? 1 : 0.5;
  return em;
}

/** Estimate wrapped line count for a region, capped at six to avoid absurd heights in very narrow regions. */
function estimateLines(text, widthCm, sizeName) {
  const neededCm = textWidthEm(text) * ptToCm(chineseSizeToPt(sizeName));
  if (!(widthCm > 0) || neededCm <= widthCm) return 1;
  return Math.min(6, Math.ceil(neededCm / widthCm));
}

/** Minimum text-box dimensions; smaller sizes would make estimateLines infer dozens of lines and excessive height. */
const MIN_TEXT_BOX_WIDTH_CM = 0.5;
const MIN_TEXT_BOX_HEIGHT_CM = 0.2;

/**
 * Position text boxes at user-specified absolute coordinates, not offsets from defaults.
 * left is relative to the paper edge; top is relative to the decorative band's top, not paper top.
 * Paper-relative footer values would drift with paper size and bottom distance and produce awkward values like 27.32;
 * band-relative values stay around 0–0.2 and are stable and intuitive.
 *
 * Nonnumbers mean style default. Zero cannot mean default because footer-badge legitimately starts at left=0.
 *
 * Keep the style's right edge fixed as part of the decoration (band badge cell or frame double border),
 * so width equals default right minus user left. Height still follows the style/band calculation,
 * reduced for top offsets to avoid overflowing the band.
 */
function placeBox(box, leftCm, topCm, chromeTopCm, chromeHeightCm, pageWidthCm) {
  if (!box) return box;
  // Accept actual numbers only: Number(null) is zero, not NaN, so testing the conversion with Number.isFinite would
  // misinterpret default-following null as user-selected zero and move text to the paper's left edge.
  const left = typeof leftCm === 'number' && Number.isFinite(leftCm) ? leftCm : null;
  const top = typeof topCm === 'number' && Number.isFinite(topCm) ? topCm : null;
  const hasLeft = left !== null;
  const hasTop = top !== null;
  if (!hasLeft && !hasTop) return box;

  const startCm = hasLeft
    ? clampCm(left, { min: 0, max: Math.max(0, pageWidthCm - MIN_TEXT_BOX_WIDTH_CM) })
    : box.startCm;
  const endCm = Math.min(pageWidthCm, Math.max(box.endCm, startCm + MIN_TEXT_BOX_WIDTH_CM));

  const relTopCm = hasTop
    ? clampCm(top, { min: 0, max: Math.max(0, chromeHeightCm - MIN_TEXT_BOX_HEIGHT_CM) })
    : box.topCm - chromeTopCm;
  const heightCm = Math.max(
    MIN_TEXT_BOX_HEIGHT_CM,
    Math.min(box.heightCm, chromeHeightCm - relTopCm),
  );

  return { startCm, endCm, topCm: chromeTopCm + relTopCm, heightCm };
}

/**
 * Expand text boxes to fit actual text.
 *
 * Band height belongs to style structure; text height depends on font size and wrapping. Treating them as equal
 * lets large or wrapped text overflow bands or paper edges. Original table rows used HeightRule.ATLEAST
 * and expanded with content; restore that capability here.
 *
 * Expand around the band's vertical center to preserve text/color-block relationships, then clamp
 * to the paper so zero bottom offsets do not cause page overflow.
 */
function fitTextBox(box, sizeName, pageHeightCm, text = '') {
  if (!box) return box;
  // Empty boxes render in neither consumer; expanding them only wastes body space.
  if (!String(text || '').length) return box;
  const lines = estimateLines(text, box.endCm - box.startCm, sizeName);
  const neededCm = lineHeightCm(sizeName) * lines;
  if (neededCm <= box.heightCm) return box;
  const centerCm = box.topCm + box.heightCm / 2;
  const topCm = Math.min(
    Math.max(0, centerCm - neededCm / 2),
    Math.max(0, pageHeightCm - neededCm),
  );
  return { ...box, topCm, heightCm: neededCm };
}

/**
 * Actual defaults for the six configurable geometry values of a style.
 *
 * The UI displays concrete default numbers rather than uninformative zeros, showing band height and text origins
 * so users can decide which direction to adjust.
 *
 * Compute independently of existing user values; otherwise style-switch default assignment would incorporate
 * the previous style's values and create feedback.
 *
 * top is relative to the band top, matching placeBox inputs.
 */
export function resolveChromeGeometryDefaults(page = {}) {
  const style = page.header_footer_style || 'plain';
  const { widthCm } = resolvePaperCm(page.paper_size, page.orientation);
  const headerHeightCm = isDecorative(style) ? HEADER_CHROME_HEIGHT_CM : 0;
  const footerHeightCm = FOOTER_HEIGHT_CM[style] ?? 0;

  const header = headerHeightCm > 0 ? headerTextBox(style, widthCm, headerHeightCm) : null;
  // Pass footerTopCm=0 so returned topCm is already relative to the band's top edge.
  const footer = footerTextBox(style, widthCm, footerHeightCm, 0);

  const round = (v) => Math.round(v * 100) / 100;
  return {
    header_chrome_height_cm: round(headerHeightCm),
    footer_chrome_height_cm: round(footerHeightCm),
    header_text_left_cm: header ? round(header.startCm) : 0,
    header_text_top_cm: header ? round(header.topCm) : 0,
    footer_text_left_cm: footer ? round(footer.startCm) : 0,
    footer_text_top_cm: footer ? round(footer.topCm) : 0,
  };
}

/**
 * Compute the text layer for a configuration.
 * @param {object} page PageSetupConfig
 * @param {object} colors Result of resolveChromeColors
 */
export function buildTextLayout(page, colors, geometry = resolveChromeLayout(page)) {
  const style = page.header_footer_style || 'plain';
  const { widthCm, heightCm: pageHeightCm, headerHeightCm, footerHeightCm, footerTopCm } = geometry;

  const headerSize = page.header_size || '小五';
  const headerText = String(page.header_text || '').trim();
  // Only band has a short-label region; clear it for other styles because old values remain after switching away.
  const headerBadgeText = style === 'band' ? String(page.header_badge_text || '').trim().slice(0, 4) : '';

  const headerLeftCm = page.header_text_left_cm;
  const headerTopCm = page.header_text_top_cm;
  const footerLeftCm = page.footer_text_left_cm;
  const footerTopCmConfig = page.footer_text_top_cm;

  // Header bands touch the paper top, so their band-top coordinate is zero.
  const box = fitTextBox(
    placeBox(
      headerHeightCm > 0 ? headerTextBox(style, widthCm, headerHeightCm) : null,
      headerLeftCm, headerTopCm, 0, headerHeightCm, widthCm,
    ),
    headerSize, pageHeightCm, headerText,
  );
  const header = {
    text: headerText,
    badgeText: headerBadgeText,
    color: headerTextColor(style, colors, page),
    bold: HEADER_BOLD.has(style),
    font: page.header_font || '宋体',
    size: headerSize,
    // Use existing Chinese alignment values supported by both consumers.
    align: box
      ? (['top-bar', 'frame'].includes(style) ? '居中对齐'
        : ['rules', 'footer-badge'].includes(style) ? (page.header_alignment || '居中对齐') : '左对齐')
      : (page.header_alignment || '居中对齐'),
    box,
    // Band badge text occupies its own region over the left accent block.
    // Apply top offsets only, not left offsets: the badge sits on a fixed 1.15cm solid-color block and horizontal movement would leave it;
    // the band is full-height vertically, so downward movement keeps badge and header text baselines aligned.
    badge: style === 'band' && box
      ? {
        color: colors.onAccent, bold: true, align: '居中对齐',
        box: fitTextBox(
          placeBox(
            { startCm: 0, endCm: HEADER_BADGE_WIDTH_CM, topCm: 0, heightCm: headerHeightCm },
            undefined, headerTopCm, 0, headerHeightCm, widthCm,
          ),
          headerSize, pageHeightCm, headerBadgeText,
        ),
      }
      : null,
  };

  const cols = FOOTER_COLUMNS[style] || FOOTER_COLUMNS.plain;
  const pn = pageNumberStyle(style, colors);
  const hasDecoration = cols.right > 0;
  const insetCm = style === 'frame' ? FOOTER_FRAME_INSET_CM + ptToCm(0.75) : 0;
  const rulesFooter = style === 'rules' && footerHeightCm > 0;
  const footerBox = footerTextBox(style, widthCm, footerHeightCm, footerTopCm);

  const footerSize = page.footer_size || '小五';
  const footerText = String(page.footer_enabled ? page.footer_text || '' : '').trim();
  const pageNumberFormat = page.page_number_format || '第{page}页';
  const pageNumberPad = Number(page.page_number_pad) || 0;
  // Actual PAGE-field digits are known only in Word; estimate at least two digits to avoid narrow sizing for large page counts.
  const pageNumberSample = formatPageNumber('0'.repeat(Math.max(2, pageNumberPad)), pageNumberFormat, 0);

  const pageNumberEnabled = page.page_number_enabled === true;

  // Disabled page numbers produce no box in either path, so remove it here too; otherwise
  // expandMarginsForText would count it toward bottom margins and unnecessarily shrink the body.
  const pageNumberBox = footerBox && !rulesFooter && pageNumberEnabled
    ? { ...footerBox, startCm: widthCm - cols.right + insetCm, endCm: widthCm - insetCm }
    : null;

  // rules has no partitions: combine text and page numbers in one box, joined by four spaces in both paths;
  // estimate height from the combined content or risk undercounting one line.
  const mergedFooterText = pageNumberBox
    ? footerText
    : [footerText, pageNumberEnabled ? pageNumberSample : ''].filter(Boolean).join('    ');

  // Page-number regions are much narrower than body-text regions; estimate wrapping independently rather than sharing one expanded box.
  //
  // Positioning happens here; pageNumberBox derives from the earlier unpositioned footerBox,
  // preserving default partition boundaries. Page numbers follow top only because FOOTER_COLUMNS anchors their colored cell on the right
  // (dark band cell or footer-badge accent cell); moving left would leave that cell.
  const fittedFooterBox = fitTextBox(
    placeBox(footerBox, footerLeftCm, footerTopCmConfig, footerTopCm, footerHeightCm, widthCm),
    footerSize, pageHeightCm, mergedFooterText,
  );
  const fittedPageNumberBox = fitTextBox(
    placeBox(pageNumberBox, undefined, footerTopCmConfig, footerTopCm, footerHeightCm, widthCm),
    footerSize, pageHeightCm, pageNumberSample,
  );

  const footer = {
    text: footerText,
    color: page.footer_color || '#536176',
    font: page.footer_font || '宋体',
    size: footerSize,
    align: page.footer_alignment || '居中对齐',
    box: fittedFooterBox,
    pageNumber: {
      enabled: pageNumberEnabled,
      format: pageNumberFormat,
      pad: pageNumberPad,
      start: Math.max(1, Number(page.page_number_start) || 1),
      color: pn.color || page.footer_color || '#536176',
      shadingFill: pn.shadingFill,
      bold: hasDecoration,
      align: '居中对齐',
      // A null box means page numbers share footer.box with body text, as in rules and undecorated styles.
      box: fittedPageNumberBox,
    },
  };

  return { style, header, footer };
}

/** Replace {page} with actual numbers for static frontend thumbnail/preview display only. */
export function formatPageNumber(pageNumber, format = '第{page}页', pad = 0) {
  const token = pad > 0 ? String(pageNumber).padStart(pad, '0') : String(pageNumber);
  return String(format).replace('{page}', token);
}
