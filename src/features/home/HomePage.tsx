type Counts = { series: number; movies: number; books: number } | null;

export function HomePage({ counts }: { counts: Counts }) {
  return (
    <div className="home-page">
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow">YOUR WATCHLIST. YOUR BOOKS. YOUR STORY.</p>
          <h1 id="welcome-title">A little more room for what you love.</h1>
          <p>One personal place for the stories you watch, read, and want to remember.</p>
          <a className="primary-link" href={`${import.meta.env.BASE_URL}classic.html`}>Open your tracker <span aria-hidden="true">→</span></a>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="art-orbit orbit-one" />
          <span className="art-orbit orbit-two" />
          <span className="art-card art-card-back">✦</span>
          <span className="art-card art-card-front"><span>mst</span><i>stories, saved</i></span>
        </div>
      </section>

      <section className="section-block" aria-labelledby="library-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A GOOD PLACE TO PICK UP</p>
            <h2 id="library-heading">Your library</h2>
          </div>
          <a className="quiet-link" href={`${import.meta.env.BASE_URL}classic.html`}>View tracker <span aria-hidden="true">↗</span></a>
        </div>
        <div className="stat-grid">
          <article className="stat-card stat-shows"><span className="stat-label">Series</span><strong>{counts ? counts.series : '—'}</strong><span className="stat-note">in your tracker</span></article>
          <article className="stat-card stat-movies"><span className="stat-label">Movies</span><strong>{counts ? counts.movies : '—'}</strong><span className="stat-note">in your tracker</span></article>
          <article className="stat-card stat-books"><span className="stat-label">Books</span><strong>{counts ? counts.books : '—'}</strong><span className="stat-note">in your tracker</span></article>
        </div>
      </section>

      <section className="section-block next-step" aria-labelledby="next-heading">
        <div className="next-symbol" aria-hidden="true">✦</div>
        <div>
          <p className="eyebrow">COMING INTO FOCUS</p>
          <h2 id="next-heading">Your next favorite is out there.</h2>
          <p>Search, recommendations, and continue-watching are on the way. Your current tracker is still available in the meantime.</p>
        </div>
        <a className="text-link" href={`${import.meta.env.BASE_URL}classic.html`}>Go to current MST <span aria-hidden="true">→</span></a>
      </section>
    </div>
  );
}
