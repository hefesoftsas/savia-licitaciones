import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blindCheckRuleNames, localizeBlindCheckProgress } from './blindCheckProgress.mjs';

test('all built-in document rule names have Spanish progress labels', () => {
  const dir = fileURLToPath(new URL('../../../../openxmlhelper/src/OpenXmlHelper/BlindCheck/Rules/', import.meta.url));
  const titles = new Set();
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.cs'))) {
    for (const match of fs.readFileSync(path.join(dir, name), 'utf8').matchAll(/Title\s*=\s*"([^"]+)"/g)) titles.add(match[1]);
  }
  assert.ok(titles.size >= 60);
  for (const title of titles) assert.ok(blindCheckRuleNames[title], `Falta traducción: ${title}`);
});

test('translates recognized progress without changing other messages', () => {
  assert.equal(localizeBlindCheckProgress('正在检查：纸张大小', 'es'), 'Revisando: tamaño de papel');
  assert.equal(localizeBlindCheckProgress('正在修复：字号', 'es'), 'Corrigiendo: tamaño de fuente');
  assert.equal(localizeBlindCheckProgress('正在检查：文件名', 'es'), '正在检查：文件名');
  assert.equal(localizeBlindCheckProgress('正在检查：纸张大小', 'zh'), '正在检查：纸张大小');
});

test('translates document review and repair activity while preserving filenames and details', () => {
  const examples = [
    ['开始检查「张伟.docx」，格式预设：Estándar。', 'Iniciando la revisión de «张伟.docx» con el formato «Estándar».'],
    ['正在检查图片颜色（2/7）', 'Revisando el color de las imágenes (2/7).'],
    ['开始修复「oferta.docx」，本次修复范围共 12 处问题。', 'Iniciando la corrección de «oferta.docx»: 12 problemas incluidos.'],
    ['正在把 3 张彩色图片转为灰度', 'Convirtiendo 3 imágenes de color a escala de grises.'],
    ['程序修复完成：共修改 8 处。', 'Corrección automática terminada: 8 cambios.'],
    ['AI 正在对照「pliego.pdf」复核，通常需要几分钟。', 'La IA está revisando el documento frente a «pliego.pdf»; puede tardar unos minutos.'],
    ['AI 复核完成：对照招标条款 4 条（不符合 1 条），补充问题 2 个，判定候选问题 3 项。', 'Revisión con IA terminada: 4 cláusulas revisadas (1 incumplidas), 2 problemas adicionales y 3 posibles problemas evaluados.'],
    ['修复完成：已修复 2 处，待人工处理 1 处。', 'Corrección terminada: 2 problemas corregidos y 1 pendientes de revisión manual.'],
    ['修复完成：已修复 2 处，待人工处理 1 处（自动修复未完成：AI 修复失败）。', 'Corrección terminada: 2 problemas corregidos y 1 pendientes de revisión manual (corrección automática incompleta: Falló la corrección con IA).'],
    ['AI 复核失败：timeout', 'Falló la revisión con IA: timeout'],
  ];
  for (const [source, expected] of examples) assert.equal(localizeBlindCheckProgress(source, 'es'), expected);
  assert.equal(localizeBlindCheckProgress(examples[0][0], 'zh'), examples[0][0]);
});
