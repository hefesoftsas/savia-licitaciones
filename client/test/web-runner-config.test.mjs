import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('RunnerConfigList muestra categorías, estado y acciones en español e inglés', async () => {
  const server = await createServer({
    configFile: resolve(root, 'vite.web.config.ts'),
    root,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const { RunnerConfigList } = await server.ssrLoadModule('/src/features/web/WebRunnerConfig.tsx');
    const items = [
      {
        id: 'skill:secop-research',
        category: 'skill',
        title: 'Investigación SECOP',
        sourcePath: 'skills/secop-research.md',
        content: '# SECOP',
        enabled: true,
        isBuiltIn: true,
        isCustomized: false,
      },
      {
        id: 'hook:task-completion',
        category: 'hook',
        title: 'Cierre de tareas',
        sourcePath: 'hooks/task-completion.json',
        content: '{"strict":true}',
        enabled: false,
        isBuiltIn: true,
        isCustomized: true,
      },
      {
        id: 'prompt:custom-summary',
        category: 'prompt',
        title: 'Resumen personalizado',
        content: 'Resume el pliego.',
        enabled: true,
        isBuiltIn: false,
        isCustomized: true,
      },
    ];

    const renderEs = renderToStaticMarkup(
      React.createElement(RunnerConfigList, { language: 'es', items, onEdit() {} }),
    );
    assert.match(renderEs, /Skill/);
    assert.match(renderEs, /Hook/);
    assert.match(renderEs, /Prompt/);
    assert.match(renderEs, /Investigación SECOP/);
    assert.match(renderEs, /skill:secop-research/);
    assert.match(renderEs, /Por defecto/);
    assert.match(renderEs, /Personalizado/);
    assert.match(renderEs, /Activo/);
    assert.match(renderEs, /Inactivo/);
    assert.match(renderEs, /Ver \/ Editar/);

    const renderEn = renderToStaticMarkup(
      React.createElement(RunnerConfigList, { language: 'en', items, onEdit() {} }),
    );
    assert.match(renderEn, /Default/);
    assert.match(renderEn, /Custom/);
    assert.match(renderEn, /Active/);
    assert.match(renderEn, /Inactive/);
    assert.match(renderEn, /View \/ Edit/);

    const emptyEs = renderToStaticMarkup(
      React.createElement(RunnerConfigList, { language: 'es', items: [], onEdit() {} }),
    );
    assert.match(emptyEs, /No hay elementos de configuración/);
  } finally {
    await server.close();
  }
});

test('WebRunnerConfig y WebAdmin renderizan la pestaña de Skills, Hooks y Prompts en es y en', async () => {
  const server = await createServer({
    configFile: resolve(root, 'vite.web.config.ts'),
    root,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const { default: WebRunnerConfig } = await server.ssrLoadModule('/src/features/web/WebRunnerConfig.tsx');
    const { default: WebAdmin } = await server.ssrLoadModule('/src/features/web/WebAdmin.tsx');
    const { ToastProvider } = await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx');

    const configEs = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(WebRunnerConfig, { language: 'es' })),
    );
    assert.match(configEs, /Todos/);
    assert.match(configEs, /Skill/);
    assert.match(configEs, /Hook/);
    assert.match(configEs, /Prompt/);
    assert.match(configEs, /Nuevo/);

    const configEn = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(WebRunnerConfig, { language: 'en' })),
    );
    assert.match(configEn, /All/);
    assert.match(configEn, /New/);

    const adminEs = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(WebAdmin, { language: 'es', currentUserId: 'admin-1' })),
    );
    assert.match(adminEs, /data-admin-tab="runner-config"/);
    assert.match(adminEs, /Skills, Hooks y Prompts/);

    const adminEn = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(WebAdmin, { language: 'en', currentUserId: 'admin-1' })),
    );
    assert.match(adminEn, /data-admin-tab="runner-config"/);
    assert.match(adminEn, /Skills, Hooks &amp; Prompts/);
  } finally {
    await server.close();
  }
});
