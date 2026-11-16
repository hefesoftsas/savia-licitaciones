#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockFromPnpmList, verifyLockfile } from '../scripts/verify-dependency-age.mjs';

import { pruneDistribution } from './prune-distribution.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const index = args.indexOf('--output');
if (index < 0 || !args[index + 1] || !isAbsolute(args[index + 1])) throw new Error('Indica una ruta absoluta nueva con --output.');
const output = resolve(args[index + 1]);
const prepareCache = args.includes('--prepare-cache');
const target = `${process.platform}-${process.arch}`;
if (!['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-arm64', 'linux-x64'].includes(target)) throw new Error(`Plataforma sin herramientas preparadas: ${target}`);
try { await mkdir(output); } catch (error) { if (error.code === 'EEXIST') throw new Error('La carpeta de salida ya existe; elige otra.'); throw error; }
function execute(command, commandArgs, options = {}) {
  const child = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', ...options });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Falló la preparación (código ${child.status ?? child.signal}).`);
}
async function verifyLinks(directory, boundary) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) {
      const resolved = await realpath(path);
      if (resolved !== boundary && !resolved.startsWith(boundary + sep)) throw new Error(`Dependencia fuera de la distribución: ${path}`);
    } else if (item.isDirectory()) await verifyLinks(path, boundary);
  }
}
try {
  execute(process.execPath, [join(root, 'client/scripts/verify-agent-tools.cjs')]);
  const helperName = process.platform === 'win32' ? 'openxmlhelper.exe' : 'openxmlhelper';
  const helperSource = join(root, 'client', 'vendor', 'openxml-tools', target, helperName);
  try { if (!(await stat(helperSource)).isFile()) throw new Error('not a file'); }
  catch { throw new Error(`Falta el helper OpenXML para ${target}; prepáralo con node client/scripts/prepare-openxml-helper.cjs --platform ${process.platform} --arch ${process.arch}.`); }

  // pnpm deploy writes workspace-state metadata. Prepare an isolated workspace
  // so production-only deployment cannot alter the development installation.
  const source = join(output, '.build-source');
  await mkdir(source);
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']) await cp(join(root, name), join(source, name));
  for (const workspace of ['client', 'web-api']) {
    await mkdir(join(source, workspace), { recursive: true });
    await cp(join(root, workspace, 'package.json'), join(source, workspace, 'package.json'));
  }
  await cp(join(root, 'client', 'brand.json'), join(source, 'client', 'brand.json'));
  await cp(join(root, 'client', 'patches'), join(source, 'client', 'patches'), { recursive: true });
  const tracked = spawnSync('git', ['ls-files', '-z', '--', 'client/electron'], { cwd: root });
  if (tracked.error || tracked.status !== 0) throw new Error('No se pudieron enumerar los archivos versionados del cliente.');
  const sourceFiles = tracked.stdout.toString('utf8').split('\0').filter(Boolean);
  if (!sourceFiles.length) throw new Error('No se encontraron archivos versionados del cliente.');
  for (const path of sourceFiles) {
    const destination = join(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, path), destination);
  }
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry && process.platform === 'win32') throw new Error('En Windows ejecuta este comando con pnpm run build:runner.');
  const pnpmCommand = pnpmEntry ? process.execPath : 'pnpm';
  const pnpmArgs = pnpmEntry ? [pnpmEntry] : [];
  const deployBase = ['--dir', source, '--filter', 'savia-licitaciones', 'deploy', '--prod', '--legacy', '--frozen-lockfile', '--ignore-scripts'];
  if (prepareCache) {
    // Network access is explicit. Check every locked dependency before warming pnpm metadata.
    const listed = spawnSync(pnpmCommand, [...pnpmArgs, 'list', '--lockfile-only', '--json', '--recursive', '--depth', 'Infinity'], {cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
    if (listed.error || listed.status !== 0) throw new Error('No se pudo verificar el lockfile para preparar la caché.');
    const checked = await verifyLockfile(lockFromPnpmList(JSON.parse(listed.stdout), await readFile(join(root,'pnpm-lock.yaml'),'utf8')));
    console.log(`Antigüedad verificada para ${checked} referencias de dependencias.`);
    const warmup = join(output, '.cache-warmup');
    execute(pnpmCommand, [...pnpmArgs, ...deployBase, warmup]);
    await rm(warmup, { recursive: true, force: true });
  }
  execute(pnpmCommand, [...pnpmArgs, ...deployBase, '--offline', join(output, 'client')]);
  await rm(source, { recursive: true, force: true });
  const client = join(output, 'client');
  const keep = new Set(['electron', 'node_modules', 'brand.json', 'package.json']);
  for (const name of await readdir(client)) if (!keep.has(name)) await rm(join(client, name), { recursive: true, force: true });
  // pnpm deploy may add a workspace self-link pointing back to the checkout.
  // The runtime loads its files directly and must not depend on that link.
  await rm(join(client, 'node_modules', '.pnpm', 'node_modules', 'savia-licitaciones'), { force: true });
  const runtimeRoots=JSON.parse(await readFile(join(root,'runner/runtime-dependencies.json'),'utf8'));
  const reduced=await pruneDistribution(client,runtimeRoots);
  console.log(`Runner: ${reduced.packages} paquetes de ejecución; mapas de depuración excluidos.`);
  const toolsRoot = join(client, 'vendor', 'agent-tools');
  await rm(toolsRoot, { recursive: true, force: true });
  await mkdir(toolsRoot, { recursive: true });
  await cp(join(root, 'client/vendor/agent-tools', target), join(toolsRoot, target), { recursive: true });
  const manifest = JSON.parse(await readFile(join(toolsRoot, target, 'manifest.json'), 'utf8'));
  for (const name of ['rg', 'fd', 'jq']) {
    const tool = manifest.tools.find(item => item.command === name);
    const bytes = await readFile(join(toolsRoot, target, 'bin', name + (process.platform === 'win32' ? '.exe' : '')));
    if (!tool?.binary_sha256 || createHash('sha256').update(bytes).digest('hex') !== tool.binary_sha256) throw new Error(`La herramienta ${name} no coincide con el manifiesto.`);
  }
  const helperDir = join(client, 'vendor', 'openxml-tools', target);
  await mkdir(helperDir, { recursive: true });
  const helperDestination = join(helperDir, helperName);
  await cp(helperSource, helperDestination);
  const helperHash = createHash('sha256').update(await readFile(helperDestination)).digest('hex');
  await verifyLinks(join(client, 'node_modules'), await realpath(client));
  await verifyLinks(join(client, 'electron'), await realpath(client));
  await mkdir(join(output, 'runner'));
  for (const name of ['word-format-preview.mjs', 'launcher.mjs', 'user-service.mjs', 'runner-lock.mjs', 'runner-config.mjs', 'file-stream.mjs', 'large-artifact-upload.mjs', 'artifact-outbox.mjs', 'bid-evaluation-import-contract.mjs', 'project-evaluation-restore.mjs', 'cli.mjs', 'doctor.mjs', 'managed-workspaces.mjs', 'cloud-snapshot-archive.mjs', 'account-preferences-snapshot.mjs', 'account-company-profile-capture.mjs', 'account-company-profile-snapshot.mjs', 'account-image-library-snapshot.mjs', 'account-rup-snapshot.mjs', 'account-certificates-snapshot.mjs', 'account-export-format-snapshot.mjs', 'account-paa-snapshot.mjs', 'account-experience-snapshot.mjs', 'account-knowledge-capture.mjs', 'account-knowledge-restore.mjs', 'account-feasibility-capture.mjs', 'account-feasibility-validate.mjs', 'account-feasibility-restore.mjs', 'feasibility-state-contract.mjs', 'feasibility-snapshot-contract.mjs', 'project-addendum-history.mjs', 'project-component-capture.mjs', 'project-component-restore.mjs', 'project-multipart-restore.mjs', 'project-knowledge-restore.mjs', 'project-context-restore.mjs', 'project-chat-restore.mjs', 'project-secop-restore.mjs', 'project-offer-restore.mjs', 'project-blind-profile-restore.mjs', 'project-blind-capture.mjs', 'project-blind-large-upload.mjs', 'project-blind-restore.mjs', 'project-rejection-draft-restore.mjs', 'project-review-capture.mjs', 'project-review-restore.mjs', 'project-submission-capture.mjs', 'project-submission-restore.mjs', 'project-offer-documents-capture.mjs', 'project-offer-documents-restore.mjs', 'project-review-remap.mjs', 'project-comparison-restore.mjs', 'secop-zip.mjs', 'desktop-capture.mjs', 'desktop-backup.mjs', 'desktop-submission.mjs', 'desktop-submission-transfer.mjs', 'desktop-addendum.mjs', 'desktop-addendum-transfer.mjs', 'desktop-offer-documents.mjs', 'desktop-offer-transfer.mjs', 'desktop-assets.mjs', 'desktop-duplicate-check.mjs', 'desktop-rejection-check.mjs', 'desktop-bid-evaluation.mjs', 'desktop-plan-documents.mjs', 'desktop-feasibility.mjs', 'feasibility-export.mjs', 'feasibility-extract.mjs', 'text-provider.mjs', 'local-opencode-config.mjs', 'pi-progress.mjs', 'job-activity.mjs', 'process-console.mjs', 'pi-usage.mjs', 'feasibility-analysis.mjs', 'feasibility-outline.mjs', 'feasibility-parameters.mjs', 'feasibility-content.mjs', 'duplicate-check.mjs', 'bid-evaluation.mjs', 'rejection-check.mjs', 'blind-check.mjs', 'work-loop.mjs', 'worker-pool.mjs', 'isolated-worker.mjs', 'local-ocr.mjs', 'local-ocr-worker.mjs', 'tender-chat.mjs', 'technical-plan.mjs', 'technical-plan-batch.mjs', 'technical-content-planner.mjs', 'technical-content-planning.mjs', 'technical-word-budget.mjs', 'technical-word-guard.mjs', 'technical-word-editable.mjs', 'technical-word-adjuster.mjs', 'technical-word-stage.mjs', 'technical-consistency.mjs', 'technical-consistency-contract.mjs', 'technical-consistency-ledger.mjs', 'technical-analysis.mjs', 'technical-outline-roots.mjs', 'technical-outline-expand.mjs', 'template-extraction.mjs', 'template-values.mjs', 'global-facts.mjs', 'technical-plan-export.mjs', 'rup-analysis.mjs', 'opportunity-analysis.mjs', 'opportunity-runner-scheduler.mjs', 'knowledge-analysis.mjs', 'requirement-suggestions.mjs', 'task-errors.mjs', 'outbox.mjs']) await cp(join(root, 'runner', name), join(output, 'runner', name));
  await cp(join(root,'runner','preview-wake.mjs'),join(output,'runner','preview-wake.mjs'));
  await cp(join(root,'runner','cloudflare-access.mjs'),join(output,'runner','cloudflare-access.mjs'));
  await mkdir(join(client,'assets'),{recursive:true});
  await cp(join(root,'client','assets','content-template-preview'),join(client,'assets','content-template-preview'),{recursive:true});
  await cp(join(root,'runner','account-components-capture.mjs'),join(output,'runner','account-components-capture.mjs'));
  await cp(join(root,'runner','account-components-restore.mjs'),join(output,'runner','account-components-restore.mjs'));
  await cp(join(root,'runner','account-projects-capture.mjs'),join(output,'runner','account-projects-capture.mjs'));
  await cp(join(root,'runner','account-projects-restore.mjs'),join(output,'runner','account-projects-restore.mjs'));
  const launcher = process.platform === 'darwin' ? 'Iniciar-Savia.command' : process.platform === 'win32' ? 'Iniciar-Savia.cmd' : 'Iniciar-Savia.sh';
  await cp(join(root, 'runner/launchers', launcher), join(output, launcher));
  await cp(join(root, 'runner/DISTRIBUTION.md'), join(output, 'README.md'));
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ format: 1, platform: process.platform, arch: process.arch, nodeMinimum: '22.13.0', openxml: { path: `client/vendor/openxml-tools/${target}/${helperName}`, sha256: helperHash }, tools: manifest.tools.map(({ command, version, binary_sha256 }) => ({ command, version, binary_sha256 })) }, null, 2) + '\n', 'utf8');
  console.log(`Distribución preliminar preparada: ${output}`);
} catch (error) {
  await rm(output, { recursive: true, force: true });
  throw error;
}
