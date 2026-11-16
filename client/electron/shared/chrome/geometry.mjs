/**
 * Header/footer geometry: the repository's single implementation.
 *
 * These constants previously differed across preview exportFormatCss.ts, production exportService.cjs,
 * and C# sample RestrictedHtmlDocumentRenderer.cs. All paths, including preview CSS variables,
 * now read this one source.
 *
 * SVG coordinates: one unit = 0.01cm, so 100 units = 1cm.
 * A 21cm header therefore has viewBox "0 0 2100 135", directly reflecting physical dimensions.
 */

// ---------- Unit conversion ----------
export const SVG_UNITS_PER_CM = 100;
export const TWIPS_PER_CM = 567;          // Matches C# CmToTwips.
export const EMU_PER_CM = 360000;
export const CSS_PX_PER_CM = 96 / 2.54;   // 36.2835, absolute CSS pixels.
export const PT_PER_CM = 72 / 2.54;       // 28.3465

export const cmToSvg = (cm) => cm * SVG_UNITS_PER_CM;
export const cmToTwips = (cm) => Math.round(cm * TWIPS_PER_CM);
export const cmToEmu = (cm) => Math.round(cm * EMU_PER_CM);
export const cmToPx = (cm) => cm * CSS_PX_PER_CM;
export const pxToCm = (px) => px / CSS_PX_PER_CM;
export const ptToCm = (pt) => pt / PT_PER_CM;

/** Convert original HTML-template CSS pixels to SVG units; templates use 96 dpi. */
export const pxToSvg = (px) => cmToSvg(pxToCm(px));
/** Convert CSS points to SVG units; footer grid column widths use points. */
export const ptToSvg = (pt) => cmToSvg(ptToCm(pt));

// ---------- Decorative band dimensions ----------
/** Header band height shared by all eight styles. */
export const HEADER_CHROME_HEIGHT_CM = 1.35;

/** Style-specific footer heights; band/footer-badge 0.635 equals 360 twips. */
export const FOOTER_HEIGHT_CM = {
  plain: 0,
  band: 360 / TWIPS_PER_CM,
  rules: 0.9,
  'top-bar': 0.85,
  'footer-badge': 360 / TWIPS_PER_CM,
  slant: 0.85,
  letterhead: 0.8,
  frame: 0.85,
};

/**
 * Safe range for user-configurable heights.
 *
 * Lower limits deliberately sit below the smallest intrinsic defaults (footer band/footer-badge 0.635, header 1.35),
 * allowing users to select default values without clamping them upward; upper limits prevent bands consuming the body.
 * Zero/missing/invalid values bypass this range and follow intrinsic defaults; see resolveChromeHeightCm.
 *
 * Testing found frame inner borders become negative below 0.6cm for footers or 0.5cm for headers,
 * so these minima also protect decoration structure. svgUtil's nonnegative dimensions provide a second guard.
 */
export const HEADER_CHROME_HEIGHT_RANGE_CM = { min: 0.8, max: 4 };
export const FOOTER_CHROME_HEIGHT_RANGE_CM = { min: 0.6, max: 3 };


export const clampCm = (value, { min, max }) => Math.min(max, Math.max(min, value));

/**
 * Resolve a height where zero means the style default.
 *
 * Defaults bypass clamping: intrinsic band/footer-badge height 0.635 is below acceptable manual limits,
 * so clamping would raise it and distort style switching. Old templates lack this field
 * and naturally use defaultCm, preserving previous geometry byte for byte.
 *
 * defaultCm=0 means no decorative band, as for plain footers; configuration cannot create one.
 */
export function resolveChromeHeightCm(configured, defaultCm, range) {
  if (!(defaultCm > 0)) return 0;
  // As in placeBox, accept actual numbers only; null, undefined, and empty strings mean style default.
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured <= 0) return defaultCm;
  return clampCm(configured, range);
}

/** Footer region widths shared by decorations and text; barCm separates body text from page numbers. */
export const FOOTER_COLUMNS = {
  band: { left: 1.15, right: 2.1 },
  'footer-badge': { left: 0, right: 2.1 },
  'top-bar': { left: 1.15, right: 1.6 },
  slant: { left: 1.35, right: 1.6 },
  frame: { left: 1.0, right: 1.7 },
  letterhead: { left: 0, right: 1.7, barCm: 0.22 },
  rules: { left: 0, right: 0 },
  plain: { left: 0, right: 0 },
};

