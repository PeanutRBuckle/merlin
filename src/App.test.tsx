/**
 * Focused component tests (RED/GREEN). Synthetic fixture data only — clearly
 * labeled, no real listening history. Only the importer is mocked for
 * component isolation; parent E2E runs the real import pipeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import type { HistoryData, CodexSummary } from './data/types';
import type { ImportFileResult } from './components/session';

// The importer module may not exist yet (supplied by another agent); the mock
// factory keeps these component tests isolated regardless.
vi.mock('./import/history', () => ({
  importHistory: vi.fn(),
}));

import { importHistory } from './import/history';
const importMock = vi.mocked(importHistory);

// --- synthetic fixture (labeled) ---
// Values below are the real aggregateHistory outputs for these two events:
// 1.8 h total ms on 2026-01-01..03 at 12:00 UTC, two artists.
const track = (id: string, title: string, artist: string) => ({
  id,
  title,
  artist,
  album: 'Fixture Album',
  features: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 120] as (number | null)[],
  families: ['folk'],
  tags: [],
  statsTrack: [],
  statsAlbum: [],
  statsArtist: [],
});

const SYNTHETIC_DATA: HistoryData = {
  format: 'merlin-history',
  version: 1,
  tracks: [track('0123456789ABCDEFGHIJKL', 'Synthetic Song', 'Synthetic Duo'), track('0123456789ABCDEFGHIJM', 'Fixture Tune', 'Test Trio')],
  events: [
    [1767268800, 0, 1_800_000],
    [1767355200, 0, 2_700_000],
    [1767441600, 1, 2_700_000],
    [1767528000, 0, 0],
  ],
  meta: {
    artistNames: ['Synthetic Duo', 'Test Trio'],
    eventArtists: [0, 0, 1, 0],
    first: 1767268800,
    last: 1767528000,
    eventMs: 7_200_000,
  },
};

const ACCEPTED: ImportFileResult = {
  name: 'Streaming_History_Audio_0.json',
  size: 100,
  status: 'accepted',
  records: 3,
};
const SKIPPED: ImportFileResult = {
  name: 'podcasts.json',
  size: 20,
  status: 'skipped',
  reason: 'not listening history',
};

async function gotoHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  render(<App />);
  await new Promise((r) => setTimeout(r, 20));
}

/** Navigate an already-mounted App without rendering a second copy. */
async function navTo(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 20));
}

/** Hero figure value for a given label ('hours' | 'plays' | 'artists'). */
function heroValue(label: string): string | null | undefined {
  return screen.getByText(label).previousElementSibling?.textContent;
}

beforeEach(() => {
  window.location.hash = '';
  importMock.mockReset();
});

describe('Landing', () => {
  it('keeps Google sign-in disabled and truthfully explains it', async () => {
    render(<App />);
    const google = screen.getByRole('button', { name: /sign in with google/i });
    expect(google).toBeDisabled();
    expect(screen.getByText(/google sign-in is not configured/i)).toBeInTheDocument();
  });

  it('offers the explicit local-only path into upload', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /try with my files/i }));
    expect(screen.getByRole('heading', { name: /bring your history/i })).toBeInTheDocument();
  });

  it('marks Privacy and Terms as drafts, not reviewed documents', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/draft and not yet available/i);
  });
});

describe('Agreements', () => {
  it('shows unavailable drafts and never records consent', async () => {
    await gotoHash('#/agreements');
    expect(screen.getByRole('heading', { name: /before we begin/i })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(/nothing has been recorded/i);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });
});

describe('Upload', () => {
  it('lists picked files without pretending acceptance, then shows Bind my codex', async () => {
    const user = userEvent.setup();
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await user.upload(input, [new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    expect(screen.getByText('Streaming_History_Audio_0.json')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bind my codex/i })).toBeInTheDocument();
    // no fake per-file acceptance before the real importer runs
    expect(screen.queryByText(/accepted/i)).not.toBeInTheDocument();
  });

  it('notes that binding replaces the current tab history and that reminders are unavailable', async () => {
    const user = userEvent.setup();
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    expect(screen.getByText(/binding replaces the history currently in this tab/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /don’t have your files yet\?/i }));
    expect(screen.getByRole('button', { name: /remind me by email/i })).toBeDisabled();
    expect(screen.getByText(/email reminders are not connected yet/i)).toBeInTheDocument();
  });
});

