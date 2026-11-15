import { StrictMode } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BindingPage } from './BindingPage';
import type { HistoryData } from '../data/types';
import { importHistory } from '../import/history';
vi.mock('../import/history', () => ({ importHistory: vi.fn() }));

describe('Binding effect lifecycle', () => {
  it('settles one import under StrictMode instead of discarding its result forever', async () => {
    const data: HistoryData = {
      format: 'merlin-history', version: 1, tracks: [], events: [],
      meta: { first: 0, last: 0, eventMs: 0, artistNames: [], eventArtists: [] },
    };
    let finish!: (value: { data: HistoryData; files: [] }) => void;
    vi.mocked(importHistory).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onBound = vi.fn();
    render(<StrictMode><BindingPage files={[new File(['[]'], 'synthetic.json')]} onBound={onBound} /></StrictMode>);
    await act(async () => { finish({ data, files: [] }); });
    expect(onBound).toHaveBeenCalledTimes(1);
    expect(importHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Open your codex' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('reports per-file results and completes every stage without claiming live enrichment', async () => {
    vi.clearAllMocks();
    const data: HistoryData = { format: 'merlin-history', version: 1, tracks: [], events: [], meta: { first: 0, last: 0, eventMs: 0, artistNames: [], eventArtists: [] } };
    vi.mocked(importHistory).mockResolvedValue({ data, files: [
      { name: 'synthetic.json', size: 10, status: 'accepted', records: 0 },
      { name: 'notes.txt', size: 8, status: 'skipped', reason: 'Not listening history.' },
    ] });
    render(<BindingPage files={[new File(['[]'], 'synthetic.json')]} onBound={vi.fn()} />);
    expect(await screen.findByRole('list', { name: 'Import results' })).toHaveTextContent('notes.txt');
    expect(screen.getByRole('list', { name: 'Import results' })).toHaveTextContent('Not listening history.');
    expect(document.querySelectorAll('.step-dot[data-done="true"]')).toHaveLength(4);
    expect(screen.getByText('Checking sound and genre')).toBeInTheDocument();
  });
});
