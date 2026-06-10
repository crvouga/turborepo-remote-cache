import {
  CACHE_DNS_ZONE,
  CACHE_PUBLIC_HOSTNAME,
  FLY_APP_NAME,
} from './vault-secrets-registry';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/** DNS record Fly.io instructs us to create, parsed from `fly certs setup`. */
export type FlyDnsRecord = {
  readonly type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  readonly name: string;
  readonly content: string;
};

export type SyncCloudflareDnsOptions = {
  readonly flyApp?: string;
  readonly hostname?: string;
  readonly zone?: string;
  readonly cloudflareApiToken: string;
  readonly cloudflareZoneId?: string;
  readonly fetchFlySetup: (app: string, hostname: string) => string;
};

type CloudflareDnsRecord = {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly content: string;
  readonly proxied?: boolean;
};

type CloudflareListResponse = {
  readonly success: boolean;
  readonly result: CloudflareDnsRecord[];
  readonly errors?: Array<{ message: string }>;
};

type CloudflareMutationResponse = {
  readonly success: boolean;
  readonly result: CloudflareDnsRecord;
  readonly errors?: Array<{ message: string }>;
};

function cloudflareHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function cloudflareRequest<T extends { success?: boolean }>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: {
      ...cloudflareHeaders(token),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & {
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || body.success === false) {
    const message =
      body.errors?.map((err) => err.message).join('; ') ??
      `HTTP ${String(response.status)}`;
    throw new Error(`Cloudflare API ${path}: ${message}`);
  }
  return body;
}

export async function resolveCloudflareZoneId(
  token: string,
  zoneName: string,
  zoneIdOverride?: string
): Promise<string> {
  if (zoneIdOverride !== undefined && zoneIdOverride.trim().length > 0) {
    return zoneIdOverride.trim();
  }

  const data = await cloudflareRequest<{
    success: boolean;
    result: Array<{ id: string; name: string }>;
  }>(token, `/zones?name=${encodeURIComponent(zoneName)}`);

  const zone = data.result[0];
  if (zone === undefined) {
    throw new Error(`Cloudflare zone not found for "${zoneName}"`);
  }
  return zone.id;
}

/** Parse `fly certs setup` text output into Cloudflare-ready DNS records. */
export function parseFlyCertSetupOutput(output: string): FlyDnsRecord[] {
  const records: FlyDnsRecord[] = [];

  const cnameRe = /CNAME\s+([^\s=]+)\s*(?:=>|->)\s*([^\s.][^\s]*)/gi;
  for (const match of output.matchAll(cnameRe)) {
    const name = match[1]?.trim();
    const content = match[2]?.trim().replace(/\.$/, '');
    if (name === undefined || content === undefined) continue;
    records.push({ type: 'CNAME', name, content });
  }

  const txtRe = /TXT\s+([^\s]+)\s+(.+)/gi;
  for (const match of output.matchAll(txtRe)) {
    const name = match[1]?.trim();
    let content = match[2]?.trim() ?? '';
    if (name === undefined || content.length === 0) continue;
    content = content.replace(/\.$/, '').replace(/^"(.*)"$/, '$1');
    records.push({ type: 'TXT', name, content });
  }

  const aRe = /^A\s+(\S+)\s+(\S+)/gim;
  for (const match of output.matchAll(aRe)) {
    const name = match[1]?.trim();
    const content = match[2]?.trim();
    if (name === undefined || content === undefined) continue;
    if (name.startsWith('_') || name.includes('acme')) continue;
    records.push({ type: 'A', name, content });
  }

  const aaaaRe = /^AAAA\s+(\S+)\s+(\S+)/gim;
  for (const match of output.matchAll(aaaaRe)) {
    const name = match[1]?.trim();
    const content = match[2]?.trim();
    if (name === undefined || content === undefined) continue;
    if (name.startsWith('_') || name.includes('acme')) continue;
    records.push({ type: 'AAAA', name, content });
  }

  return dedupeRecords(records);
}

