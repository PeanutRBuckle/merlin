import { useRef, useState } from 'react';
import { FolioArt } from '../components/Chrome';
import { formatBytes } from '../components/format';

/**
 * Upload history — dropzone + multiple file picker (JSON / ZIP).
 * Picked files are listed with their real name and size only; accepted /
 * skipped statuses come from the real importer during binding, so nothing is
 * faked here. "Bind my codex" appears once at least one file is added.
 */
export function UploadPage({
  onPick,
  picked,
}: {
  onPick: (files: File[]) => void;
  picked: File[];
}): React.JSX.Element {
  const [drag, setDrag] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reminded, setReminded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    onPick(files);

  };

  return (
    <main className="rite">
      <div className="rite-inner">
        <div style={{ flex: '1 1 400px', maxWidth: 480, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <h1 style={{ margin: 0, font: '600 clamp(26px, 2.6vw, 32px)/1.15 var(--font-display)' }}>Bring your history</h1>

          <label
            className="dropzone"
            data-drag={drag || undefined}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="#ffffff" strokeWidth="1.5"><path d="M16 21V7M10 13l6-6 6 6M6 21v4h20v-4" /></svg>
            <span style={{ fontSize: 18, fontWeight: 500 }}>Drop your Spotify files here</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 16px', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 4, fontSize: 14, fontWeight: 500 }}>Choose files</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".json,.zip,application/json,application/zip"
              aria-label="Choose your Spotify history files"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
            />
          </label>


          {picked.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ul className="file-list" aria-label="Files to bind">
                {picked.map((f, i) => (
                  <li className="file-row" key={`${f.name}-${i}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="Added" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
                    <span className="file-name">{f.name}</span>
                    <span className="file-note">{formatBytes(f.size)}</span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                Binding replaces the history currently in this tab.
              </p>
              <a href="#/binding" className="btn-white" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
                Bind my codex
              </a>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <button type="button" className="btn btn-link" style={{ color: '#fff' }} aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}>
              Don’t have your files yet?
            </button>
            {helpOpen ? (
              <div style={{ width: '100%', border: '3px double #fff', padding: '18px 20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, maxWidth: '38ch' }}>
                  Request your <strong style={{ fontWeight: 600 }}>Extended streaming history</strong>. Spotify can take up to 30 days.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer" className="btn-white" style={{ textDecoration: 'none' }}>Request my data ↗</a>
                  <button
                    type="button"
                    className="btn btn-ghost-ultra"
                    aria-pressed={reminded}
                    onClick={() => setReminded(!reminded)}
                    disabled
                  >
                    Remind me by email
                  </button>
                </div>
                <p role="note" style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                  Email reminders are not connected yet — no email can be scheduled in this version.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <figure className="rite-art" style={{ margin: 0 }}>
          <FolioArt
            src="/assets/upload.jpg"
            alt="Medieval musicians with drums and long trumpets above dancing women, from an illuminated manuscript"
            ratio="2528 / 1686"
            onUltra
          />
        </figure>
      </div>
    </main>
  );
}
