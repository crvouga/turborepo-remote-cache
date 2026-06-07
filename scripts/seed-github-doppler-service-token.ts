#!/usr/bin/env bun
/**
 * Read or rotate `DOPPLER_SERVICE_TOKEN` and upsert it into GitHub Actions
 * repo secrets via `gh secret set`.
 *
 * CI passes this token as `DOPPLER_TOKEN` for `doppler run` against `dev` and
 * `prd`. Use a project-wide token (from `doppler login`), not a config-scoped
 * service token (`dp.st.…`).
 *
 * Usage:
 *   bun run gh:seed-doppler-service-token
 *   bun run gh:seed-doppler-service-token -- --rotate
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { DOPPLER_SETUP_CONFIGS } from './doppler-secrets-registry';
import { resolveDopplerScope } from './doppler-yaml-defaults';

const REPO_ROOT = join(import.meta.dirname, '..');
const SECRET_NAME = 'DOPPLER_SERVICE_TOKEN';
const DEFAULT_DOPPLER_CONFIG = 'prd';

const KNOWN_TOKEN_PREFIXES = ['dp.st.', 'dp.ct.', 'dp.pt.', 'dp.sa.'] as const;
const CONFIG_SCOPED_PREFIX = 'dp.st.';

type RunCaptureResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
};

function fail(message: string): never {
  console.error(`seed-github-doppler-service-token: ${message}`);
  process.exit(1);
}

function runCapture(
  command: string,
  args: readonly string[],
  options?: { input?: string; env?: NodeJS.ProcessEnv }
): RunCaptureResult {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: options?.input,
    env: options?.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error !== undefined) {
    fail(`failed to spawn \`${command}\`: ${result.error.message}`);
  }

  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    status: result.status,
  };
}

function runOrFail(
  command: string,
  args: readonly string[],
  label: string,
  options?: { input?: string; env?: NodeJS.ProcessEnv }
): string {
  const { stdout, stderr, status } = runCapture(command, args, options);
  if (status !== 0) {
    const detail = stderr.length > 0 ? stderr : stdout;
    fail(
      `${label} failed (exit ${status ?? 'unknown'})${detail ? `: ${detail}` : ''}`
    );
  }
  return stdout;
}

function parseRotateFlag(): boolean {
  return process.argv.slice(2).includes('--rotate');
}

function resolveScope(): { project: string; config: string } {
  return resolveDopplerScope({
    envProject: process.env['DOPPLER_PROJECT'],
    envConfig: process.env['DOPPLER_CONFIG'] ?? DEFAULT_DOPPLER_CONFIG,
    configureProject: null,
    configureConfig: null,
  });
}

function isValidDopplerToken(token: string): boolean {
  return KNOWN_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function preflight(): void {
  runOrFail('doppler', ['--version'], 'doppler CLI check');
  runOrFail('gh', ['auth', 'status'], 'gh auth check');
}

function tryFetchTokenFromDoppler(
  project: string,
  config: string
): string | null {
  const { stdout, status } = runCapture('doppler', [
    'secrets',
    'get',
    SECRET_NAME,
    '--plain',
    '--project',
    project,
    '--config',
    config,
  ]);
  if (status !== 0 || stdout.length === 0) {
    return null;
  }
  return stdout;
}

function tryFetchTokenFromEnv(): string | null {
  for (const key of ['DOPPLER_SERVICE_TOKEN', 'DOPPLER_TOKEN'] as const) {
    const value = process.env[key]?.trim();
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return null;
}

function tryFetchTokenFromCli(): string | null {
  const { stdout, status } = runCapture('doppler', [
    'configure',
    'get',
    'token',
    '--plain',
  ]);
  if (status !== 0 || stdout.length === 0) {
    return null;
  }
  return stdout;
}

function validateToken(token: string, source: string): string {
  if (token.length === 0) {
    fail(`${source} resolved a blank ${SECRET_NAME}`);
  }
  if (!isValidDopplerToken(token)) {
    fail(
      `${source} token has an unexpected prefix (expected one of ${KNOWN_TOKEN_PREFIXES.join(', ')}).`
    );
  }
  return token;
}

function assertTokenCiAccess(project: string, token: string): void {
  const env = { ...process.env, DOPPLER_TOKEN: token };
  const failures: string[] = [];

  for (const ciConfig of DOPPLER_SETUP_CONFIGS) {
    const { stdout, status, stderr } = runCapture(
      'doppler',
      [
        'secrets',
        'get',
        'DOPPLER_PROJECT',
        '--plain',
        '--project',
        project,
        '--config',
        ciConfig,
      ],
      { env }
    );
    if (status !== 0 || stdout !== project) {
      const detail = stderr.length > 0 ? stderr : `got ${stdout || '(empty)'}`;
      failures.push(`${ciConfig}: ${detail}`);
    }
  }

  if (failures.length === 0) {
    return;
  }

  const scopedHint = token.startsWith(CONFIG_SCOPED_PREFIX)
    ? ' Config-scoped service tokens (`dp.st.…`) cannot read every CI config.'
    : '';

  fail(
    `${SECRET_NAME} cannot read project=${project} for CI configs (${failures.join('; ')}).` +
      scopedHint +
      ' Re-run with `--rotate` after `doppler login`.'
  );
}

function persistTokenToDoppler(
  project: string,
  config: string,
  token: string
): void {
  runOrFail(
    'doppler',
    ['secrets', 'set', SECRET_NAME, '--project', project, '--config', config],
    `doppler secrets set ${SECRET_NAME}`,
    { input: token }
  );
}

function resolveRotatedToken(project: string, config: string): string {
  const fromEnv = tryFetchTokenFromEnv();
  if (fromEnv !== null) {
    const token = validateToken(fromEnv, 'environment');
    console.log(`Rotating ${SECRET_NAME} from environment.`);
    persistTokenToDoppler(project, config, token);
    return token;
  }

  const fromCli = tryFetchTokenFromCli();
  if (fromCli !== null) {
    const token = validateToken(fromCli, 'doppler configure');
    console.log(`Rotating ${SECRET_NAME} from doppler login token.`);
    persistTokenToDoppler(project, config, token);
    return token;
  }

  fail(
    `Cannot rotate ${SECRET_NAME}: run \`doppler login\`, or set DOPPLER_SERVICE_TOKEN / DOPPLER_TOKEN in env.`
  );
}

function resolveToken(
  project: string,
  config: string,
  rotate: boolean
): string {
  if (rotate) {
    return resolveRotatedToken(project, config);
  }

  const fromDoppler = tryFetchTokenFromDoppler(project, config);
  if (fromDoppler !== null) {
    return validateToken(
      fromDoppler,
      `Doppler project=${project} config=${config}`
    );
  }

  const fromEnv = tryFetchTokenFromEnv();
  if (fromEnv !== null) {
    const token = validateToken(fromEnv, 'environment');
    console.log(
      `${SECRET_NAME} not in Doppler; using env and persisting to ${config}.`
    );
    persistTokenToDoppler(project, config, token);
    return token;
  }

  const fromCli = tryFetchTokenFromCli();
  if (fromCli !== null) {
    const token = validateToken(fromCli, 'doppler configure');
    console.log(
      `${SECRET_NAME} not in Doppler; using login token and persisting to ${config}.`
    );
    persistTokenToDoppler(project, config, token);
    return token;
  }

  fail(
    `${SECRET_NAME} not found. Set it in Doppler, env, or run \`doppler login\`, then re-run with --rotate.`
  );
}

function resolveGitHubRepo(): string {
  const fromGh = runCapture('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '-q',
    '.nameWithOwner',
  ]);
  if (fromGh.status === 0 && fromGh.stdout.length > 0) {
    return fromGh.stdout;
  }

  const remote = runCapture('git', ['remote', 'get-url', 'origin']);
  if (remote.status !== 0 || remote.stdout.length === 0) {
    fail('could not resolve GitHub repo');
  }

  const match =
    remote.stdout.match(/github\.com[:/]([^/]+\/[^/.]+)/)?.[1] ??
    remote.stdout.match(/^([^/]+\/[^/.]+)(?:\.git)?$/)?.[1];
  if (match === undefined) {
    fail(`could not parse owner/repo from git remote: ${remote.stdout}`);
  }
  return match.replace(/\.git$/, '');
}

function setGitHubSecret(repo: string, token: string): void {
  runOrFail(
    'gh',
    ['secret', 'set', SECRET_NAME, '--repo', repo],
    `gh secret set ${SECRET_NAME}`,
    { input: token }
  );
}

function main(): void {
  preflight();
  const rotate = parseRotateFlag();
  const { project, config } = resolveScope();
  const token = resolveToken(project, config, rotate);
  assertTokenCiAccess(project, token);
  const repo = resolveGitHubRepo();
  setGitHubSecret(repo, token);
  const mode = rotate ? 'rotated and set' : 'set';
  console.log(
    `${mode} ${SECRET_NAME} on ${repo} (Doppler project=${project}, CI configs: ${DOPPLER_SETUP_CONFIGS.join(', ')})`
  );
}

main();
