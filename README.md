# turborepo-remote-cache

Self-hosted [Turborepo Remote Cache](https://turbo.build/docs/core-concepts/remote-caching) on Cloudflare Workers with Backblaze B2 object storage.

**Domain:** `https://turborepo.chrisvouga.dev`

## Setup

1. Install the `vault` wrapper + OpenBao/Vault CLI from the `secret-store` repo, then authenticate:

```bash
./scripts/install-cli.sh
vault login hvs.your-root-token   # or: ./scripts/create-dev-token.sh
vault setup --project personal --config dev
```

2. Run bootstrap (writes `.dev.vars` + ensures derived defaults in Vault `dev` and `prd`):

```bash
bun install
bun run setup
```

3. Set remaining **required** secrets in both Vault configs (`dev` and `prd`). See [`scripts/vault-secrets-registry.ts`](scripts/vault-secrets-registry.ts) for the full list and hints:
   - `TURBO_TOKEN` — bearer token for Turbo clients and the Worker
   - B2 keys: `B2_S3_ENDPOINT`, `B2_S3_REGION`, `B2_S3_ACCESS_KEY_ID`, `B2_S3_SECRET_ACCESS_KEY`, `B2_BUCKET`
   - Deploy: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

   Derived defaults (`TURBO_API`, `TURBO_TEAM`, `TURBO_CACHE`) are applied by `setup` when missing.

4. Verify secrets:

```bash
bun run check:vault-secrets        # dev (CI uses this)
bun run check:vault-secrets:prd    # prd (deploy uses this)
```

5. Deploy:

```bash
bun run deploy
```

## Turbo client config

Vault should define (or `setup` defaults):

```bash
export TURBO_API=https://turborepo.chrisvouga.dev
export TURBO_TOKEN=<same as Vault TURBO_TOKEN>
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

- **check** — every push/PR: Vault `dev` secrets gate + `bun run check`
- **deploy** — main push only: Vault `prd` secrets gate + `wrangler deploy`

CI authenticates via GitHub OIDC (`hashicorp/vault-action`); no stored token is required.

## Worker runtime secret

The Worker reads secrets at boot from Vault KV v2 over HTTP. Provision a long-lived read-only token:

```bash
# from the secret-store repo
./scripts/create-dev-token.sh
wrangler secret put VAULT_TOKEN --env dev
wrangler secret put VAULT_TOKEN --env prd
```

## Layout

- `apps/api` — Cloudflare Worker (Hono + Turborepo `/v8/artifacts/*` API)
- `pkgs/object-store` — swappable blob storage (`ObjectStoreImplS3` for B2)
- `pkgs/secret-store` — Vault secret loading at Worker boot
- `scripts/vault-secrets-registry.ts` — source of truth for expected Vault keys
