import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';

// Entirely synthetic history. No personal listening data is shipped in tests.
const fixture = [
  { ts: '2024-01-01T22:00:00Z', ms_played: 120000, spotify_track_uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', master_metadata_track_name: 'Synthetic Nocturne', master_metadata_album_artist_name: 'Synthetic Artist A', master_metadata_album_album_name: 'Synthetic Album', ip_addr: '192.0.2.1' },
  { ts: '2024-01-02T10:00:00Z', ms_played: 180000, spotify_track_uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB', master_metadata_track_name: 'Synthetic Morning', master_metadata_album_artist_name: 'Synthetic Artist B', master_metadata_album_album_name: 'Synthetic Album', ip_addr: '192.0.2.1' },
  { ts: '2024-01-02T23:00:00Z', ms_played: 60000, spotify_track_uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', master_metadata_track_name: 'Synthetic Nocturne', master_metadata_album_artist_name: 'Synthetic Artist A', master_metadata_album_album_name: 'Synthetic Album', ip_addr: '192.0.2.1' },
  { ts: '2024-01-03T09:00:00Z', ms_played: 20000, spotify_track_uri: 'spotify:track:CCCCCCCCCCCCCCCCCCCCCC', master_metadata_track_name: 'Synthetic Skip', master_metadata_album_artist_name: 'Synthetic Artist C', master_metadata_album_album_name: 'Synthetic Album', ip_addr: '192.0.2.1' },
];

async function bind(page: Page, zip = false) {
  await page.goto('/#/upload');
  const payload = zip
    ? { name: 'synthetic-export.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({
      'Spotify/Streaming_History_Audio_synthetic.json': strToU8(JSON.stringify(fixture)),
      'Spotify/endsong_overlap.json': strToU8(JSON.stringify([fixture[0]])),
      'Spotify/Readme.txt': strToU8('Synthetic export fixture'),
    })) }
    : { name: 'Streaming_History_Audio_synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) };
  await page.locator('input[type=file]').setInputFiles(payload);
  await page.getByRole('link', { name: 'Bind my codex', exact: true }).click();
  await page.getByRole('link', { name: 'Open your codex', exact: true }).click();
  await expect(page).toHaveURL(/#\/codex/);
  await expect(page.getByRole('heading', { name: 'The Litany', exact: true })).toBeVisible();
}

test('landing keeps local import available and has no mobile overflow', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const google = page.getByRole('button', { name: 'Sign in with Google' });
  if (process.env.MERLIN_AUTH_CONFIGURED === '0') await expect(google).toBeDisabled();
  else await expect(google).toBeEnabled();
  await expect(page.getByRole('link', { name: /Try with my files/i })).toBeVisible();
  expect(await page.getByRole('link', { name: /Try with my files/i }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(46, 43, 245)');
  expect((await page.getByRole('link', { name: /Request my Spotify data/i }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('landing.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('actual worker imports a ZIP, deduplicates overlap, exports and reloads prepared data', async ({ page }, info) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await bind(page, true);
  await expect(page.getByText('Synthetic Artist A', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Artist B', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Artist C', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Songs', exact: true }).click();
  expect(await page.getByRole('tab', { name: 'Songs', exact: true }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
  await expect(page.getByText('Synthetic Nocturne', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('codex.png'), fullPage: true });
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data', exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (!stream) throw new Error('Missing export stream');
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks);
  const data = JSON.parse(exported.toString('utf8'));
  expect(data.events).toHaveLength(4);
  expect(data.events.reduce((sum: number, event: number[]) => sum + event[2], 0)).toBe(380000);
  expect(exported.toString('utf8')).not.toContain('192.0.2.1');
  expect(exported.toString('utf8')).not.toContain('ip_addr');
  await page.reload();
  await page.goto('/#/upload');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-prepared.json', mimeType: 'application/json', buffer: exported });
  await page.getByRole('link', { name: 'Bind my codex', exact: true }).click();
  await page.getByRole('link', { name: 'Open your codex', exact: true }).click();
  await expect(page.getByText('Synthetic Artist A', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('non-history files produce actionable errors instead of a fake successful Codex', async ({ page }) => {
  await page.goto('/#/upload');
  await page.locator('input[type=file]').setInputFiles({ name: 'not-history.json', mimeType: 'application/json', buffer: Buffer.from('{"example":"not a history"}') });
  await page.getByRole('link', { name: 'Bind my codex', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/history|listening/i);
  await expect(page.getByRole('link', { name: 'Open your codex', exact: true })).toHaveCount(0);
});

test('custom ranges update real figures and distinguish unavailable calendar days', async ({ page }) => {
  await bind(page);
  await expect(page.locator('.big-figure').first().locator('.value')).toHaveText('0.1');
  const missingColor = await page.locator('.cal-cell[aria-label*="no listening data"]').first().evaluate(element => getComputedStyle(element).backgroundColor);
  const zeroColor = await page.locator('.cal-cell').last().evaluate(element => getComputedStyle(element).backgroundColor);
  expect(missingColor).not.toBe(zeroColor);
  const heatmapWidths = await page.locator('.cal-wrap').evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  if (page.viewportSize()!.width > 1000) expect(heatmapWidths.scroll).toBeLessThanOrEqual(heatmapWidths.width + 1);
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('2024-01-02');
  await page.getByLabel('To', { exact: true }).fill('2024-01-01');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/start|before|range/i);
  await page.getByLabel('To', { exact: true }).fill('2024-01-02');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.big-figure').nth(1).locator('.value')).toHaveText('2');
  await expect(page.locator('.cal-cell').last()).toHaveAttribute('aria-label', /Jan 2, 2024/);
  await page.getByRole('button', { name: 'All time', exact: true }).click();
  await expect(page.locator('.big-figure').nth(1).locator('.value')).toHaveText('3');
});

test('new imports start with a fresh selection and the picker can select the same file again', async ({ page }) => {
  await bind(page);
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('link', { name: 'Upload new history', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Files to bind' })).toHaveCount(0);
  const input = page.locator('input[type=file]');
  await input.setInputFiles({ name: 'endsong_synthetic_new.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([fixture[0]])) });
  await expect(input).toHaveValue('');
  await page.getByRole('link', { name: 'Bind my codex', exact: true }).click();
  await page.getByRole('link', { name: 'Open your codex', exact: true }).click();
  await expect(page.locator('.big-figure').nth(1).locator('.value')).toHaveText('1');
  await expect(page.getByText('Synthetic Artist B', { exact: true })).toHaveCount(0);
});

test('Codex controls work by keyboard and return focus after closing the range popover', async ({ page }) => {
  await bind(page);
  await page.getByRole('tab', { name: 'Artists', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Songs', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Songs', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await page.getByLabel('From', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Custom range', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Custom range', exact: true })).toBeFocused();
});
