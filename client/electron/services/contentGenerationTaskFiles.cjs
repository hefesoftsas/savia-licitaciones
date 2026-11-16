const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { AI_IMAGE_STYLES } = require('./aiImageStyles.cjs');

// Task files are written by agents and read by batch tools; fixed paths support predefined schemas, validated when submission tools read them.
const TASK_DIR = '任务';
// Program-generated manifests/results for on-demand agent reading, overwritten with tool calls.
const LIST_DIR = '程序清单';
// Single-section edits share the primary task workspace but use separate task/manifest subdirectories so neither cleans the other.
const SECTION_MODIFICATION_SUBDIR = '单节修改';
const TASK_FILES = {
  sections: '正文生成.json', images: '配图生成.json', renderHtml: 'HTML转图.json', renderMermaid: 'Mermaid转图.json',
  applyImages: '图片回填.json', repair: '一致性修复.json',
};
const LIST_FILES = {
  images: '正文图片清单.json', words: '正文字数统计.json', repair: '一致性修复结果.json',
  submission: '提交校验问题.json',
};
const TASK_FILE_WRITING = 'Finish writing the file before calling the corresponding tool to submit it. ';

const text = { type: 'string' };
const id = { type: 'string', minLength: 1 };
const regenerate = { type: 'boolean' };
const frameSize = { enum: ['square', 'wide', 'tall', 'panorama'] };
const aiSize = { type: 'string', pattern: '\\S' };
const aiStyle = { enum: Object.keys(AI_IMAGE_STYLES) };
const list = (key, items) => ({ type: 'object', additionalProperties: false, required: [key], properties: { [key]: { type: 'array', minItems: 1, items } } });
const object = (required, optional = {}) => ({
  type: 'object', additionalProperties: false, required: Object.keys(required), properties: { ...required, ...optional },
});
// kind accepts enabled generation methods only; exclude disabled fields/conditions from schemas and redeclare properties in then for Ajv strict mode.
function buildImagesSchema(kinds) {
  const ai = kinds.includes('ai');
  const html = kinds.includes('html');
  const conditions = [
    ...(ai ? [{ if: { properties: { kind: { const: 'ai' } } }, then: { properties: { size: aiSize, style: aiStyle }, required: ['size', 'style'] } }] : []),
    ...(html ? [{ if: { properties: { kind: { const: 'html' } } }, then: { properties: { frame_size: frameSize }, required: ['frame_size'] } }] : []),
  ];
  const imageItem = object({ image_id: id, kind: { enum: kinds }, prompt: { type: 'string', minLength: 1 } },
    { ...(ai ? { size: aiSize, title: text, style: aiStyle } : {}), ...(html ? { frame_size: frameSize } : {}), regenerate });
  return list('images', conditions.length ? { ...imageItem, allOf: conditions } : imageItem);
}
// Structure matches original tool parameters; schemas allow incremental writing, with completeness checked by business rules on submission. Build illustration schemas by enabled method.
const TASK_FILE_SCHEMAS = {
  sections: list('sections', object({ section_id: id, instructions: text, references: text }, { regenerate })),
  renderHtml: list('images', object({ image_id: id, source_file: id, frame_size: frameSize }, { regenerate })),
  renderMermaid: list('images', object({ image_id: id, source_file: id }, { regenerate })),
  applyImages: list('images', object({ image_id: id, asset_ref: id, previous_asset_ref: text })),
  repair: object({ sections: list('sections', object({ section_id: id, instructions: text })).properties.sections }, { rules: text }),
};
const ajv = new Ajv({ allErrors: true, strict: true });
const validators = Object.fromEntries(Object.entries(TASK_FILE_SCHEMAS).map(([key, schema]) => [key, ajv.compile(schema)]));
const imageValidators = new Map();

// Cache illustration validators by enabled method combination and compile each combination once.
function imagesValidator(kinds) {
  const key = kinds.join(',');
  if (!imageValidators.has(key)) imageValidators.set(key, ajv.compile(buildImagesSchema(kinds)));
  return imageValidators.get(key);
}

// Do not register rendering tasks for disabled methods, or illustration tasks when no method is available.
function taskFileEnabled(key, imageKinds) {
  if (key === 'images') return imageKinds.length > 0;
  if (key === 'renderHtml') return imageKinds.includes('html');
  if (key === 'renderMermaid') return imageKinds.includes('mermaid');
  return true;
}

function taskFilePath(key, dir = TASK_DIR) {
  return `${dir}/${TASK_FILES[key]}`;
}

// Task files are agent outputs and are not registered as protected files.
function taskFilePaths(dir = TASK_DIR) {
  return Object.keys(TASK_FILES).map(key => taskFilePath(key, dir));
}

// For agent self-checks with json-validation; primary tasks register every task file, single-section edits only image tasks.
function taskFileSchemas(dir = TASK_DIR, keys = Object.keys(TASK_FILES), imageKinds = []) {
  return Object.fromEntries(keys.filter(key => taskFileEnabled(key, imageKinds))
    .map(key => [taskFilePath(key, dir), key === 'images' ? buildImagesSchema(imageKinds) : TASK_FILE_SCHEMAS[key]]));
}

// Read complete task files on tool submission and return structural errors to the agent; validate illustration tasks against enabled methods.
function readTaskFile(workspaceDir, key, dir = TASK_DIR, imageKinds = []) {
  const file = taskFilePath(key, dir);
  const target = path.join(workspaceDir, file);
  if (!fs.existsSync(target)) throw new Error(`请先将任务写入 ${file}，再调用本工具提交`);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    throw new Error(`${file} 不是有效 JSON：${error.message}`);
  }
  const validate = key === 'images' ? imagesValidator(imageKinds) : validators[key];
  if (!validate(value)) throw new Error(`${file} 格式错误：${ajv.errorsText(validate.errors, { dataVar: file })}`);
  return value;
}

// Replace complete program manifests for agents to page through or search as needed.
function writeListFile(workspaceDir, key, value, dir = LIST_DIR) {
  const file = `${dir}/${LIST_FILES[key]}`;
  const target = path.join(workspaceDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(`${target}.tmp`, target);
  return file;
}

// Read a program manifest to accumulate this round's existing records; return null if absent.
function readListFile(workspaceDir, key, dir = LIST_DIR) {
  const target = path.join(workspaceDir, `${dir}/${LIST_FILES[key]}`);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
}

// New rounds clear prior task files and manifests; primary-task cleanup includes single-section-edit subdirectories.
function clearTaskArtifacts(workspaceDir, subdir = '') {
  for (const dir of [TASK_DIR, LIST_DIR]) fs.rmSync(path.join(workspaceDir, dir, subdir), { recursive: true, force: true });
}

// Send models only statistics and unsuccessful items; preserve full per-item results in tool details.
function compactResults(results) {
  const count = status => results.filter(item => item.status === status).length;
  return { total: results.length, success: count('success'), skipped: count('skipped'),
    unresolved: results.filter(item => !['success', 'skipped'].includes(item.status)) };
}

module.exports = {
  TASK_DIR, LIST_DIR, SECTION_MODIFICATION_SUBDIR, TASK_FILES, LIST_FILES, TASK_FILE_SCHEMAS, TASK_FILE_WRITING,
  taskFilePath, taskFilePaths, taskFileSchemas, readTaskFile, writeListFile, readListFile, clearTaskArtifacts, compactResults,
};
