const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CD_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

const MAX_EOCD_SEARCH = 65557;
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024 * 1024;
const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.doc',
  '.docx',
  '.wps',
  '.pdf',
  '.xls',
  '.xlsx',
];

export const PROJECT_DOCUMENT_ACCEPT = `${SUPPORTED_DOCUMENT_EXTENSIONS.join(',')},.zip`;

const MIME_BY_EXTENSION = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.wps': 'application/vnd.ms-works',
  '.pdf': 'application/pdf',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const latin1Decoder = new TextDecoder('latin1');

export function getFileExtension(name) {
  const idx = String(name || '').lastIndexOf('.');
  return idx >= 0 ? String(name).slice(idx).toLowerCase() : '';
}

export function isZipFileName(name) {
  return getFileExtension(name) === '.zip';
}

export function isSupportedDocumentName(name) {
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(getFileExtension(name));
}

function decodeZipName(bytes, utf8Flag) {
  if (utf8Flag) {
    try {
      return utf8Decoder.decode(bytes);
    } catch {
      return latin1Decoder.decode(bytes);
    }
  }
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return latin1Decoder.decode(bytes);
  }
}

function sanitizeExtractedFileName(rawPath) {
  const normalized = String(rawPath || '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length) return '';
  if (segments[0] === '__MACOSX') return '';
  const base = segments[segments.length - 1]
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim();
  if (!base || base === '.' || base === '..') return '';
  if (base.startsWith('._') || base === '.DS_Store' || base.toLowerCase() === 'thumbs.db' || base.toLowerCase() === 'desktop.ini') {
    return '';
  }
  if (base.length <= 255) return base;
  const ext = getFileExtension(base);
  const stem = base.slice(0, 255 - ext.length).trim();
  return `${stem || 'document'}${ext}`;
}

function readUint64(view, offset) {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 0x100000000 + low;
}

function parseZip64Extra(extraBytes, needUncompressed, needCompressed, needLocalOffset) {
  const view = new DataView(extraBytes.buffer, extraBytes.byteOffset, extraBytes.byteLength);
  let pos = 0;
  let uncompressedSize = null;
  let compressedSize = null;
  let localHeaderOffset = null;

  while (pos + 4 <= view.byteLength) {
    const headerId = view.getUint16(pos, true);
    const dataSize = view.getUint16(pos + 2, true);
    pos += 4;
    if (pos + dataSize > view.byteLength) break;
    if (headerId === 0x0001) {
      let fieldPos = pos;
      if (needUncompressed && fieldPos + 8 <= pos + dataSize) {
        uncompressedSize = readUint64(view, fieldPos);
        fieldPos += 8;
      }
      if (needCompressed && fieldPos + 8 <= pos + dataSize) {
        compressedSize = readUint64(view, fieldPos);
        fieldPos += 8;
      }
      if (needLocalOffset && fieldPos + 8 <= pos + dataSize) {
        localHeaderOffset = readUint64(view, fieldPos);
      }
      break;
    }
    pos += dataSize;
  }
  return { uncompressedSize, compressedSize, localHeaderOffset };
}

async function findCentralDirectory(zipFile) {
  const tailSize = Math.min(zipFile.size, MAX_EOCD_SEARCH);
  if (tailSize < 22) {
    throw new Error('Invalid ZIP archive.');
  }
  const tailStart = zipFile.size - tailSize;
  const tailBuffer = await zipFile.slice(tailStart, zipFile.size).arrayBuffer();
  const tailView = new DataView(tailBuffer);

  let eocdPos = -1;
  for (let i = tailSize - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD_SIGNATURE) {
      const commentLen = tailView.getUint16(i + 20, true);
      if (i + 22 + commentLen === tailSize) {
        eocdPos = i;
        break;
      }
    }
  }
  if (eocdPos < 0) {
    throw new Error('Invalid ZIP archive.');
  }

  const diskNumber = tailView.getUint16(eocdPos + 4, true);
  const cdDiskNumber = tailView.getUint16(eocdPos + 6, true);
  if (diskNumber !== 0 || cdDiskNumber !== 0) {
    throw new Error('Multi-disk ZIP archives are not supported.');
  }

  let cdEntriesTotal = tailView.getUint16(eocdPos + 10, true);
  let cdSize = tailView.getUint32(eocdPos + 12, true);
  let cdOffset = tailView.getUint32(eocdPos + 16, true);

  if (cdEntriesTotal === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locatorAbsolute = tailStart + eocdPos - 20;
    if (locatorAbsolute < 0) throw new Error('Invalid ZIP64 archive.');
    const locBuf = await zipFile.slice(locatorAbsolute, locatorAbsolute + 20).arrayBuffer();
    const locView = new DataView(locBuf);
    if (locView.getUint32(0, true) !== ZIP64_LOCATOR_SIGNATURE) {
      throw new Error('Invalid ZIP64 archive.');
    }
    const zip64EocdOffset = readUint64(locView, 8);
    const z64Buf = await zipFile.slice(zip64EocdOffset, zip64EocdOffset + 56).arrayBuffer();
    const z64View = new DataView(z64Buf);
    if (z64View.byteLength < 56 || z64View.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
      throw new Error('Invalid ZIP64 archive.');
    }
    cdEntriesTotal = readUint64(z64View, 32);
    cdSize = readUint64(z64View, 40);
    cdOffset = readUint64(z64View, 48);
  }

  if (cdOffset + cdSize > zipFile.size) {
    throw new Error('Corrupted ZIP central directory.');
  }

  return { cdOffset, cdSize, cdEntriesTotal };
}

