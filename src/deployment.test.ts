// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => existsSync(name) ? readFileSync(name, 'utf8') : '';

describe('Cloudflare deployment contract', () => {
  it('serves only the new dist assets, without provisioning domains or backend resources', () => {
    const config = JSON.parse(read('wrangler.json') || 'null');
    expect(config).toMatchObject({
      name: 'merlinmusic',
      compatibility_date: '2026-11-14',
      assets: { directory: './dist', not_found_handling: 'single-page-application' },
      workers_dev: true,
    });
    for (const field of ['main', 'account_id', 'routes', 'vars', 'kv_namespaces', 'd1_databases', 'r2_buckets']) {
      expect(config).not.toHaveProperty(field);
    }
  });

  it('pins the tested build tools and provides a non-publishing deployment check', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(read('.node-version').trim()).toBe('26.7.0');
    expect(pkg.packageManager).toBe('npm@11.19.0');
    expect(pkg.devDependencies.wrangler).toBe('4.162.0');
    expect(pkg.scripts['deploy:check']).toBe('npm run build && wrangler deploy --dry-run');
    expect(pkg.scripts['preview:cloudflare']).toBe('wrangler dev --local --ip 127.0.0.1 --port 8788');
  });

  it('retains security headers for the hosted static files', () => {
    const headers = read('public/_headers');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(headers).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    expect(headers).toContain('X-Frame-Options: DENY');
  });
});