describe('Binding → Codex', () => {
  it('runs the real import once, shows counts and opens the codex with real data', async () => {
    const user = userEvent.setup();
    importMock.mockResolvedValue({
      data: SYNTHETIC_DATA,
      files: [ACCEPTED, SKIPPED],
    });
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' }),
      new File(['[]'], 'podcasts.json', { type: 'application/json' }),
    ]);
    await user.click(screen.getByRole('link', { name: /bind my codex/i }));

    expect(importMock).toHaveBeenCalledTimes(1);
    const [, onProgress] = importMock.mock.calls[0] as unknown as [File[], unknown];
    expect(typeof onProgress).toBe('function');

    await screen.findByRole('link', { name: /open your codex/i });
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(/your codex is bound/i);

    await user.click(screen.getByRole('link', { name: /open your codex/i }));
    // Hero figures come from the fixture through the real aggregates contract.
    expect(await heroValue('hours')).toBe('2');
    expect(heroValue('plays')).toBe('3');
    expect(heroValue('artists')).toBe('2');
    expect(screen.getByRole('heading', { name: /the litany/i })).toBeInTheDocument();
    expect(screen.getByText('Synthetic Duo')).toBeInTheDocument();
    // Truthful chapters: no audio-unavailable bars (fixture features complete),
    // empty Folia Rara explains the schema gap.
    expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
  });

  it('reports importer failure with a retry and no fake success', async () => {
    const user = userEvent.setup();
    importMock.mockRejectedValue(new Error('no listening history found'));
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['{}'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    await user.click(screen.getByRole('link', { name: /bind my codex/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no listening history found/i);
    expect(screen.queryByRole('link', { name: /open your codex/i })).not.toBeInTheDocument();
  });

  it('guards the codex route with a usable empty state before anything is bound', async () => {
    await gotoHash('#/codex');
    expect(screen.getByRole('heading', { name: /not bound yet/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to upload/i })).toBeInTheDocument();
  });
});

describe('Codex range controls', () => {
  async function bindAndOpenCodex(user: ReturnType<typeof userEvent.setup>) {
    importMock.mockResolvedValue({ data: SYNTHETIC_DATA, files: [ACCEPTED] });
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    await user.click(screen.getByRole('link', { name: /bind my codex/i }));
    await user.click(await screen.findByRole('link', { name: /open your codex/i }));
  }

  it('rejects an inverted custom range and applies a valid one inclusively', async () => {
    const user = userEvent.setup();
    await bindAndOpenCodex(user);
    await user.click(screen.getByRole('button', { name: /custom range/i }));
    await user.type(screen.getByLabelText('From'), '2026-01-10');
    await user.type(screen.getByLabelText('To'), '2026-01-02');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/on or before/i);

    await user.clear(screen.getByLabelText('From'));
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('From'), '2026-01-01');
    await user.type(screen.getByLabelText('To'), '2026-01-02');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog', { name: /custom range/i })).not.toBeInTheDocument();
    // Inclusive of both ends: 2026-01-01 (1.8M ms) + 2026-01-02 (2.7M ms) = 4.5M ms = 1.25 h -> "1"
    expect(heroValue('hours')).toBe('1');
    expect(screen.getByTitle(/jan 1, 2026/i)).toBeInTheDocument();
  });

  it('resets to All time', async () => {
    const user = userEvent.setup();
    await bindAndOpenCodex(user);
    await user.click(screen.getByRole('button', { name: /custom range/i }));
    await user.type(screen.getByLabelText('From'), '2025-01-01');
    await user.type(screen.getByLabelText('To'), '2025-01-03');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByRole('button', { name: /custom range/i })).toHaveTextContent(/custom range/i);
  });

  it('renders the Artists/Songs toggle with accessible tab list', async () => {
    const user = userEvent.setup();
    await bindAndOpenCodex(user);
    const artists = screen.getByRole('tab', { name: 'Artists' });
    const songs = screen.getByRole('tab', { name: 'Songs' });
    expect(artists).toHaveAttribute('aria-selected', 'true');
    await user.click(songs);
    expect(songs).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Synthetic Song')).toBeInTheDocument();
  });

  it('shows the calendar with silent cells distinguished from zero', async () => {
    const user = userEvent.setup();
    await bindAndOpenCodex(user);
    // Days outside the archive bounds are "no listening data available".
    expect(screen.getAllByTitle(/no listening data available/i).length).toBeGreaterThan(0);
    // 2026-01-04 is inside the archive but had no eligible listening: observed zero.
    const zeroDay = screen.getByTitle(/jan 4, 2026 — 0 m/i);
    expect(zeroDay).not.toHaveAttribute('title', expect.stringContaining('no listening data'));
    // Listening days show their duration.
    expect(screen.getByTitle(/jan 2, 2026 — 45 m/i)).toBeInTheDocument();
  });
});

