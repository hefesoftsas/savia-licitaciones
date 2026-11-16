import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// The packaged application loads its renderer from dist/index.html inside ASAR.
export function pdfPreviewAssets() {
  return {
    workerUrl,
    wasmUrl: new URL(import.meta.env.DEV ? '/pdfjs-wasm/' : './pdfjs-wasm/', window.location.href).href,
  };
}
