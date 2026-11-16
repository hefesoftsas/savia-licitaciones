const AdmZip = require('adm-zip');

// Determine blind-bid image color from pixels, not color mode: true-color PNG screenshots with black-and-white content are not color images.
// Compare RGB channels per pixel and classify as color only above the colored-pixel threshold. Diagram borders and text may be just one or two pixels wide;
// excessive shrinking washes them into the white background, so only reduce images whose longest edge exceeds 2048 pixels before counting.
// nativeImage only decodes PNG and JPEG; do not classify or grayscale BMP, GIF, or other formats.
const SAMPLE_EDGE = 2048;
const CHANNEL_SPREAD = 40;
const COLOR_RATIO = 0.01;
const DECODABLE_IMAGE = /\.(png|jpe?g)$/i;

/** Match helper part names: normalize forward slashes and remove leading slashes. */
function normalizePartName(entryName) {
  return String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function sampleColorRatio(buffer) {
  const { nativeImage } = require('electron');
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
  const sample = scale < 1
    ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' })
    : image;
  // Bitmaps use premultiplied-alpha BGRA; ignore pixels below half opacity.
  const bitmap = sample.toBitmap();
  let opaque = 0;
  let colorful = 0;
  for (let index = 0; index < bitmap.length; index += 4) {
    if (bitmap[index + 3] < 128) continue;
    opaque += 1;
    const blue = bitmap[index];
    const green = bitmap[index + 1];
    const red = bitmap[index + 2];
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > CHANNEL_SPREAD) colorful += 1;
  }
  return opaque ? colorful / opaque : 0;
}

/**
 * Sample each bitmap in the docx and return [{ part, color, color_ratio }], using the helper's image part names.
 * Yield the event loop after each image to keep Main responsive and allow prompt cancellation with many images.
 * Inspection copies use UUID names and never change after import; cache one result per copy to avoid decoding again for repair.
 */
let cachedFacts = null;

async function collectImageColorFacts(docxPath, { signal, onProgress } = {}) {
  if (signal?.aborted) throw new Error('检查已取消');
  if (cachedFacts?.path === docxPath) return cachedFacts.facts;
  const entries = new AdmZip(docxPath).getEntries()
    .filter((entry) => !entry.isDirectory && DECODABLE_IMAGE.test(entry.entryName) && !entry.entryName.startsWith('docProps/'));
  const facts = [];
  for (let index = 0; index < entries.length; index += 1) {
    if (signal?.aborted) throw new Error('检查已取消');
    const entry = entries[index];
    const ratio = sampleColorRatio(entry.getData());
    if (ratio !== null) {
      facts.push({ part: normalizePartName(entry.entryName), color: ratio >= COLOR_RATIO, color_ratio: Number(ratio.toFixed(4)) });
    }
    onProgress?.(index + 1, entries.length);
    await new Promise((resolve) => setImmediate(resolve));
  }
  cachedFacts = { path: docxPath, facts };
  return facts;
}

/** Grayscale: set each pixel's RGB channels to its luminance, preserving alpha; retain JPEG encoding for JPEG images and use PNG otherwise. */
function toGrayscale(buffer, isJpeg) {
  const { nativeImage } = require('electron');
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  for (let index = 0; index < bitmap.length; index += 4) {
    const gray = Math.round(0.114 * bitmap[index] + 0.587 * bitmap[index + 1] + 0.299 * bitmap[index + 2]);
    bitmap[index] = gray;
    bitmap[index + 1] = gray;
    bitmap[index + 2] = gray;
  }
  const result = nativeImage.createFromBitmap(bitmap, { width, height });
  return isJpeg ? result.toJPEG(90) : result.toPNG();
}

/**
 * Convert specified docx bitmaps to grayscale in a separate copy, leaving the original untouched; return the converted parts.
 * The helper cannot decode pixels, so the repair task creates this grayscale copy before passing it to the helper for other repairs.
 */
async function writeGrayscaleCopy(docxPath, targetPath, parts, { signal } = {}) {
  const wanted = new Set(parts);
  const zip = new AdmZip(docxPath);
  const converted = [];
  for (const entry of zip.getEntries()) {
    if (signal?.aborted) throw new Error('修复已取消');
    const part = normalizePartName(entry.entryName);
    if (entry.isDirectory || !wanted.has(part) || !DECODABLE_IMAGE.test(part)) continue;
    const gray = toGrayscale(entry.getData(), /\.jpe?g$/i.test(part));
    if (!gray) continue;
    zip.updateFile(entry, gray);
    converted.push(part);
    await new Promise((resolve) => setImmediate(resolve));
  }
  zip.writeZip(targetPath);
  return converted;
}

module.exports = {
  collectImageColorFacts,
  writeGrayscaleCopy,
  __test__: {
    sampleColorRatio,
    normalizePartName,
  },
};
