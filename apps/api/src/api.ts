import { Assert, ThrowingCrashHandler } from '@pkgs/assert';
import { createLogger } from '@pkgs/logger';
import { isSecretStoreError } from '@pkgs/secret-store';

import { createCacheApp } from './cache/create-app';
import { loadCacheBootConfig } from './config/boot-config';
import {
  assertDopplerTokenBinding,
  ConfigurationError,
  readDopplerScopeBindings,
  type CacheWorkerEnv,
} from './config/env';
import { createCacheSecretStore } from './config/secret-store';

Assert.registerCrashHandler(new ThrowingCrashHandler());

const log = createLogger({ name: 'turbo-cache' });

type App = ReturnType<typeof createCacheApp>;

type BootState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly app: App }
  | { readonly kind: 'fatal'; readonly reason: string };

let bootState: BootState = { kind: 'pending' };
let fatalLogged = false;

const ERROR_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
} as const;

function preflightResponse(request: Request): Response {
  const requested = request.headers.get('Access-Control-Request-Headers');
  const allowHeaders =
    requested !== null && requested.trim().length > 0
      ? requested
      : 'Authorization, Content-Type, x-artifact-tag';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': allowHeaders,
    },
  });
}

function fatalConfigResponse(reason: string): Response {
  return new Response(
    JSON.stringify({ error: 'cache misconfigured', reason }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...ERROR_CORS_HEADERS,
      },
    }
  );
}

function latchFatal(reason: string): void {
  bootState = { kind: 'fatal', reason };
  if (!fatalLogged) {
    log.error('cache fatal: refusing to serve', { reason });
    fatalLogged = true;
  }
}

async function bootApp(env: CacheWorkerEnv): Promise<App> {
  const token = assertDopplerTokenBinding(env);
  const { project, config } = readDopplerScopeBindings(env);
  const secretStore = createCacheSecretStore(token, { project, config });
  const bootConfig = await loadCacheBootConfig(secretStore);
  return createCacheApp(bootConfig);
}

async function ensureApp(env: CacheWorkerEnv): Promise<App | null> {
  if (bootState.kind === 'ready') return bootState.app;
  if (bootState.kind === 'fatal') return null;

  try {
    const app = await bootApp(env);
    bootState = { kind: 'ready', app };
    return app;
  } catch (err: unknown) {
    if (err instanceof ConfigurationError || isSecretStoreError(err)) {
      latchFatal(err instanceof Error ? err.message : String(err));
      return null;
    }
    throw err;
  }
}

async function handleWorkerFetch(
  request: Request,
  env: CacheWorkerEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { ...ERROR_CORS_HEADERS },
      });
    }
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' as const }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...ERROR_CORS_HEADERS },
      });
    }
  }

  if (request.method === 'OPTIONS') {
    return preflightResponse(request);
  }

  const app = await ensureApp(env);
  if (app === null) {
    const reason = bootState.kind === 'fatal' ? bootState.reason : 'unknown';
    return fatalConfigResponse(reason);
  }

  return app.fetch(
    request,
    env,
    ctx as unknown as Parameters<typeof app.fetch>[2]
  );
}

export default {
  async fetch(
    request: Request,
    env: CacheWorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      return await handleWorkerFetch(request, env, ctx);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('top-level handler error', { error: message });

      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...ERROR_CORS_HEADERS,
        },
      });
    }
  },
} satisfies ExportedHandler<CacheWorkerEnv>;
