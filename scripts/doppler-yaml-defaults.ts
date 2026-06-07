import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type DopplerYamlDefaults = {
  readonly project: string;
  readonly config: string;
};

const DOPPLER_YAML = join(import.meta.dirname, '..', 'doppler.yaml');

export function readDopplerYamlDefaults(): DopplerYamlDefaults {
  let text: string;
  try {
    text = readFileSync(DOPPLER_YAML, 'utf8');
  } catch {
    throw new Error(`could not read ${DOPPLER_YAML}`);
  }

  const setupBlock = text.match(/setup:\s*([\s\S]*)/)?.[1] ?? text;
  const project = setupBlock.match(/project:\s*(\S+)/)?.[1];
  const config = setupBlock.match(/config:\s*(\S+)/)?.[1];
  if (project === undefined || config === undefined) {
    throw new Error(`could not parse project/config from ${DOPPLER_YAML}`);
  }
  return { project, config };
}

/** Env → `doppler configure` → repo `doppler.yaml`. */
export function resolveDopplerScope(options: {
  envProject?: string | undefined;
  envConfig?: string | undefined;
  configureProject?: string | null;
  configureConfig?: string | null;
}): DopplerYamlDefaults {
  const fromYaml = readDopplerYamlDefaults();
  const project =
    options.envProject?.trim() ||
    options.configureProject?.trim() ||
    fromYaml.project;
  const config =
    options.envConfig?.trim() ||
    options.configureConfig?.trim() ||
    fromYaml.config;
  return { project, config };
}
