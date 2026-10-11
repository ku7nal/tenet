# Victoria S61 demonstration model

`build_victoria_scenarios.py` runs EPA SWMM for the 15 source gravity mains in the qualified S61 extract. It evaluates every cleaning subset of up to three mains (576 feasible subsets) for three two-hour rainfall profiles, then compares no cleaning, a single-main-benefit baseline, and the lowest-overflow feasible plan. Profile results are written to `.generated/deploy/victoria-s61/` for the existing S3-backed recommendation API.

## Source data and assumptions

- Uses the qualified source topology, endpoint asset IDs, `Length_2D`, `Diameter`, upstream/downstream invert attributes, manhole `Elevation`, and catchment `Shape_Area`. It excludes external cross-catchment main `DGM005479`; source approximate `Slope` values are not used.
- The City of Victoria Open Government Licence permits copying, adapting, and distributing covered information for lawful purposes with attribution. The source service's layer copyright fields are blank, so verify the snapshot layers are City information covered by that licence and contain no third-party material before redistributing them. The required fallback attribution is: “Contains information licensed under the Open Government Licence – City of Victoria.”
- Assumes lengths and invert elevations are metres and diameters are millimetres; source units and vertical datum were not confirmed. At each manhole the model invert is the lowest incident pipe invert, and source rim elevation sets the junction depth. The missing outfall elevation is approximated by the terminal pipe's downstream invert.
- Divides the 11.13 ha catchment equally among the 15 mains and routes each assumed subcatchment to its main's upstream node. Imperviousness (75%), land slope (1%), surface Manning n (0.015 impervious, 0.25 pervious), depression storage (1.27/2.54 mm), Horton infiltration (50/5 mm per hour, decay 3 per hour, dry time 7 days), and pipe Manning roughness (0.013) are assumptions because the GIS has no runoff or soil data.
- Assumes every candidate main has 40% of cross-sectional area obstructed and cleaning restores its source-reported diameter. No blockage or maintenance observations support this assumption.
- Uses 20, 40, and 80 mm uniform rainfall over two hours as illustrative scenarios, not Victoria design storms. Runs use dynamic-wave routing and total node flood volume. Outputs are uncalibrated simulations, not predictions or operational recommendations.

EPA SWMM's manual describes the subcatchment parameters and routing methods used here: [SWMM 5.2 User's Manual](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P10145M6.TXT). The source GIS audit and qualifications are in [Victoria source audit](../.scratch/drainage-maintenance-prioritization/data/victoria-source-audit.md).

## Build and API wiring

```sh
python3 model/build_victoria_scenarios.py --swmm /path/to/runswmm
```

The browser requests `/api/recommendation?basin=victoria-s61&rainfallProfile=heavy&crewLimit=1`. For local Lambda invocation, generated profile JSON is read from `.generated/deploy/victoria-s61/`. In AWS, upload those profile files under the `victoria-s61/` S3 prefix and deploy the SAM template's added read permission before switching the UI to the Victoria network. Do not run deployment as part of local model generation.
