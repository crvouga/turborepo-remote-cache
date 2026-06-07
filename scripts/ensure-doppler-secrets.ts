/**
 * Bootstrap Doppler `dev` and `prd` configs with derived defaults and report
 * any secrets that still need manual values.
 */
import { execSync } from 'node:child_process';

import {
  DOPPLER_SECRET_REGISTRY,
  DOPPLER_SETUP_CONFIGS,
} from './doppler-secrets-registry';
import { readDopplerYamlDefaults } from './doppler-yaml-defaults';

function getSecretPlain(
  project: string,
  config: string,
  key: string
): string | null {
  try {
    const out = execSync(
      `doppler secrets get ${key} --plain -p ${project} -c ${config}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function setSecret(
  project: string,
  config: string,
  key: string,
  value: string
): void {
  execSync(`doppler secrets set ${key}=${value} -p ${project} -c ${config}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main(): void {
  let project: string;
  try {
    project = readDopplerYamlDefaults().project;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ensure-doppler-secrets: ${msg}`);
    process.exit(1);
  }
  const stillMissing: string[] = [];

  for (const config of DOPPLER_SETUP_CONFIGS) {
    console.log(
      `\n[ensure-doppler-secrets] config=${config} project=${project}`
    );

    for (const def of DOPPLER_SECRET_REGISTRY) {
      if (def.defaultValue !== undefined) {
        const current = getSecretPlain(project, config, def.key);
        if (current === null || current.trim().length === 0) {
          setSecret(project, config, def.key, def.defaultValue);
          console.log(`  set default ${def.key}=${def.defaultValue}`);
        }
      }
    }

    for (const def of DOPPLER_SECRET_REGISTRY) {
      if (!def.required) continue;
      const current = getSecretPlain(project, config, def.key);
      if (current === null || current.trim().length === 0) {
        stillMissing.push(`  • ${config}/${def.key} — ${def.hint}`);
      }
    }
  }

  if (stillMissing.length > 0) {
    console.error('\nStill missing required secrets (set manually):');
    for (const line of stillMissing) {
      console.error(line);
    }
    console.error('\nExample: doppler secrets set TURBO_TOKEN=... -c dev');
    process.exit(1);
  }

  console.log(
    '\n[ensure-doppler-secrets] all required secrets present in dev + prd'
  );
}

main();
