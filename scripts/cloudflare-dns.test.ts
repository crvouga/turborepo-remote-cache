import { describe, expect, test } from 'bun:test';

import { parseFlyCertSetupOutput } from './cloudflare-dns';

describe('parseFlyCertSetupOutput', () => {
  test('parses CNAME routing and acme challenge records', () => {
    const output = `
You can direct traffic to turborepo.chrisvouga.dev by:

1: Adding an CNAME record to your DNS service which reads:

CNAME turborepo.chrisvouga.dev => turborepo-remote-cache.fly.dev

You can validate your ownership of turborepo.chrisvouga.dev by:

2: Adding an CNAME record to your DNS service which reads:

CNAME _acme-challenge.turborepo.chrisvouga.dev => turborepo.chrisvouga.dev.l2g0r.flydns.net.
`;

    const records = parseFlyCertSetupOutput(output);
    expect(records).toEqual([
      {
        type: 'CNAME',
        name: 'turborepo.chrisvouga.dev',
        content: 'turborepo-remote-cache.fly.dev',
      },
      {
        type: 'CNAME',
        name: '_acme-challenge.turborepo.chrisvouga.dev',
        content: 'turborepo.chrisvouga.dev.l2g0r.flydns.net',
      },
    ]);
  });

  test('parses AAAA and _fly-ownership TXT records', () => {
    const output = `
AAAA turborepo 2a09:8280:1:47f2:1ba6:50f0:11b5:8f9e
TXT _fly-ownership.turborepo fly-ownership=abc123
`;

    const records = parseFlyCertSetupOutput(output);
    expect(records).toContainEqual({
      type: 'AAAA',
      name: 'turborepo',
      content: '2a09:8280:1:47f2:1ba6:50f0:11b5:8f9e',
    });
    expect(records).toContainEqual({
      type: 'TXT',
      name: '_fly-ownership.turborepo',
      content: 'fly-ownership=abc123',
    });
  });
});
