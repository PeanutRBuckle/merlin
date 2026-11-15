import { Chrome, FolioArt } from '../components/Chrome';

/** Discover — approved placeholder. */
export function DiscoverPage(): React.JSX.Element {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Chrome route="discover" initial="L" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '48px 16px' }}>
        <div style={{ width: 'min(100%, 440px)' }}>
          <FolioArt src="/assets/view-2.webp" alt="Two figures playing stringed instruments in an illuminated manuscript" ratio="4 / 3" innerStyle={{ objectPosition: 'center 40%' }} />
        </div>
        <h1 style={{ margin: 0, font: '600 clamp(26px, 3vw, 32px)/1.15 var(--font-display)', textAlign: 'center' }}>Still being illuminated</h1>
        <span className="eyebrow">Under construction</span>
      </main>
    </div>
  );
}
