import { useEffect, useState } from 'react';
import type { Plan, Recommendation, RainfallProfileId } from './types';

// shortcut: this is a schematic because verified basin geometries are unavailable; use MapLibre once geographic assets are obtained.
const drainIds = Array.from({ length: 8 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`);
const rainfallProfiles: { id: RainfallProfileId; label: string }[] = [
  { id: 'moderate', label: 'Moderate' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'extreme', label: 'Extreme' },
];
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
const basinId = 'barapullah';

function formatVolume(volume: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(volume);
}

function NetworkDiagram({ recommendation }: { recommendation: Recommendation | null }) {
  const cleaned = new Set(recommendation?.plans.find((plan) => plan.id === 'network-aware')?.drainIds ?? []);
  const overflowAt = new Map(
    recommendation?.plans
      .find((plan) => plan.id === 'network-aware')
      ?.junctions.map((junction) => [junction.id, junction.overflowM3]) ?? [],
  );

  return (
    <svg className="network-drawing" viewBox="0 0 960 410" role="img" aria-labelledby="network-title network-desc">
      <title id="network-title">Illustrative eight-drain network</title>
      <desc id="network-desc">A schematic drainage route with eight candidate drains and nine modeled junctions. It is not a geographic map.</desc>
      <defs>
        <pattern id="paper-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#dfe4dc" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="960" height="410" fill="url(#paper-grid)" />
      <path className="channel-bed" d="M90 300 C190 273 228 315 324 279 S480 249 558 277 S713 322 862 254" />
      <path className="channel-flow" d="M90 300 C190 273 228 315 324 279 S480 249 558 277 S713 322 862 254" />
      {drainIds.map((drainId, index) => {
        const x = 112 + index * 103;
        const y = [294, 286, 292, 270, 264, 279, 291, 273][index];
        const junctionId = `J${String(index + 1).padStart(2, '0')}`;
        const overflow = overflowAt.get(junctionId) ?? 0;
        return (
          <g key={drainId}>
            <path
              className={`drain-link ${cleaned.has(drainId) ? 'is-cleaned' : ''}`}
              d={index < drainIds.length - 1
                ? `M${x} ${y} L${x + 103} ${[286, 292, 270, 264, 279, 291, 273][index]}`
                : `M${x} ${y} L862 254`}
            />
            <circle className={`junction ${overflow > 0 ? 'has-overflow' : ''}`} cx={x} cy={y} r="9" />
            <text className="junction-label" x={x} y={y - 22}>{junctionId}</text>
            <text className={`drain-label ${cleaned.has(drainId) ? 'is-cleaned' : ''}`} x={x + 48} y={y + 39}>{drainId}</text>
            {cleaned.has(drainId) && <text className="cleaned-mark" x={x + 48} y={y + 56}>clean</text>}
            {overflow > 0 && <text className="overflow-label" x={x} y={y + 30}>{formatVolume(overflow)} m³</text>}
          </g>
        );
      })}
      <text className="outfall-label" x="864" y="226">Outfall</text>
      <path className="outfall-arrow" d="M862 254 L896 240 M896 240 L885 239 M896 240 L891 250" />
      <text className="schematic-note" x="24" y="384">Schematic · not to scale · model assets are illustrative</text>
    </svg>
  );
}

function PlanPanel({ plan, baselineVolume }: { plan: Plan; baselineVolume: number }) {
  const change = baselineVolume - plan.totalOverflowM3;
  const isRecommended = plan.id === 'network-aware';
  return (
    <article className={`plan-panel ${isRecommended ? 'is-recommended' : ''}`}>
      <div className="plan-heading">
        <span>{plan.label}</span>
        {isRecommended && <span className="plan-tag">Lowest modeled overflow</span>}
      </div>
      <p className="plan-volume">{formatVolume(plan.totalOverflowM3)} <small>m³</small></p>
      <p className="plan-caption">Modeled junction overflow</p>
      <div className="plan-detail">
        <span>Change from no cleaning</span>
        <strong className={change > 0 ? 'positive-change' : ''}>{change > 0 ? `−${formatVolume(change)}` : '—'} m³</strong>
      </div>
      <div className="plan-detail">
        <span>Cleaning actions</span>
        <strong>{plan.drainIds.length ? plan.drainIds.join(', ') : 'None'}</strong>
      </div>
    </article>
  );
}

export default function App() {
  const [crewLimit, setCrewLimit] = useState<1 | 2 | 3>(1);
  const [profileId, setProfileId] = useState<RainfallProfileId>('heavy');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setRecommendation(null);
    fetch(`${apiBaseUrl}/api/recommendation?basin=${basinId}&rainfallProfile=${profileId}&crewLimit=${crewLimit}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? 'The scenario results are unavailable.');
        return body as Recommendation;
      })
      .then((result) => {
        setRecommendation(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setRecommendation(null);
        setError(cause instanceof Error ? cause.message : 'The scenario results are unavailable.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [crewLimit, profileId]);

  const plans = recommendation?.plans ?? [];
  const noCleaning = plans.find((plan) => plan.id === 'no-cleaning');

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Tenet home"><span className="brand-mark">T</span><span>Tenet</span></a>
        <div className="topbar-context"><span className="live-dot" /> Dispatch planning <span className="context-divider">/</span> Barapullah basin</div>
        <span className="simulation-badge">Illustrative model</span>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="section-kicker">Drainage maintenance · planning window</p>
          <h1>Plan the work<br />before the rain.</h1>
          <p className="intro-copy">Compare cleaning choices by how they change overflow across a connected network.</p>
        </div>
        <div className="run-stamp">
          <span className="stamp-label">Model run</span>
          <strong>{loading ? 'Loading scenario' : error ? 'Results unavailable' : 'Ready'}</strong>
          <span>EPA SWMM · {recommendation?.rainfallProfile.label ?? 'selected profile'}</span>
        </div>
      </section>

      <section className="workspace" aria-label="Planning controls and network results">
        <aside className="control-rail">
          <div className="rail-section">
            <p className="section-kicker">Rainfall profile</p>
            <div className="profile-picker" role="group" aria-label="Rainfall profile">
              {rainfallProfiles.map((profile) => (
                <button key={profile.id} type="button" aria-pressed={profileId === profile.id} onClick={() => setProfileId(profile.id)}>
                  {profile.label}
                </button>
              ))}
            </div>
            <div className="profile-name">{recommendation?.rainfallProfile.label ?? 'Loading'}</div>
            <div className="profile-stat"><span>Total depth</span><strong>{recommendation ? `${recommendation.rainfallProfile.totalDepthMm} mm` : '—'}</strong></div>
            <div className="profile-stat"><span>Duration</span><strong>{recommendation ? `${recommendation.rainfallProfile.durationHours} hours` : '—'}</strong></div>
            <p className="assumption-note">Illustrative uniform rainfall; not a local design storm. Profiles are shown separately without assigned probabilities.</p>
          </div>

          <div className="rail-section crew-section">
            <p className="section-kicker">Crews available</p>
            <div className="crew-picker" role="group" aria-label="Maximum crews available">
              {[1, 2, 3].map((count) => (
                <button key={count} type="button" aria-pressed={crewLimit === count} onClick={() => setCrewLimit(count as 1 | 2 | 3)}>
                  <strong>{count}</strong><span>{count === 1 ? 'crew' : 'crews'}</span>
                </button>
              ))}
            </div>
            <p className="assumption-note">One cleaning job per crew. Jobs finish before rainfall begins.</p>
          </div>

          <div className="rail-section assumption-list">
            <p className="section-kicker">Model assumptions</p>
            <p><span className="assumption-dot" />Fixed blockage by drain</p>
            <p><span className="assumption-dot" />Cleaning removes assumed blockage</p>
            <p><span className="assumption-dot" />Equal weight for every junction</p>
          </div>

          <div className="context-note">
            <span className="context-icon" aria-hidden="true">⌁</span>
            <div>
              <strong>DMP waterlogging context</strong>
              <p>The report lists 330 traffic-police-reported segments citywide. They are not mapped to this illustrative network.</p>
              <a href="https://ifc.delhi.gov.in/sites/default/files/inline-files/main_report_dmp_version51.pdf" target="_blank" rel="noreferrer">Open DMP report</a>
            </div>
          </div>
        </aside>

        <section className="network-section" aria-labelledby="network-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Illustrative subnetwork</p>
              <h2 id="network-heading">Eight candidate drains</h2>
            </div>
            <span className="map-key"><i className="key-line" /> Drain <i className="key-dot" /> Junction</span>
          </div>
          <div className="map-frame">
            <NetworkDiagram recommendation={recommendation} />
          </div>
          <div className={`result-state ${error ? 'has-error' : ''}`} aria-live="polite">
            {loading ? <><span className="state-mark loading-mark" />Loading the precomputed SWMM result…</> : error ? <><span className="state-mark error-mark" />{error}</> : <><span className="state-mark ready-mark" />Result calculated from precomputed SWMM outcomes.</>}
          </div>
        </section>
      </section>

      <section className="comparison" aria-labelledby="comparison-heading">
        <div className="comparison-heading">
          <div>
            <p className="section-kicker">Plan comparison</p>
            <h2 id="comparison-heading">Where should the crews go?</h2>
          </div>
          <p>At most {crewLimit} {crewLimit === 1 ? 'job' : 'jobs'} · all plans use the same rainfall and blockage assumptions</p>
        </div>
        {error ? (
          <div className="empty-results">
            <strong>Could not load the scenario result.</strong>
            <span>{error}</span>
          </div>
        ) : (
          <div className="plan-grid">
            {plans.map((plan) => <PlanPanel key={plan.id} plan={plan} baselineVolume={noCleaning?.totalOverflowM3 ?? 0} />)}
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span>Model simulations · not real-time predictions or guaranteed avoided damage.</span>
        <span>{recommendation?.model.engine ?? 'EPA SWMM'} · {recommendation?.rainfallProfile.label ?? 'Heavy illustrative profile'}</span>
      </footer>
    </main>
  );
}
