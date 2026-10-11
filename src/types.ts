export type JunctionResult = {
  id: string;
  overflowM3: number;
};

export type Plan = {
  id: 'no-cleaning' | 'independent' | 'network-aware';
  label: string;
  drainIds: string[];
  totalOverflowM3: number;
  junctions: JunctionResult[];
};

export type RankedAction = {
  rank: number;
  assetId: string;
  overflowReductionM3: number;
};

export type RainfallProfileId = 'moderate' | 'heavy' | 'extreme';

export type Recommendation = {
  basin: { id: string; label: string };
  rainfallProfile: {
    id: RainfallProfileId;
    label: string;
    totalDepthMm: number;
    durationHours: number;
    intensityMmPerHour: number;
    source: string;
  };
  crewLimit: 1 | 2 | 3;
  rankedActions?: RankedAction[];
  blockageAssumption: string;
  model: { engine: string; runStatus: string; calibration?: string };
  dmpContext?: { reportedSegmentCount: number; mappedToNetwork: false };
  assumptions?: string[];
  dataGaps?: string[];
  plans: Plan[];
};
