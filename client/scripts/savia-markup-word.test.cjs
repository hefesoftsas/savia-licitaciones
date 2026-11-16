const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { COLOMBIA_DOCUMENT_TEMPLATES } = require('../electron/services/colombiaTemplates.cjs');
const { createOpenXmlHelperService } = require('../electron/services/openXmlHelperService.cjs');

test('Word conserva tablas e imágenes de documentos con atributos anteriores', async () => {
  const client = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'savia-word-compat-'));
  const helper = createOpenXmlHelperService({
    app: { isPackaged: false, getPath: () => dir, getAppPath: () => client },
    configStore: { load: () => ({ ui_language: 'es' }) },
  });
  try {
    const html = '<p>Texto de prueba</p><table data-sv-preset="headerRow"><tbody><tr><th>Encabezado</th></tr><tr><td>Valor</td></tr></tbody></table><figure data-sv-size="wide"><img data-sv-asset-ref="fig.png"></figure>';
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64');
    const options = { copyAssets: true, assets: new Map([['fig.png', image]]) };
    const current = await helper.createRestrictedHtmlDocx(html, COLOMBIA_DOCUMENT_TEMPLATES[0].config, options);
    const previous = await helper.createRestrictedHtmlDocx(html.replaceAll('data-sv-', 'data-xx-'), COLOMBIA_DOCUMENT_TEMPLATES[0].config, options);
    const extract = result => {
      const zip = new AdmZip(Buffer.from(result.bytes));
      assert.ok(zip.getEntries().some(entry => /(?:^|\/)media\/[^/]+$/.test(entry.entryName)));
      return zip.readAsText('word/document.xml').replace(/r:(?:id|embed)="[^"]+"/g, 'r:id="ID"');
    };
    const previousXml = extract(previous);
    assert.match(previousXml, /w:drawing/);
    assert.match(previousXml, /w:tbl/);
    assert.equal(previousXml, extract(current));
  } finally {
    await helper.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
