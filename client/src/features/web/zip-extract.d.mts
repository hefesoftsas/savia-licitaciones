export const SUPPORTED_DOCUMENT_EXTENSIONS: readonly string[];
export const PROJECT_DOCUMENT_ACCEPT: string;

export function getFileExtension(name: string): string;
export function isZipFileName(name: string): boolean;
export function isSupportedDocumentName(name: string): boolean;

export interface ZipExtractResult {
  files: File[];
  skipped: number;
  encrypted: number;
  empty: number;
  tooLarge: number;
}

export function extractZipDocuments(
  zipFile: Blob,
  options?: { maxFileSize?: number; maxFiles?: number; maxTotalBytes?: number },
): Promise<ZipExtractResult>;
