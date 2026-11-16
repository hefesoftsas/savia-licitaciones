const { nativeImage } = process.env.SAVIA_HEADLESS_RUNNER === '1' ? {} : require('electron');

// Limit pixels to approximately 16×24 cm at 300 DPI for clear A4 printing; shrink only, never upscale.
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 2880;
const JPEG_QUALITY = 90;

// Flatten transparency onto white: decoded bitmaps are premultiplied-alpha BGRA and direct JPEG conversion would produce black backgrounds.
function flattenOnWhite(image) {
  const bitmap = image.toBitmap();
  let transparent = false;
  for (let index = 0; index < bitmap.length; index += 4) {
    const alpha = bitmap[index + 3];
    if (alpha === 255) continue;
    transparent = true;
    bitmap[index] += 255 - alpha;
    bitmap[index + 1] += 255 - alpha;
    bitmap[index + 2] += 255 - alpha;
    bitmap[index + 3] = 255;
  }
  return transparent ? nativeImage.createFromBitmap(bitmap, image.getSize()) : image;
}

// Compress generated images before saving: proportionally shrink oversized images and convert to JPEG; return GIF or undecodable images unchanged.
// extension and the returned extension omit the leading dot.
function compressGeneratedImage(buffer, extension) {
  if (extension === 'gif') return { buffer, extension };
  const source = nativeImage.createFromBuffer(buffer);
  if (source.isEmpty()) return { buffer, extension };

  const { width, height } = source.getSize();
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  const resized = scale < 1
    ? source.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' })
    : source;
  const image = flattenOnWhite(resized);
  return { buffer: image.toJPEG(JPEG_QUALITY), extension: 'jpg', ...image.getSize() };
}

module.exports = {
  compressGeneratedImage,
};
