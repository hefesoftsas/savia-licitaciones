import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { extractCpvCodes, matchCpvCodes } from '../opportunity-analysis.mjs';

const require = createRequire(import.meta.url);
const { SPAIN_DOCUMENT_TEMPLATES, SPAIN_EXPORT_TEMPLATES } = require('../../client/electron/services/spainTemplates.cjs');
const { SYSTEM_EXPORT_TEMPLATES } = require('../../client/electron/services/systemExportTemplates.cjs');
const { isSpanishAccreditation, buildAccreditationPrompt } = require('../../client/electron/services/rupAgentService.cjs');
const { isSpanishLcspTender, buildTenderContextMessages, getBidAnalysisTaskById } = require('../../client/electron/services/bidAnalysisTask.cjs');
const { formatProjectInfo, buildAnalysisSystemPrompt } = require('../../client/electron/services/feasibilityReportPrompts.cjs');
const { findBuiltinPreset } = require('../../client/electron/services/blindCheckPresets.cjs');
const { locateFormatExcerpts } = require('../../client/electron/services/blindCheckPresetExtraction.cjs');

test('spainTemplates exports A4 Latin export presets and LCSP document templates', () => {
  assert.equal(SPAIN_EXPORT_TEMPLATES.length, 3);
  for (const tpl of SPAIN_EXPORT_TEMPLATES) {
    assert.equal(tpl.config.page.paper_size, 'a4');
    assert.equal(tpl.config.body_text.font, 'Calibri');
    assert.equal(tpl.config.headings[0].font, 'Arial');
    assert.equal(tpl.config.headings[0].numbering_template, '{full}');
    assert.ok(SYSTEM_EXPORT_TEMPLATES.some(item => item.template_id === tpl.template_id));
  }

  const ids = SPAIN_DOCUMENT_TEMPLATES.map(item => item.id);
  assert.deepEqual(ids, ['es-sobre-a-deuc', 'es-memoria-tecnica', 'es-solvencia-equipo', 'es-oferta-economica']);
  const econ = SPAIN_DOCUMENT_TEMPLATES.find(item => item.id === 'es-oferta-economica');
  assert.ok(econ.html.includes('EUR'));
  assert.ok(econ.html.includes('IVA'));
  const sobreA = SPAIN_DOCUMENT_TEMPLATES.find(item => item.id === 'es-sobre-a-deuc');
  assert.ok(sobreA.html.includes('DEUC'));
  assert.ok(sobreA.html.includes('ROLECE'));
});

test('extractCpvCodes and matchCpvCodes normalize and match 8-digit CPV codes', () => {
  const extracted = extractCpvCodes('Objeto: Servicios TI (CPV 72200000-7 y 72267100-0).');
  assert.deepEqual(extracted, ['72200000', '72267100']);
  assert.deepEqual(matchCpvCodes(['72200000'], ['72267100', '45000000']), ['72267100']);
  assert.deepEqual(matchCpvCodes(['48000000'], ['48210000', '72200000']), ['48210000']);
});

test('rupAgentService detects Spanish ROLECE/DEUC accreditation vs Colombian RUP', () => {
  assert.equal(isSpanishAccreditation([{ text: 'Certificado ROLECE - Clasificación empresarial NIF B12345678' }]), true);
  assert.equal(isSpanishAccreditation([{ text: 'Cámara de Comercio de Bogotá - RUP UNSPSC' }]), false);
  assert.equal(isSpanishAccreditation([{ text: 'Generic' }], 'ES'), true);
  assert.match(buildAccreditationPrompt(false, true), /ROLECE.*EUR.*CPV/s);
  assert.match(buildAccreditationPrompt(false, false), /Colombian RUP.*UNSPSC/s);
});

test('bidAnalysisTask and feasibilityReportPrompts inject Spanish LCSP context when applicable', () => {
  const sample = 'PLACSP Expediente 2026/001. PCAP y PPT conforme a la Ley 9/2017 (LCSP). Presupuesto Base de Licitación.';
  assert.equal(isSpanishLcspTender(sample), true);
  assert.equal(isSpanishLcspTender('Licitación pública estándar'), false);
  const messages = buildTenderContextMessages(sample);
  assert.ok(messages.some(m => m.role === 'system' && m.content.includes('Ley 9/2017')));
  assert.ok(getBidAnalysisTaskById('projectInfo'));

  const formatted = formatProjectInfo({ jurisdiction: 'ES', projectName: 'Contrato TI' });
  assert.ok(formatted.includes('[Pendiente por completar]'));
  assert.ok(formatted.includes('EUR'));
  assert.match(buildAnalysisSystemPrompt({ jurisdiction: 'ES' }), /LCSP/);
});

test('blindCheckPresets includes builtin-es-sobre-b and extraction finds Spanish PCAP formatting excerpts', () => {
  const preset = findBuiltinPreset('builtin-es-sobre-b');
  assert.ok(preset);
  assert.equal(preset.profile.page.paper, 'A4');
  assert.equal(preset.profile.body.font_en, 'Arial');
  assert.equal(preset.profile.body.size_pt, 11);
  assert.equal(preset.profile.body.line_rule, 'multiple');
  assert.equal(preset.profile.body.line_multiple, 1.15);

  const spanishPcap = [
    'Cláusula 12. Sobre B: Memoria técnica (criterios sujetos a juicio de valor).',
    'La extensión máxima será de 40 páginas en formato A4.',
    'Se utilizará fuente Arial o Calibri tamaño 11 pt, interlineado 1,15 y márgenes de 2,5 cm.',
    'El encabezado y pie de página solo contendrán numeración.',
  ].join('\n');
  const excerpts = locateFormatExcerpts(spanishPcap);
  assert.ok(excerpts.excerpts.length >= 1);
  assert.ok(excerpts.text.includes('Arial'));
});
