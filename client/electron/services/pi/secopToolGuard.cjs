const fs = require('node:fs');
const path = require('node:path');
const { normalizeLocale } = require('../../utils/localeMessages.cjs');

const FILE_TOOLS = new Set(['read', 'write', 'edit', 'grep', 'find', 'ls']);
function filterSecopToolList(tools) { return [...new Set(tools.filter(name => name !== 'bash'))]; }
function spanishWorkspaceInstructions(text, locale = 'es') {
  const english = normalizeLocale(locale) === 'en';
  return String(text || '').replace(/简体中文|中文/g, english ? '英语' : '西班牙语') + (english
    ? '\nFor SECOP, ask questions and explain progress or failures to the user in English. Keep Colombian procurement deliverables in Spanish. Preserve protocol keys and values. Never invent facts.'
    : '\nPara SECOP, toda pregunta y todo texto visible para el usuario debe estar en español. Conserva las claves y valores del protocolo. Nunca inventes hechos.');
}
function spanishQuestionTool(tool, locale = 'es') {
  const english = normalizeLocale(locale) === 'en';
  const props = tool.parameters.properties;
  const optionProps = props.options?.items?.properties;
  return {
    ...tool,
    description: english ? 'Ask the user in English when essential information is missing. Offer clear options and identify the recommended one.' : 'Pregunta en español al usuario cuando falten datos decisivos. Ofrece opciones claras e indica la recomendada.',
    promptSnippet: english ? 'Ask in English when an important decision is missing.' : 'Pregunta en español si falta una decisión importante.',
    promptGuidelines: [english ? 'Write the question and all options in English, without internal names or technical jargon.' : 'Redacta la pregunta y todas las opciones en español, sin nombres internos ni términos técnicos.'],
    parameters: { ...tool.parameters, properties: {
      ...props,
      question: { ...props.question, description: english ? 'A short, clear question in English.' : 'Pregunta breve y clara en español.' },
      ...(props.options?.items ? { options: { ...props.options, items: { ...props.options.items, properties: {
        ...optionProps,
        label: { ...optionProps.label, description: english ? 'A short option label in English.' : 'Nombre breve de la opción en español.' },
        description: { ...optionProps.description, description: english ? 'The effect of the option, in English.' : 'Efecto de la opción en español.' },
      } } } } : {}),
    } },
  };
}
function spanishFailureTool(tool, locale = 'es') {
  const english = normalizeLocale(locale) === 'en';
  return { ...tool,
    description: english ? 'If the task cannot be completed without inventing information, report the problem in English and stop the task.' : 'Si no puedes completar la tarea sin inventar información, informa el problema en español y detén la tarea.',
    promptSnippet: english ? 'Report an unresolved failure in English.' : 'Informa en español una falla que no puedas resolver.',
    promptGuidelines: [english ? 'Do not invent facts or report success when data is missing or a tool fails.' : 'No inventes hechos ni informes éxito cuando falten datos o falle una herramienta.'],
    parameters: { ...tool.parameters, properties: { ...tool.parameters.properties,
      reason: { ...tool.parameters.properties.reason, description: english ? 'The specific cause of the failure, in English.' : 'Causa concreta de la falla, en español.' },
    } },
  };
}

function createSecopToolGuard(workspaceDir, locale = 'es') {
  const english = normalizeLocale(locale) === 'en';
  const pathMessage = english ? 'The path must be inside the procurement process folder.' : 'La ruta debe estar dentro de la carpeta del proceso.';
  const workspaceRoot = path.resolve(workspaceDir);
  const root = fs.realpathSync(workspaceRoot);
  function checkPath(value) {
    const input = typeof value === 'string' && value ? value : '.';
    // Pi expands @ and ~ and normalizes Unicode spaces before resolving paths.
    if (/^[~@]/.test(input) || /[\u0000-\u001f\u007f\u00a0\u202f]/.test(input)) throw new Error(pathMessage);
    let target = path.resolve(root, input);
    if (path.isAbsolute(input)) {
      const fromWorkspace = path.relative(workspaceRoot, target);
      if (fromWorkspace !== '..' && !fromWorkspace.startsWith(`..${path.sep}`) && !path.isAbsolute(fromWorkspace)) target = path.resolve(root, fromWorkspace);
    }
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || (process.platform === 'win32' && relative.includes(':'))) {
      throw new Error(pathMessage);
    }
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error(english ? 'Links are not allowed in the procurement files.' : 'No se permiten enlaces en los archivos del proceso.');
      } catch (error) {
        if (error.code === 'ENOENT') break;
        throw error;
      }
    }
  }
  return ({ toolCall, args = {} }) => {
    const name = toolCall?.name;
    if (name === 'bash') throw new Error(english ? 'Command execution is disabled for SECOP processes. Use the process file tools.' : 'La ejecución de comandos está deshabilitada para procesos SECOP. Usa las herramientas de archivos del proceso.');
    if (FILE_TOOLS.has(name)) {
      checkPath(args.path);
      const glob = name === 'find' ? args.pattern : name === 'grep' ? args.glob : undefined;
      if (typeof glob === 'string' && (path.isAbsolute(glob) || glob.split(/[\\/]/).includes('..') || glob.startsWith('-'))) throw new Error(english ? 'Searches must remain inside the procurement process folder.' : 'La búsqueda debe permanecer dentro de la carpeta del proceso.');
    }
    if (name === 'json-validation') checkPath(args.file_path);
    if (name === 'openxml' && args.fields_file) checkPath(args.fields_file);
    if (name === 'ask-user' || name === 'report-failure') {
      const texts = name === 'report-failure' ? [args.reason] : [args.question, ...(args.options || []).flatMap(option => [option.label, option.description])];
      for (const value of texts) {
        const text = String(value || '');
        const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
        const letters = (text.match(/[\p{L}]/gu) || []).length;
        if (cjk >= 2 && cjk / Math.max(letters, 1) > 0.3) throw new Error(english ? 'Write the question and its options in English for the user.' : 'La pregunta y sus opciones deben estar redactadas en español para el usuario.');
      }
    }
  };
}
module.exports = { createSecopToolGuard, filterSecopToolList, spanishQuestionTool, spanishFailureTool, spanishWorkspaceInstructions };
