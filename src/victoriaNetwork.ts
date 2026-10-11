export type MapLayer = 'main' | 'manhole' | 'outfall' | 'catchment' | 'external-link';
export type Position = [number, number];

export type VictoriaFeature = {
  type: 'Feature';
  properties: Record<string, string | number | boolean | null> & { mapLayer: MapLayer };
  geometry:
    | { type: 'Point'; coordinates: Position }
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'Polygon'; coordinates: Position[][] };
};

export type VictoriaNetwork = {
  type: 'FeatureCollection';
  crs: { type: 'name'; properties: { name: string } };
  features: VictoriaFeature[];
};

export async function loadVictoriaNetwork(signal: AbortSignal): Promise<VictoriaNetwork> {
  const response = await fetch('/data/victoria/s61/network.geojson', { signal });
  if (!response.ok) throw new Error('Victoria network data could not be loaded.');

  const network = await response.json() as VictoriaNetwork;
  if (network.type !== 'FeatureCollection' || !Array.isArray(network.features)) {
    throw new Error('Victoria network data has an unexpected format.');
  }
  return network;
}