/**
 * Chinese font-size names to points, matching SIZE_TO_PT in src/shared/types/exportFormat.ts
 * (exportService.cjs SIZE_TO_HALF_PT doubles these).
 * Shared text layout needs this table to expand boxes according to font size.
 */
export const SIZE_TO_PT = {
  初号: 42, 小初: 36, 一号: 26, 小一: 24, 二号: 22, 小二: 18,
  三号: 16, 小三: 15, 四号: 14, 小四: 12, 五号: 10.5, 小五: 9,
  六号: 7.5, 小六: 6.5,
};

export const chineseSizeToPt = (name) => SIZE_TO_PT[name] ?? 12;

/** Single-line height as a font-size multiplier; allow generous Chinese glyph/line spacing so text does not touch borders. */
export const LINE_HEIGHT_FACTOR = 1.2;

/** Height of one text line in cm. */
export const lineHeightCm = (sizeName) => ptToCm(chineseSizeToPt(sizeName)) * LINE_HEIGHT_FACTOR;

/** Header badge, white slot, and inner border boundaries for shared text/decoration positioning. */
export const HEADER_BADGE_WIDTH_CM = 1.15;
export const HEADER_SLOT = { leftCm: pxToCm(78), rightCm: pxToCm(36), topRatio: 0.16, bottomRatio: 0.2 };
export const HEADER_FRAME = { xCm: pxToCm(12), yCm: pxToCm(10) };
export const FOOTER_FRAME_INSET_CM = ptToCm(5);

/**
 * Whitespace budget above/below decorative bands.
 *
 * This is not a positioning offset: header decoration touches the paper top (posOffset=0).
 * It only affects body margins. The former CHROME_*_FROM_EDGE_CM name was misleading
 * and once introduced an unintended white strip in Word.
 */
export const CHROME_EDGE_BUDGET_CM = 0.15;
/** Clearance between decorative bands and body text. */
export const CHROME_BODY_CLEARANCE_CM = 0.15;

/** User-configurable footer-band distance from the paper bottom. */
export const DEFAULT_FOOTER_DISTANCE_CM = 1.75;

/** Undecorated header paragraph distance from paper top, using Word's default. */
export const DEFAULT_HEADER_DISTANCE_CM = 1.25;

// ---------- Paper ----------
/** Dimensions in cm, aligned with the C# PaperSizes dictionary. */
export const PAPER_SIZES_CM = {
  a4: [21.0, 29.7],
  a3: [29.7, 42.0],
  a5: [14.8, 21.0],
  b4: [25.0, 35.3],
  b5: [17.6, 25.0],
  letter: [21.59, 27.94],
  legal: [21.59, 35.56],
  '16k': [18.4, 26.0],
};

export function resolvePaperCm(paperSize, orientation) {
  const [w, h] = PAPER_SIZES_CM[paperSize] || PAPER_SIZES_CM.a4;
  return orientation === 'landscape' ? { widthCm: h, heightCm: w } : { widthCm: w, heightCm: h };
}

// ---------- Visibility ----------
/** Every style except plain is decorated. */
export const isDecorative = (style) => style !== 'plain';

export function showsHeader(page) {
  if (!page?.header_enabled) return false;
  if (isDecorative(page.header_footer_style)) return true;
  return Boolean(String(page.header_text || '').trim());
}

export function showsFooter(page) {
  const hasText = Boolean(page?.footer_enabled && String(page.footer_text || '').trim());
  return Boolean(hasText || page?.page_number_enabled);
}

// ---------- Layout derivation ----------
/**
 * Body margins must clear edge budget + band height + clearance.
 * Zero-height decorations reserve no space.
 */
function minBodyMarginCm(chromeHeightCm, edgeBudgetCm) {
  if (!(chromeHeightCm > 0)) return 0;
  return edgeBudgetCm + chromeHeightCm + CHROME_BODY_CLEARANCE_CM;
}

