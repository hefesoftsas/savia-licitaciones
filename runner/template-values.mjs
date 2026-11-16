import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');

/** Fill a copy of a marked template. The source and unselected controls remain unchanged. */
export function fillTemplateValues(bytes, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Los valores de campos no son válidos.');
  const entries = Object.entries(values);
  if (!entries.length) return Buffer.from(bytes);
  if (entries.some(([id, value]) => !/^f\d+$/.test(id) || typeof value !== 'string' || !value.trim() || value.length > 5000 || /[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]/u.test(value))) throw new Error('Los valores de campos deben ser texto de una línea.');
  const zip = new AdmZip(bytes), xml = zip.readAsText('word/document.xml');
  if (!xml) throw new Error('La plantilla no contiene un documento Word válido.');
  const $ = cheerio.load(xml, { xmlMode: true });
  const local = node => node.type === 'tag' ? node.name.split(':').at(-1) : '';
  const matched = new Set();
  $('*').filter((_, node) => local(node) === 'sdt').each((_, control) => {
    const properties = $(control).children().filter((__, node) => local(node) === 'sdtPr').first();
    const tag = properties.children().filter((__, node) => local(node) === 'tag').first().get(0);
    const attribute = tag && Object.entries(tag.attribs || {}).find(([key]) => key.split(':').at(-1) === 'val')?.[1];
    if (!attribute?.startsWith('savia:field:')) return;
    const id = attribute.slice('savia:field:'.length);
    if (!Object.hasOwn(values, id)) return;
    if (matched.has(id)) throw new Error(`La plantilla contiene un campo duplicado: ${id}`);
    const content = $(control).children().filter((__, node) => local(node) === 'sdtContent').first();
    if (!content.length || content.find('*').filter((__, node) => local(node) === 'sdt').length) throw new Error(`El campo no se puede rellenar: ${id}`);
    const texts = content.find('*').filter((__, node) => local(node) === 't');
    if (!texts.length) throw new Error(`El campo no contiene texto editable: ${id}`);
    texts.each((index, node) => { $(node).text(index === 0 ? values[id] : ''); if (index === 0) $(node).attr('xml:space', 'preserve'); });
    content.find('*').filter((__, node) => local(node) === 'shd' && Object.entries(node.attribs || {}).some(([key, value]) => key.split(':').at(-1) === 'fill' && value.toUpperCase() === 'FCE8E6')).remove();
    properties.children().filter((__, node) => local(node) === 'showingPlcHdr').remove();
    matched.add(id);
  });
  if (matched.size !== entries.length) throw new Error('No se encontraron todos los campos en la plantilla.');
  zip.updateFile('word/document.xml', Buffer.from($.xml(), 'utf8'));
  return zip.toBuffer();
}
