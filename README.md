# turborepo-remote-cache

Self-hosted [Turborepo Remote Cache](https://turbo.build/docs/core-concepts/remote-caching) on Cloudflare Workers with Backblaze B2 object storage.

**Domain:** `https://turborepo.chrisvouga.dev`

## Setup

1. Install [Doppler CLI](https://docs.doppler.com/docs/install-cli) and link this repo (`doppler setup` reads `doppler.yaml`).
2. Run bootstrap (writes `.dev.vars` + ensures derived defaults in Doppler `dev` and `prd`):

```bash
bun install
bun run setup
```

3. Set remaining **required** secrets in both Doppler configs (`dev` and `prd`). See [`scripts/doppler-secrets-registry.ts`](scripts/doppler-secrets-registry.ts) for the full list and hints:
   - `TURBO_TOKEN` — bearer token for Turbo clients and the Worker
   - B2 keys: `B2_S3_ENDPOINT`, `B2_S3_REGION`, `B2_S3_ACCESS_KEY_ID`, `B2_S3_SECRET_ACCESS_KEY`, `B2_BUCKET`
   - Deploy: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

   Derived defaults (`TURBO_API`, `TURBO_TEAM`, `TURBO_CACHE`) are applied by `setup` when missing.

4. Verify secrets:

```bash
bun run check:doppler-secrets        # dev (CI uses this)
bun run check:doppler-secrets:prd    # prd (deploy uses this)
```

5. Deploy:

```bash
bun run deploy
```

## Turbo client config

Doppler should define (or `setup` defaults):

```bash
export TURBO_API=https://turborepo.chrisvouga.dev
export TURBO_TOKEN=<same as Doppler TURBO_TOKEN>
export TURBO_TEAM=local
export TURBO_CACHE=remote:rw
```

## Development

```bash
bun run dev    # wrangler dev :8787
bun run check  # format + tc + lint + test + build
```

## CI/CD

Single workflow: [`.github/workflows/deployment-pipeline.yml`](.github/workflows/deployment-pipeline.yml)

- **check** — every push/PR: Doppler `dev` secrets gate + `bun run check`
- **deploy** — main push only: Doppler `prd` secrets gate + `wrangler deploy`

GitHub secret required: **`DOPPLER_SERVICE_TOKEN`** (project token; passed as `DOPPLER_TOKEN` for `doppler run`). Seed with `bun run gh:seed-doppler-service-token`.

## Layout

- `apps/api` — Cloudflare Worker (Hono + Turborepo `/v8/artifacts/*` API)
- `pkgs/object-store` — swappable blob storage (`ObjectStoreImplS3` for B2)
- `pkgs/secret-store` — Doppler secret loading at Worker boot
- `scripts/doppler-secrets-registry.ts` — source of truth for expected Doppler keys