/**
 * Include actual text-layer extents in body margins.
 *
 * resolveChromeLayout knows only intrinsic band heights; font size and wrapping can expand text boxes
 * beyond them (see textLayout.mjs fitTextBox), and body text must clear this expansion too.
 * These floating wrapNone objects do not cause Word to reserve space automatically,
 * so unchanged margins would let them overlap body content.
 *
 * @param {object} layout Result of resolveChromeLayout
 * @param {object} textLayout Result of buildTextLayout
 */
export function expandMarginsForText(layout, textLayout) {
  const headerBoxes = [textLayout?.header?.box, textLayout?.header?.badge?.box].filter(Boolean);
  const footerBoxes = [textLayout?.footer?.box, textLayout?.footer?.pageNumber?.box].filter(Boolean);

  let marginTopCm = layout.marginTopCm;
  for (const box of headerBoxes) {
    marginTopCm = Math.max(marginTopCm, box.topCm + box.heightCm + CHROME_BODY_CLEARANCE_CM);
  }

  let marginBottomCm = layout.marginBottomCm;
  for (const box of footerBoxes) {
    marginBottomCm = Math.max(marginBottomCm, layout.heightCm - box.topCm + CHROME_BODY_CLEARANCE_CM);
  }

  // Reserve at least one body line so extreme settings cannot make top/bottom margins meet.
  const maxTotalCm = Math.max(0, layout.heightCm - 1);
  if (marginTopCm + marginBottomCm > maxTotalCm) {
    const scale = maxTotalCm / (marginTopCm + marginBottomCm);
    marginTopCm *= scale;
    marginBottomCm *= scale;
  }
  return { ...layout, marginTopCm, marginBottomCm };
}

/**
 * Compute complete geometry from page configuration.
 * All three paths (frontend thumbnails, C# samples, production export) call this function
 * to keep decoration positions and body margins consistent.
 */
export function resolveChromeLayout(page = {}) {
  const style = page.header_footer_style || 'plain';
  const { widthCm, heightCm } = resolvePaperCm(page.paper_size, page.orientation);

  const headerVisible = showsHeader(page);
  const footerVisible = showsFooter(page);
  // plain creates no decoration image and reserves no band height, avoiding unwanted increases to the configured top margin.
  const headerHeightCm = headerVisible && isDecorative(style)
    ? resolveChromeHeightCm(
      page.header_chrome_height_cm, HEADER_CHROME_HEIGHT_CM, HEADER_CHROME_HEIGHT_RANGE_CM)
    : 0;
  const footerHeightCm = footerVisible
    ? resolveChromeHeightCm(
      page.footer_chrome_height_cm, FOOTER_HEIGHT_CM[style] ?? 0, FOOTER_CHROME_HEIGHT_RANGE_CM)
    : 0;

  const footerDistanceCm = Math.max(0, page.footer_distance_cm ?? DEFAULT_FOOTER_DISTANCE_CM);

  const marginTopCm = Math.max(
    page.margin_top_cm ?? 2,
    minBodyMarginCm(headerHeightCm, CHROME_EDGE_BUDGET_CM),
  );
  const marginBottomCm = Math.max(
    page.margin_bottom_cm ?? 2,
    minBodyMarginCm(footerHeightCm, footerDistanceCm),
  );

  return {
    style,
    widthCm,
    heightCm,
    marginTopCm,
    marginBottomCm,
    marginLeftCm: page.margin_left_cm ?? 2,
    marginRightCm: page.margin_right_cm ?? 2,

    headerVisible,
    footerVisible,
    headerHeightCm,
    footerHeightCm,

    // Headers touch the top; footer decoration bottoms use the configured edge distance.
    headerTopCm: 0,
    footerTopCm: heightCm - footerDistanceCm - footerHeightCm,

    // Decorated headers touch the top and floating text boxes position text, so paragraph top distance is zero;
    // plain headers use normal paragraph flow and Word's default 1.25cm top distance.
    headerDistanceCm: headerHeightCm > 0 ? 0 : DEFAULT_HEADER_DISTANCE_CM,
    footerDistanceCm,

    // Use the configured footer distance for both positioning and bottom-margin derivation.
    configuredFooterDistanceCm: footerDistanceCm,
  };
}