async function decompressDeflateRaw(blob) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Browser does not support ZIP decompression.');
  }
  const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

/**
 * Extracts supported document files from a ZIP archive using Web APIs (`Blob.slice` + `DecompressionStream`).
 */
export async function extractZipDocuments(zipFile, options = {}) {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  const { cdOffset, cdSize } = await findCentralDirectory(zipFile);
  const cdBuffer = await zipFile.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const cdView = new DataView(cdBuffer);
  const cdBytes = new Uint8Array(cdBuffer);

  const files = [];
  let skipped = 0;
  let encrypted = 0;
  let empty = 0;
  let tooLarge = 0;
  let totalUncompressed = 0;
  let pos = 0;

  while (pos + 46 <= cdView.byteLength) {
    if (cdView.getUint32(pos, true) !== CD_SIGNATURE) {
      break;
    }

    const flags = cdView.getUint16(pos + 8, true);
    const method = cdView.getUint16(pos + 10, true);
    let compressedSize = cdView.getUint32(pos + 20, true);
    let uncompressedSize = cdView.getUint32(pos + 24, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    let localHeaderOffset = cdView.getUint32(pos + 42, true);

    const nameStart = pos + 46;
    const extraStart = nameStart + nameLen;
    const nextPos = extraStart + extraLen + commentLen;
    if (nextPos > cdView.byteLength) break;

    const rawName = decodeZipName(cdBytes.subarray(nameStart, extraStart), Boolean(flags & 0x0800));

    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      const z64 = parseZip64Extra(
        cdBytes.subarray(extraStart, extraStart + extraLen),
        uncompressedSize === 0xffffffff,
        compressedSize === 0xffffffff,
        localHeaderOffset === 0xffffffff,
      );
      if (z64.uncompressedSize !== null) uncompressedSize = z64.uncompressedSize;
      if (z64.compressedSize !== null) compressedSize = z64.compressedSize;
      if (z64.localHeaderOffset !== null) localHeaderOffset = z64.localHeaderOffset;
    }

    pos = nextPos;

    if (rawName.endsWith('/') || rawName.endsWith('\\')) {
      continue;
    }

    const fileName = sanitizeExtractedFileName(rawName);
    if (!fileName) {
      continue;
    }

    if (!isSupportedDocumentName(fileName)) {
      skipped += 1;
      continue;
    }

    if (flags & 0x01) {
      encrypted += 1;
      continue;
    }

    if (method !== 0 && method !== 8) {
      skipped += 1;
      continue;
    }

    if (uncompressedSize === 0) {
      empty += 1;
      continue;
    }

    if (uncompressedSize > maxFileSize) {
      tooLarge += 1;
      continue;
    }

    if (files.length >= maxFiles || totalUncompressed + uncompressedSize > maxTotalBytes) {
      tooLarge += 1;
      continue;
    }

    const localBuf = await zipFile.slice(localHeaderOffset, localHeaderOffset + 30).arrayBuffer();
    if (localBuf.byteLength < 30) {
      skipped += 1;
      continue;
    }
    const localView = new DataView(localBuf);
    if (localView.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
      skipped += 1;
      continue;
    }

    const localNameLen = localView.getUint16(26, true);
    const localExtraLen = localView.getUint16(28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipFile.size) {
      skipped += 1;
      continue;
    }

    const compressedBlob = zipFile.slice(dataStart, dataEnd);
    const ext = getFileExtension(fileName);
    const mimeType = MIME_BY_EXTENSION[ext] || 'application/octet-stream';

    let extractedFile;
    if (method === 0) {
      extractedFile = new File([compressedBlob], fileName, { type: mimeType });
    } else {
      const decompressed = await decompressDeflateRaw(compressedBlob);
      if (decompressed.byteLength > maxFileSize || totalUncompressed + decompressed.byteLength > maxTotalBytes) {
        tooLarge += 1;
        continue;
      }
      extractedFile = new File([decompressed], fileName, { type: mimeType });
    }

    totalUncompressed += extractedFile.size;
    files.push(extractedFile);
  }

  return { files, skipped, encrypted, empty, tooLarge };
}
