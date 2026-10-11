import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';
import { loadVictoriaNetwork, type Position, type VictoriaFeature, type VictoriaNetwork } from './victoriaNetwork';

const width = 1400;
const height = 900;
const padding = 32;
type MapViewport = { x: number; y: number; width: number; height: number };
const initialViewport: MapViewport = { x: 0, y: 0, width, height };
type CityFeature = Omit<VictoriaFeature, 'geometry'> & {
  geometry: VictoriaFeature['geometry'] | null;
};
type CityNetwork = Omit<VictoriaNetwork, 'features'> & { features: CityFeature[] };

function worldPosition([longitude, latitude]: Position, zoom: number): Position {
  const radians = Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI / 180;
  const size = 256 * 2 ** zoom;
  return [((longitude + 180) / 360) * size, ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * size];
}

function coordinates(feature: CityFeature): Position[] {
  if (!feature.geometry) return [];
  if (feature.geometry.type === 'Point') return [feature.geometry.coordinates];
  return feature.geometry.type === 'LineString' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
}

function fit(features: CityFeature[]) {
  const points = features.flatMap(coordinates);
  if (!points.length) throw new Error('The City GIS has no map coordinates.');
  const base = points.map(([longitude, latitude]) => {
    const radians = Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI / 180;
    return [(longitude + 180) / 360, (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2] as Position;
  });
  const minX = Math.min(...base.map(([x]) => x));
  const maxX = Math.max(...base.map(([x]) => x));
  const minY = Math.min(...base.map(([, y]) => y));
  const maxY = Math.max(...base.map(([, y]) => y));
  const zoom = Math.max(1, Math.floor(Math.log2(Math.min(
    (width - 2 * padding) / ((maxX - minX) * 256),
    (height - 2 * padding) / ((maxY - minY) * 256),
  ))));
  const size = 256 * 2 ** zoom;
  const bounds = { minX: minX * size, maxX: maxX * size, minY: minY * size, maxY: maxY * size };
  const scale = Math.min((width - 2 * padding) / (bounds.maxX - bounds.minX), (height - 2 * padding) / (bounds.maxY - bounds.minY));
  const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = (height - (bounds.maxY - bounds.minY) * scale) / 2;
  const project = (position: Position): Position => {
    const [x, y] = worldPosition(position, zoom);
    return [offsetX + (x - bounds.minX) * scale, offsetY + (y - bounds.minY) * scale];
  };
  const tiles = [];
  for (let x = Math.floor(bounds.minX / 256); x <= Math.floor(bounds.maxX / 256); x++) {
    for (let y = Math.floor(bounds.minY / 256); y <= Math.floor(bounds.maxY / 256); y++) {
      if (y < 0 || y >= 2 ** zoom) continue;
      const tileX = ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
      tiles.push({
        key: `${zoom}/${tileX}/${y}`,
        href: `https://tile.openstreetmap.org/${zoom}/${tileX}/${y}.png`,
        x: offsetX + (x * 256 - bounds.minX) * scale,
        y: offsetY + (y * 256 - bounds.minY) * scale,
        size: 256 * scale,
      });
    }
  }
  return { project, tiles };
}

function linePath(features: CityFeature[], project: (position: Position) => Position) {
  return features.flatMap((feature) => {
    if (feature.geometry?.type !== 'LineString') return [];
    const [first, ...rest] = feature.geometry.coordinates.map(project);
    return [`M${first[0].toFixed(1)} ${first[1].toFixed(1)} ${rest.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}`];
  }).join(' ');
}

function circlePath(features: CityFeature[], project: (position: Position) => Position, radius: number) {
  return features.flatMap((feature) => {
    if (feature.geometry?.type !== 'Point') return [];
    const [x, y] = project(feature.geometry.coordinates);
    return [`M${(x - radius).toFixed(1)} ${y.toFixed(1)}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`];
  }).join(' ');
}

function featureId(feature: CityFeature) {
  const value = feature.properties.AssetID ?? feature.properties.NodeID ?? feature.properties.NAME ?? feature.properties.OutfallNo;
  return value === null || value === undefined ? 'Unknown asset' : String(value);
}

function downloadWorklist(features: CityFeature[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    const safe = /^[=+@-]/.test(text.trim()) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [
    ['Crew', 'Asset ID', 'Importance factor', 'Recorded owner', 'Water type', 'Lifecycle status'],
    ...features.map((feature, index) => [
      `Crew ${index + 1}`, featureId(feature), feature.properties.ImportanceFactor,
      feature.properties.OwnedBy, feature.properties.WaterType, feature.properties.LifecycleStatus,
    ]),
  ];
  const blob = new Blob([rows.map((row) => row.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'victoria-city-gis-draft-worklist.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function featureFields(feature: CityFeature) {
  const layer = feature.properties.mapLayer;
  const fields = layer === 'main'
    ? [['ImportanceFactor', 'City GIS importance (not condition)'], ['Diameter', 'Diameter (source units unspecified)'], ['CrossSectionShape', 'Cross-section'], ['UpstreamInvert', 'Upstream invert (datum unverified)'], ['DownstreamInvert', 'Downstream invert (datum unverified)'], ['Slope', 'Approximate slope (%)'], ['Length_2D', 'Length_2D (units unverified)'], ['UpstreamNodeID', 'Upstream junction'], ['DownstreamNodeID', 'Downstream junction'], ['DataSource', 'Recorded data-source code']]
    : layer === 'manhole'
      ? [['Elevation', 'Rim elevation (datum unverified)'], ['CatchmentArea', 'Recorded catchment'], ['SurveyRequired', 'Survey flag'], ['DataSource', 'Recorded data-source code']]
      : [['OutfallNo', 'Outfall number'], ['Elevation', 'Elevation (datum unverified)'], ['OutfallCategory', 'Category'], ['DataSource', 'Recorded data-source code']];
  return fields.map(([key, label]) => ({ label, value: feature.properties[key] === null || feature.properties[key] === undefined || feature.properties[key] === '' ? 'Not recorded' : String(feature.properties[key]) }));
}

function distanceToSegment(point: Position, start: Position, end: Position) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const length = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  const t = length ? Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / length)) : 0;
  return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
}

export default function VictoriaCityMap({ recommendedAssetIds = [] }: { recommendedAssetIds?: string[] }) {
  const [network, setNetwork] = useState<CityNetwork | null>(null);
  const [pilotNetwork, setPilotNetwork] = useState<VictoriaNetwork | null>(null);
  const [error, setError] = useState('');
  const [showMains, setShowMains] = useState(true);
  const [showNodes, setShowNodes] = useState(false);
  const [showOutfalls, setShowOutfalls] = useState(true);
  const [selected, setSelected] = useState<CityFeature | null>(null);
  const [crewCountInput, setCrewCountInput] = useState('3');
  const [worklistOpen, setWorklistOpen] = useState(false);
  const [viewport, setViewport] = useState(initialViewport);
  const [isDragging, setIsDragging] = useState(false);
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number; viewport: MapViewport } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/data/victoria/citywide-network.geojson', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('The full Victoria city map could not be loaded.');
        const data = await response.json() as CityNetwork;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('The full Victoria map data has an unexpected format.');
        return data;
      }),
      loadVictoriaNetwork(controller.signal),
    ])
      .then(([city, pilot]) => {
        setNetwork(city);
        setPilotNetwork(pilot);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The full Victoria city map could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  const map = useMemo(() => network ? fit(network.features) : null, [network]);
  const visible = useMemo(() => network?.features.filter((feature) => feature.geometry) ?? [], [network]);
  const mains = useMemo(() => visible.filter((feature) => feature.properties.mapLayer === 'main'), [visible]);
  const manholes = useMemo(() => visible.filter((feature) => feature.properties.mapLayer === 'manhole'), [visible]);
  const outfalls = useMemo(() => visible.filter((feature) => feature.properties.mapLayer === 'outfall'), [visible]);
  const cityCandidates = useMemo(() => mains
    .filter((feature) => feature.properties.OwnedBy === 'VC' && feature.properties.LifecycleStatus === 'ACT' && feature.properties.WaterType === 'STM')
    .sort((a, b) => {
      const importance = (value: unknown) => ({ H: 0, M: 1, L: 2 } as Record<string, number>)[String(value)] ?? 3;
      return importance(a.properties.ImportanceFactor) - importance(b.properties.ImportanceFactor) || featureId(a).localeCompare(featureId(b));
    }), [mains]);
  const requestedCrewCount = Number(crewCountInput);
  const validCrewCount = Number.isInteger(requestedCrewCount) && requestedCrewCount >= 1 && requestedCrewCount <= cityCandidates.length;
  const cityWorklist = validCrewCount ? cityCandidates.slice(0, requestedCrewCount) : [];
  const recommended = new Set(recommendedAssetIds);
  const highlightedMains = mains.filter((feature) => recommended.has(String(feature.properties.AssetID)));
  const selectedPath = selected?.geometry?.type === 'LineString' ? [selected] : [];
  const selectedPoint = selected?.geometry?.type === 'Point' ? [selected] : [];
  const counts = network?.features.reduce((total, feature) => {
    total[feature.properties.mapLayer] += 1;
    return total;
  }, { main: 0, manhole: 0, outfall: 0, catchment: 0, 'external-link': 0 });

  if (error) return <div className="map-load-state has-error" role="alert">{error}</div>;
  if (!network || !pilotNetwork || !map || !counts) return <div className="map-load-state" role="status">Loading the complete Victoria network…</div>;

  const pilotBoundary = pilotNetwork.features.find((feature) => feature.properties.mapLayer === 'catchment' && feature.geometry.type === 'Polygon');
  const boundaryPath = pilotBoundary?.geometry?.type === 'Polygon'
    ? pilotBoundary.geometry.coordinates.map((ring) => {
      const [first, ...rest] = ring.map(map.project);
      return `M${first[0].toFixed(1)} ${first[1].toFixed(1)} ${rest.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z`;
    }).join(' ')
    : '';
  const missingNodeLocations = counts.manhole - manholes.length;
  const selectedInPilot = selected && pilotNetwork.features.some((feature) =>
    feature.properties.mapLayer === selected.properties.mapLayer && String(feature.properties.AssetID) === featureId(selected));
  const selectedCrew = selected ? cityWorklist.findIndex((feature) => featureId(feature) === featureId(selected)) + 1 : 0;
  const focusAssignment = (feature: CityFeature) => {
    const projected = coordinates(feature).map(map.project);
    if (!projected.length) return;
    const xs = projected.map(([x]) => x);
    const ys = projected.map(([, y]) => y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * width / height);
    const viewWidth = Math.max(width / 8, Math.min(width / 0.65, extent * 6));
    const viewHeight = viewWidth * height / width;
    setSelected(feature);
    setShowMains(true);
    setViewport({ x: centerX - viewWidth / 2, y: centerY - viewHeight / 2, width: viewWidth, height: viewHeight });
    mapCanvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectFeature = (event: MouseEvent<SVGSVGElement>) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const point: Position = [viewport.x + (event.clientX - rect.left) * viewport.width / rect.width, viewport.y + (event.clientY - rect.top) * viewport.height / rect.height];
    let nearest: CityFeature | null = null;
    let nearestDistance = 12 * viewport.width / rect.width;
    for (const feature of visible) {
      if ((feature.properties.mapLayer === 'main' && !showMains) || (feature.properties.mapLayer === 'manhole' && !showNodes) || (feature.properties.mapLayer === 'outfall' && !showOutfalls)) continue;
      const geometry = feature.geometry;
      if (!geometry) continue;
      const positions = geometry.type === 'Point' ? [geometry.coordinates] : geometry.type === 'LineString' ? geometry.coordinates : [];
      const projected = positions.map(map.project);
      const distance = geometry.type === 'Point'
        ? Math.hypot(point[0] - projected[0][0], point[1] - projected[0][1])
        : projected.slice(1).reduce((minimum, current, index) => Math.min(minimum, distanceToSegment(point, projected[index], current)), Infinity);
      if (distance < nearestDistance) {
        nearest = feature;
        nearestDistance = distance;
      }
    }
    if (nearest) setSelected(nearest);
  };
  const zoom = (factor: number, anchor: Position = [viewport.x + viewport.width / 2, viewport.y + viewport.height / 2]) => {
    setViewport((current) => {
      const nextWidth = Math.max(width / 8, Math.min(width / 0.65, current.width * factor));
      const nextHeight = nextWidth * height / width;
      const scale = nextWidth / current.width;
      return { x: anchor[0] - (anchor[0] - current.x) * scale, y: anchor[1] - (anchor[1] - current.y) * scale, width: nextWidth, height: nextHeight };
    });
  };
  const zoomWithWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoom(event.deltaY < 0 ? 0.85 : 1.18, [
      viewport.x + (event.clientX - rect.left) * viewport.width / rect.width,
      viewport.y + (event.clientY - rect.top) * viewport.height / rect.height,
    ]);
  };
  const beginPan = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, viewport };
    dragged.current = false;
  };
  const pan = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStart.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    if (Math.hypot(dx, dy) > 3) {
      dragged.current = true;
      setIsDragging(true);
    }
    setViewport({
      ...dragStart.current.viewport,
      x: dragStart.current.viewport.x - dx * dragStart.current.viewport.width / rect.width,
      y: dragStart.current.viewport.y - dy * dragStart.current.viewport.height / rect.height,
    });
  };
  const endPan = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = null;
    setIsDragging(false);
  };
  const selectWithKeyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.75); return; }
    if (event.key === '-') { event.preventDefault(); zoom(1.33); return; }
    if (event.key === '0') { event.preventDefault(); setViewport(initialViewport); return; }
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const selectable = visible.filter((feature) => feature.geometry &&
      ((feature.properties.mapLayer === 'main' && showMains) || (feature.properties.mapLayer === 'manhole' && showNodes) || (feature.properties.mapLayer === 'outfall' && showOutfalls)));
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const index = selectable.indexOf(selected ?? selectable[0]);
    const current = index < 0 ? (direction > 0 ? -1 : 0) : index;
    setSelected(selectable[(current + direction + selectable.length) % selectable.length] ?? null);
  };

  return (
    <div className="city-map-content">
      <section className="city-allocation" aria-labelledby="city-allocation-title">
        <div className="city-allocation-heading">
          <div>
            <p className="section-kicker">Citywide GIS work allocation</p>
            <h3 id="city-allocation-title">Draft one-asset assignments</h3>
          </div>
          <label htmlFor="city-crew-count">Crews available</label>
          <div className="city-crew-input"><input id="city-crew-count" type="number" min="1" max={cityCandidates.length} step="1" value={crewCountInput} onChange={(event) => setCrewCountInput(event.currentTarget.value)} onBlur={() => {
            const count = Number(crewCountInput);
            setCrewCountInput(String(Number.isInteger(count) ? Math.max(1, Math.min(cityCandidates.length, count)) : 1));
          }} /><span>of {cityCandidates.length.toLocaleString('en-CA')} eligible mains</span></div>
        </div>
        <p className="city-allocation-note">One gravity main per crew. Order uses the City GIS ImportanceFactor (High, Medium, Low, then unrated), with asset ID as tie-breaker. This is a draft inventory allocation, not cleaning urgency or a flood-reduction recommendation.</p>
        {validCrewCount ? <div className="city-worklist-actions">
          <details className="city-worklist" onToggle={(event) => setWorklistOpen(event.currentTarget.open)}>
            <summary>View {cityWorklist.length.toLocaleString('en-CA')} draft assignments</summary>
            {worklistOpen && <ol>{cityWorklist.map((feature, index) => <li key={featureId(feature)}><button className={`city-worklist-select${selected === feature ? ' is-selected' : ''}`} type="button" aria-pressed={selected === feature} onClick={() => focusAssignment(feature)}><span>Crew {index + 1}</span><strong>{featureId(feature)}</strong><small>Importance: {({ H: 'High', M: 'Medium', L: 'Low' } as Record<string, string>)[String(feature.properties.ImportanceFactor)] ?? 'Unrated'}</small></button></li>)}</ol>}
          </details>
          <button className="city-worklist-download" type="button" onClick={() => downloadWorklist(cityWorklist)}>Download draft CSV</button>
        </div> : <p className="city-allocation-error" role="alert">Enter a whole number from 1 to {cityCandidates.length.toLocaleString('en-CA')}.</p>}
      </section>
      <div className="city-map-controls" role="group" aria-label="City network map layers">
        <label><input type="checkbox" checked={showNodes} onChange={(event) => setShowNodes(event.target.checked)} /> Nodes <span>{counts.manhole.toLocaleString('en-CA')}</span></label>
        <label><input type="checkbox" checked={showMains} onChange={(event) => setShowMains(event.target.checked)} /> Gravity mains <span>{counts.main.toLocaleString('en-CA')}</span></label>
        <label><input type="checkbox" checked={showOutfalls} onChange={(event) => setShowOutfalls(event.target.checked)} /> Outfalls <span>{counts.outfall.toLocaleString('en-CA')}</span></label>
        <span className="city-map-scope">Hydraulic recommendations apply to the S61 pilot only</span>
      </div>
      <div className="city-map-canvas" ref={mapCanvasRef}>
        <div className="city-map-zoom" role="group" aria-label="Map navigation">
          <button type="button" aria-label="Zoom in" onClick={() => zoom(0.75)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(1.33)}>−</button>
          <button type="button" aria-label="Reset map view" onClick={() => setViewport(initialViewport)}>Reset</button>
        </div>
        <svg className={`citywide-map${isDragging ? ' is-dragging' : ''}`} viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`} role="group" tabIndex={0} aria-label="Interactive citywide Victoria storm-drain network; scroll or use plus/minus to zoom, drag to pan, and arrow keys to select features" onClick={selectFeature} onKeyDown={selectWithKeyboard} onWheel={zoomWithWheel} onPointerDown={beginPan} onPointerMove={pan} onPointerUp={endPan} onPointerCancel={endPan}>
          <title id="city-map-title">Citywide Victoria storm-drain network</title>
          <desc id="city-map-description">All gravity mains, manholes, and outfalls from the saved City of Victoria GIS snapshot. Orange mains are recommended for the S61 pilot only.</desc>
          <rect width={width} height={height} fill="#edf0ec" />
          {map.tiles.map((tile) => <image key={tile.key} href={tile.href} x={tile.x} y={tile.y} width={tile.size} height={tile.size} />)}
          {showMains && <path d={linePath(mains, map.project)} className="citywide-main" />}
          {showMains && <path d={linePath(cityWorklist, map.project)} className="citywide-main is-city-assigned" />}
          {showNodes && <path d={circlePath(manholes, map.project, 4.2)} className="citywide-node" />}
          {showOutfalls && <path d={circlePath(outfalls, map.project, 5.2)} className="citywide-outfall" />}
          {showMains && <path d={linePath(highlightedMains, map.project)} className="citywide-main is-recommended" />}
          {showMains && selectedPath.length > 0 && <path d={linePath(selectedPath, map.project)} className="citywide-main is-selected" />}
          {((selected?.properties.mapLayer === 'outfall' && showOutfalls) || (selected?.properties.mapLayer === 'manhole' && showNodes)) && selectedPoint.length > 0 && <path d={circlePath(selectedPoint, map.project, 7)} className="citywide-selected-node" />}
          {boundaryPath && <path d={boundaryPath} className="citywide-pilot-boundary" />}
          <text x={padding} y={height - padding} className="citywide-label">Victoria, British Columbia · citywide GIS</text>
        </svg>
        <a className="city-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </div>
      <div className="city-map-legend">
        <span><i className="city-legend-main" />Gravity mains</span>
        <span><i className="city-legend-node" />Manholes</span>
        <span><i className="city-legend-outfall" />Outfalls ({counts.outfall})</span>
        <span><i className="city-legend-recommended" />S61 cleaning recommendation</span>
        <span><i className="city-legend-assigned" />Draft city work assignment</span>
      </div>
      <aside className="asset-inspector citywide-inspector" aria-live="polite" aria-label="Selected citywide source asset">
        {selected ? <>
          <div className="asset-inspector-heading"><div><p className="section-kicker">Selected source feature</p><h3>{featureId(selected)}</h3></div><span className="asset-type">{selected.properties.mapLayer === 'main' ? 'Gravity main' : selected.properties.mapLayer === 'manhole' ? 'Manhole' : 'Outfall'}</span></div>
          <p className="asset-owner"><span>Recorded owner</span><strong>{String(selected.properties.OwnedBy ?? 'Not recorded')}</strong></p>
          {selected.properties.mapLayer === 'main' && <p className="asset-owner"><span>City GIS worklist</span><strong>{selectedCrew ? `Crew ${selectedCrew}` : 'Not assigned in this draft'}</strong></p>}
          <dl className="asset-fields">{featureFields(selected).map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className="asset-source-note">{selectedInPilot ? 'Included in the S61 SWMM pilot.' : 'Citywide GIS context; outside the S61 SWMM pilot.'} City GIS values are not field-verified.</p>
        </> : <p className="asset-source-note">Select any gravity main or node on the map to inspect its source ID and recorded owner. S61 recommendations are highlighted in orange.</p>}
      </aside>
      <p className="city-map-source">Saved <a href="https://maps.victoria.ca/server/rest/services/OpenData/OpenData_StormDrain/MapServer" target="_blank" rel="noreferrer">City of Victoria storm-drain GIS</a> snapshot · {counts.main.toLocaleString('en-CA')} gravity-main records · {counts.manhole.toLocaleString('en-CA')} manhole records ({manholes.length.toLocaleString('en-CA')} mapped{missingNodeLocations ? `, ${missingNodeLocations} without source geometry` : ''}) · {outfalls.length.toLocaleString('en-CA')} outfalls. Exact layer reuse terms need confirmation. The map is citywide context; the simulation is limited to S61.</p>
    </div>
  );
}