function dedupeRecords(records: FlyDnsRecord[]): FlyDnsRecord[] {
  const seen = new Set<string>();
  const out: FlyDnsRecord[] = [];
  for (const record of records) {
    const key = `${record.type}:${record.name}:${record.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function toCloudflareRecordName(name: string, zone: string): string {
  if (name === '@' || name === zone) return zone;
  if (name.endsWith(`.${zone}`)) return name;
  if (name.includes('.')) return name;
  return `${name}.${zone}`;
}

function relativeRecordName(fqdn: string, zone: string): string {
  if (fqdn === zone) return '@';
  const suffix = `.${zone}`;
  if (fqdn.endsWith(suffix)) {
    return fqdn.slice(0, -suffix.length);
  }
  return fqdn;
}

async function listZoneRecords(
  token: string,
  zoneId: string,
  name: string
): Promise<CloudflareDnsRecord[]> {
  const data = await cloudflareRequest<CloudflareListResponse>(
    token,
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`
  );
  return data.result;
}

async function deleteRecord(
  token: string,
  zoneId: string,
  recordId: string
): Promise<void> {
  await cloudflareRequest<{ success: boolean }>(
    token,
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: 'DELETE' }
  );
}

async function upsertRecord(
  token: string,
  zoneId: string,
  record: FlyDnsRecord,
  zone: string
): Promise<void> {
  const fqdn = toCloudflareRecordName(record.name, zone);
  const existing = await listZoneRecords(token, zoneId, fqdn);
  const conflictingTypes =
    record.type === 'CNAME' ? new Set(['A', 'AAAA', 'CNAME']) : null;

  for (const current of existing) {
    if (conflictingTypes?.has(current.type) && current.type !== record.type) {
      await deleteRecord(token, zoneId, current.id);
    }
  }

  const match = existing.find(
    (current) => current.type === record.type && current.name === fqdn
  );
  const payload = {
    type: record.type,
    name: relativeRecordName(fqdn, zone),
    content: record.content,
    proxied: false,
    ttl: 1,
  };

  if (match !== undefined) {
    if (match.content === record.content && match.proxied === false) {
      process.stdout.write(
        `[deploy] Cloudflare ${record.type} ${fqdn} already correct.\n`
      );
      return;
    }
    await cloudflareRequest<CloudflareMutationResponse>(
      token,
      `/zones/${zoneId}/dns_records/${match.id}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    process.stdout.write(
      `[deploy] updated Cloudflare ${record.type} ${fqdn}.\n`
    );
    return;
  }

  await cloudflareRequest<CloudflareMutationResponse>(
    token,
    `/zones/${zoneId}/dns_records`,
    { method: 'POST', body: JSON.stringify(payload) }
  );
  process.stdout.write(`[deploy] created Cloudflare ${record.type} ${fqdn}.\n`);
}

function fallbackRoutingRecord(hostname: string, flyApp: string): FlyDnsRecord {
  return {
    type: 'CNAME',
    name: hostname,
    content: `${flyApp}.fly.dev`,
  };
}

export async function syncCloudflareDnsFromFlySetup(
  options: SyncCloudflareDnsOptions
): Promise<void> {
  const flyApp = options.flyApp ?? FLY_APP_NAME;
  const hostname = options.hostname ?? CACHE_PUBLIC_HOSTNAME;
  const zone = options.zone ?? CACHE_DNS_ZONE;

  const setupOutput = options.fetchFlySetup(flyApp, hostname);
  let records = parseFlyCertSetupOutput(setupOutput);

  if (
    !records.some((record) => record.name === hostname || record.name === '@')
  ) {
    records = [...records, fallbackRoutingRecord(hostname, flyApp)];
  }

  if (records.length === 0) {
    throw new Error(
      `No DNS records parsed from fly certs setup for ${hostname}`
    );
  }

  const zoneId = await resolveCloudflareZoneId(
    options.cloudflareApiToken,
    zone,
    options.cloudflareZoneId
  );

  process.stdout.write(
    `[deploy] syncing ${String(records.length)} Cloudflare DNS record(s) in ${zone}.\n`
  );

  for (const record of records) {
    await upsertRecord(options.cloudflareApiToken, zoneId, record, zone);
  }
}

export function readCloudflareDeployConfig(): {
  cloudflareApiToken: string;
  cloudflareZoneId?: string;
} {
  const cloudflareApiToken = process.env['CLOUDFLARE_API_TOKEN']?.trim() ?? '';
  if (cloudflareApiToken.length === 0) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is required (Cloudflare API token with Zone.DNS Edit from Vault).'
    );
  }

  const zoneId = process.env['CLOUDFLARE_ZONE_ID']?.trim();
  return {
    cloudflareApiToken,
    ...(zoneId !== undefined && zoneId.length > 0
      ? { cloudflareZoneId: zoneId }
      : {}),
  };
}
