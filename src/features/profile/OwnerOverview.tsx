import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Metrics = {
  total_accounts: number;
  active_last_30_days: number;
  new_last_30_days: number;
};

export function OwnerOverview() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void Promise.resolve(supabase.rpc('owner_overview')).then(({ data, error }) => {
      if (!active) return;
      if (!error && data) {
        const firstRow = Array.isArray(data) ? data[0] : data;
        setMetrics(firstRow as Metrics);
      }
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  if (loading || !metrics) return null;

  return (
    <section className="owner-overview" aria-labelledby="owner-overview-title">
      <div className="owner-overview-heading">
        <div>
          <p className="eyebrow">OWNER VIEW</p>
          <h3 id="owner-overview-title">MST at a glance</h3>
        </div>
        <span className="aggregate-badge">Counts only</span>
      </div>
      <div className="owner-metrics">
        <article><strong>{metrics.total_accounts}</strong><span>accounts</span></article>
        <article><strong>{metrics.active_last_30_days}</strong><span>active in 30 days</span></article>
        <article><strong>{metrics.new_last_30_days}</strong><span>new in 30 days</span></article>
      </div>
      <p className="owner-privacy-note">This overview contains aggregate counts only, not users’ emails or private libraries.</p>
    </section>
  );
}
