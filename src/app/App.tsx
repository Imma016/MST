import { useEffect, useState } from 'react';
import { HomePage } from '../features/home/HomePage';

type TabId = 'home' | 'watch' | 'books' | 'discover' | 'profile';
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

const tabs: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'watch', label: 'Watch', icon: 'play' },
  { id: 'books', label: 'Books', icon: 'book' },
  { id: 'discover', label: 'Discover', icon: 'sparkle' },
  { id: 'profile', label: 'Profile', icon: 'person' },
];

function Icon({ name }: { name: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'home') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></svg>;
  if (name === 'play') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/></svg>;
  if (name === 'book') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20M8 7h8"/></svg>;
  if (name === 'sparkle') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>;
}

function getLegacyCounts() {
  try {
    const raw = localStorage.getItem('tracker_v1');
    if (!raw) return null;
    const value = JSON.parse(raw) as { series?: unknown[]; movies?: unknown[]; books?: unknown[] };
    return {
      series: value.series?.length ?? 0,
      movies: value.movies?.length ?? 0,
      books: value.books?.length ?? 0,
    };
  } catch {
    return null;
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [legacyCounts] = useState(getLegacyCounts);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
    } else {
      window.alert('On iPhone, open MST in Safari, tap Share, then Add to Home Screen.');
    }
  }

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? 'Home';

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="#home" onClick={() => setActiveTab('home')} aria-label="MST home">
          <span className="brand-mark">M</span><span className="brand-name">MST</span>
        </a>
        <div className="topbar-actions">
          <span className="saved-state"><span className="saved-dot" /> Saved on this device</span>
          <button className="install-button" type="button" onClick={installApp}>Install app</button>
        </div>
      </header>

      <main className="main-content" key={activeTab}>
        {activeTab === 'home' ? <HomePage counts={legacyCounts} /> : (
          <section className="page-intro" aria-labelledby="page-title">
            <p className="eyebrow">MST · YOUR PERSONAL LIBRARY</p>
            <h1 id="page-title">{activeLabel}</h1>
            <p className="page-description">
              {activeTab === 'watch' && 'Keep your shows and movies together, and pick up right where you left off.'}
              {activeTab === 'books' && 'Build your shelves, follow your reading progress, and remember the books you love.'}
              {activeTab === 'discover' && 'Find something good to watch or read next.'}
              {activeTab === 'profile' && 'Your account, privacy, goals, and app settings will live here.'}
            </p>
            <div className="coming-card">
              <span className="coming-icon"><Icon name={tabs.find((tab) => tab.id === activeTab)?.icon ?? 'sparkle'} /></span>
              <div>
                <h2>This space is ready for the next step</h2>
                <p>Your current tracker still works while MST is being rebuilt.</p>
                <a className="text-link" href={`${import.meta.env.BASE_URL}classic.html`}>Open the current tracker <span aria-hidden="true">↗</span></a>
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="tab-bar" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button
            className={`tab-button${activeTab === tab.id ? ' is-active' : ''}`}
            key={tab.id}
            type="button"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
