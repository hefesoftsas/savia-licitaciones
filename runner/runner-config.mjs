export const EMPTY_RUNNER_CONFIG = Object.freeze({
  skills: [],
  hooks: {},
  prompts: {},
});

/**
 * Normalize raw runner config payloads from `/api/runner/config` or direct objects
 * into `{ skills, hooks, prompts }` with safe defaults.
 */
export function normalizeRunnerConfig(raw) {
  const source = raw && typeof raw === 'object' && raw.overrides && typeof raw.overrides === 'object'
    ? raw.overrides
    : raw;
  if (!source || typeof source !== 'object') {
    return { skills: [], hooks: {}, prompts: {} };
  }
  const skills = Array.isArray(source.skills)
    ? source.skills.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const hooks = {};
  if (source.hooks && typeof source.hooks === 'object' && !Array.isArray(source.hooks)) {
    for (const [key, value] of Object.entries(source.hooks)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      hooks[key] = {
        enabled: value.enabled !== false,
        ...(value.config && typeof value.config === 'object' && !Array.isArray(value.config)
          ? { config: { ...value.config } }
          : {}),
      };
    }
  }
  const prompts = {};
  if (source.prompts && typeof source.prompts === 'object' && !Array.isArray(source.prompts)) {
    for (const [key, value] of Object.entries(source.prompts)) {
      if (typeof value === 'string') {
        prompts[key] = value;
      }
    }
  }
  return { skills, hooks, prompts };
}

/**
 * Fetch active runner skills, hooks, and prompt overrides from `GET /api/runner/config`.
 * Falls back to empty defaults when offline, unauthenticated, or on any error.
 */
export async function fetchRunnerConfig({
  apiUrl,
  runnerToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  signal,
} = {}) {
  const baseUrl = typeof apiUrl === 'string' ? apiUrl.trim().replace(/\/+$/, '') : '';
  const token = typeof runnerToken === 'string' ? runnerToken.trim() : '';
  if (!baseUrl || !token || typeof fetchImpl !== 'function') {
    return { skills: [], hooks: {}, prompts: {} };
  }
  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const response = await fetchImpl(`${baseUrl}/api/runner/config`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
      redirect: 'error',
      signal: combinedSignal,
    });
    if (!response?.ok) {
      return { skills: [], hooks: {}, prompts: {} };
    }
    const payload = await response.json();
    return normalizeRunnerConfig(payload);
  } catch {
    return { skills: [], hooks: {}, prompts: {} };
  }
}

/**
 * Apply normalized runner configuration (skills, prompt overrides, hook overrides)
 * onto Pi session options without mutating the input object.
 */
export function applyRunnerConfigToPiOptions(piOptions = {}, runnerConfig) {
  const base = piOptions && typeof piOptions === 'object' ? piOptions : {};
  const normalized = normalizeRunnerConfig(runnerConfig);

  const workspaceOverride = typeof normalized.prompts['prompt:agent-workspace'] === 'string'
    && normalized.prompts['prompt:agent-workspace'].trim()
    ? normalized.prompts['prompt:agent-workspace']
    : null;

  const baseWorkspace = workspaceOverride
    ?? (typeof base.workspaceInstructions === 'string'
      ? base.workspaceInstructions
      : typeof base.environment?.instructions === 'string'
        ? base.environment.instructions
        : '');

  const skillsSection = normalized.skills.length
    ? `## Active Runner Skills\n\n${normalized.skills.join('\n\n')}`
    : '';

  const mergedWorkspaceInstructions = [baseWorkspace, skillsSection]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n\n');

  const promptOverrides = {
    ...(base.promptOverrides && typeof base.promptOverrides === 'object' ? base.promptOverrides : {}),
    ...(workspaceOverride ? { 'prompt:agent-workspace': workspaceOverride } : {}),
    ...(typeof normalized.prompts['prompt:pi-no-summary'] === 'string' && normalized.prompts['prompt:pi-no-summary'].trim()
      ? { 'prompt:pi-no-summary': normalized.prompts['prompt:pi-no-summary'] }
      : {}),
    ...(typeof normalized.prompts['prompt:fixed-tool-list'] === 'string' && normalized.prompts['prompt:fixed-tool-list'].trim()
      ? { 'prompt:fixed-tool-list': normalized.prompts['prompt:fixed-tool-list'] }
      : {}),
  };

  const hookOverrides = {
    ...(base.hookOverrides && typeof base.hookOverrides === 'object' ? base.hookOverrides : {}),
    ...normalized.hooks,
  };

  return {
    ...base,
    runnerConfig: normalized,
    hookOverrides,
    promptOverrides,
    ...(mergedWorkspaceInstructions ? { workspaceInstructions: mergedWorkspaceInstructions } : {}),
    ...(base.environment && typeof base.environment === 'object'
      ? {
          environment: {
            ...base.environment,
            ...(mergedWorkspaceInstructions ? { instructions: mergedWorkspaceInstructions } : {}),
          },
        }
      : {}),
  };
}