describe('Oracle', () => {
  it('has no canned responses: composer and actions disabled with explanations', async () => {
    await gotoHash('#/oracle');
    expect(screen.getByLabelText(/ask the oracle/i)).toBeDisabled();
    expect(screen.getByRole('status', { name: undefined })).toBeDefined();
    expect(screen.getAllByText(/not connected/i).length).toBeGreaterThan(0);
    const plateRegion = screen.getByRole('region', { name: /plates/i });
    expect(within(plateRegion).getByRole('button', { name: /pin to codex/i })).toBeDisabled();
    expect(within(plateRegion).getByRole('button', { name: /download plate/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});

describe('Account', () => {
  it('shows a local session with no sample name or email', async () => {
    await gotoHash('#/account');
    expect(screen.getByText('Local session')).toBeInTheDocument();
    expect(screen.queryByText(/quinn/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('summarises real import counts once data is bound', async () => {
    const user = userEvent.setup();
    importMock.mockResolvedValue({ data: SYNTHETIC_DATA, files: [ACCEPTED, SKIPPED] });
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    await user.click(screen.getByRole('link', { name: /bind my codex/i }));
    await navTo('#/account');
    expect(screen.getAllByText(/draft — unavailable, nothing recorded/i)).toHaveLength(2);
    expect(screen.getByText('Plays').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Files').parentElement).toHaveTextContent('1');
  });

  it('downloads the prepared JSON via a real blob URL', async () => {
    const user = userEvent.setup();
    importMock.mockResolvedValue({ data: SYNTHETIC_DATA, files: [ACCEPTED] });
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    await user.click(screen.getByRole('link', { name: /bind my codex/i }));
    await navTo('#/account');

    const clickSpy = vi.fn();
    const anchor = document.querySelector('a.sr-only') as HTMLAnchorElement | null;
    // The hidden download anchor is driven by the button; intercept the download.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      if (this.hasAttribute('download')) clickSpy(this.download);
    });
    await user.click(screen.getByRole('button', { name: /download my data/i }));
    expect(clickSpy).toHaveBeenCalledWith(expect.stringMatching(/^merlin-history-\d{4}-\d{2}-\d{2}\.json$/));
    expect(anchor).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/downloaded to this device/i);
    vi.restoreAllMocks();
  });

  it('clears local memory only after an explicit confirmed action, then returns to landing', async () => {
    const user = userEvent.setup();
    importMock.mockResolvedValue({ data: SYNTHETIC_DATA, files: [ACCEPTED] });
    await gotoHash('#/upload');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['[]'], 'Streaming_History_Audio_0.json', { type: 'application/json' })]);
    await user.click(screen.getByRole('link', { name: /bind my codex/i }));
    await navTo('#/account');

    await user.click(screen.getByRole('button', { name: /clear local memory/i }));
    const dialog = screen.getByRole('alertdialog', { name: /confirm clearing local memory/i });
    expect(dialog).toHaveTextContent(/this can’t be undone/i);
    const erase = within(dialog).getByRole('button', { name: /erase everything/i });
    expect(erase).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(erase);
    expect(await screen.findByText(/local memory has been cleared/i)).toBeInTheDocument();
  });
});

describe('Discover', () => {
  it('renders the approved placeholder', async () => {
    await gotoHash('#/discover');
    expect(screen.getByRole('heading', { name: /still being illuminated/i })).toBeInTheDocument();
    expect(screen.getByText('Under construction')).toBeInTheDocument();
  });
});
