const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const JSON_VALIDATION_TOOL_NAME = 'json-validation';

// Normalize workspace-relative paths for file reads and predefined-schema matching.
function normalizeWorkspaceFilePath(filePath) {
  const relativePath = String(filePath || '').trim().replace(/\\/g, '/');
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('file_path 必须是当前工作区内的非空相对路径');
  }
  return path.posix.normalize(relativePath);
}

// Resolve agent-provided relative paths within the current workspace.
function resolveWorkspaceFile(workspaceDir, filePath) {
  const relativePath = normalizeWorkspaceFilePath(filePath);
  const workspaceRoot = path.resolve(workspaceDir);
  const resolvedPath = path.resolve(workspaceRoot, relativePath);
  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error(`file_path 超出当前工作区：${filePath}`);
  }
  return { relativePath, resolvedPath };
}

// Convert Ajv errors into structures agents can locate and repair easily.
function normalizeAjvErrors(errors = []) {
  return errors.map((error) => ({
    instancePath: error.instancePath || '/',
    schemaPath: error.schemaPath || '',
    keyword: error.keyword || '',
    message: error.message || '字段不符合 JSON Schema',
    params: error.params || {},
  }));
}

// Build consistent tool responses.
function createToolResult({ filePath, valid, stage, errors = [] }) {
  const payload = {
    valid,
    stage,
    file_path: filePath,
    errors,
    message: valid
      ? 'JSON.parse 和 Ajv 校验均已通过。'
      : '校验未通过，请根据 errors 修复文件后重新校验。',
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    details: payload,
    ...(valid ? {} : { isError: true }),
  };
}

// Agent self-check validator: predefined-schema files need only paths; callers provide schemas for others. Task submission centrally validates final results.
function createPiJsonValidator({ workspaceDir, validationSchemas = {} }) {
  const ajv = new Ajv({ allErrors: true, strict: true });

  // Match predefined rules case-insensitively on Windows.
  function fileKey(filePath) {
    const resolvedPath = path.resolve(workspaceDir, String(filePath || ''));
    return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
  }

  const presetSchemas = new Map(Object.entries(validationSchemas).map(([filePath, schema]) => [
    fileKey(normalizeWorkspaceFilePath(filePath)),
    schema,
  ]));

  function validateContent(filePath, source, suppliedSchema) {
    const relativePath = path.relative(workspaceDir, path.resolve(workspaceDir, filePath)).split(path.sep).join('/');
    let data;
    try {
      data = JSON.parse(source);
    } catch (error) {
      return createToolResult({
        filePath: relativePath, valid: false, stage: 'parse',
        errors: [{ message: error?.message || String(error) }],
      });
    }

    let validate;
    try {
      const key = fileKey(filePath);
      const schema = presetSchemas.has(key) ? presetSchemas.get(key) : suppliedSchema;
      if (schema === undefined) throw new Error(`任务未为 ${relativePath} 预置 Schema，调用时必须提供 schema`);
      validate = ajv.compile(schema);
    } catch (error) {
      return createToolResult({
        filePath: relativePath, valid: false, stage: 'schema',
        errors: [{ message: error?.message || String(error) }],
      });
    }

    return createToolResult(validate(data)
      ? { filePath: relativePath, valid: true, stage: 'success' }
      : { filePath: relativePath, valid: false, stage: 'validation', errors: normalizeAjvErrors(validate.errors) });
  }

  // Independently check existing files, retaining relative-path constraints and read-failure feedback.
  function validateFile(filePath, schema) {
    let source;
    let relativePath;
    try {
      const resolved = resolveWorkspaceFile(workspaceDir, filePath);
      relativePath = resolved.relativePath;
      source = fs.readFileSync(resolved.resolvedPath, 'utf8');
    } catch (error) {
      return createToolResult({
        filePath, valid: false, stage: 'read', errors: [{ message: error?.message || String(error) }],
      });
    }
    return validateContent(relativePath, source, schema);
  }

  return {
    hasPreset: (filePath) => presetSchemas.has(fileKey(filePath)),
    validateContent,
    validateFile,
  };
}

// Create a standalone validation tool that still supports existing-file-only checks and caller-provided schemas.
function createPiJsonValidationTool({ Type, validator }) {
  return {
    name: JSON_VALIDATION_TOOL_NAME,
    label: 'JSON 校验',
    description: '使用 JSON.parse 和 Ajv 校验当前工作区内的 JSON 文件。任务已预置 Schema 时只传 file_path；没有预置时根据输出要求提供完整 schema。校验失败后修复文件并再次调用。',
    promptSnippet: '使用 JSON.parse 和 Ajv 校验工作区内的 JSON 文件。',
    parameters: Type.Object({
      file_path: Type.String({
        minLength: 1,
        description: '待校验 JSON 文件相对于当前工作区的路径。',
      }),
      schema: Type.Optional(Type.Union([
        Type.Object({}, { additionalProperties: true }),
        Type.Boolean(),
      ], {
        description: '仅在任务没有为目标文件预置 Schema 时提供，根据当前任务输出要求构造 JSON Schema Draft-07。',
      })),
    }, { additionalProperties: false }),
    execute: async (_toolCallId, params) => validator.validateFile(params.file_path, params.schema),
  };
}

module.exports = {
  JSON_VALIDATION_TOOL_NAME,
  createPiJsonValidator,
  createPiJsonValidationTool,
};
