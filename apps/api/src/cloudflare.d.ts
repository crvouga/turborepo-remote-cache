/**
 * Minimal Cloudflare Workers type stubs for the cache Worker.
 */

declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare interface ExportedHandler<Env = unknown> {
  fetch?(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Response | Promise<Response>;
}
