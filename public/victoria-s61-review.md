# Victoria S61 evidence review

**Review status: preliminary desk review.** No drainage professional has reviewed this pilot, and no observed rainfall or flooding event has been compared with its SWMM output. The interface must continue to describe S61 results as uncalibrated scenario demonstrations.

## Public evidence located

- Environment and Climate Change Canada (ECCC) lists hourly, daily, and monthly historical data for **Victoria Gonzales CS** (station ID 114; climate ID 1018611). Its 1991–2020 climate normals page gives coordinates 48°24′47.896″N, 123°19′29.192″W and elevation 61 m. Sources: [ECCC historical station search](https://climate.weather.gc.ca/historical_data/search_historic_data_stations_e.html?searchType=stnName&txtStationName=victoria%20gonzales%20cs&timeframe=1) and [ECCC 1991–2020 normals](https://climate.weather.gc.ca/climate_normals/results_1991_2020_e.html?climate_id=1018610&dispBack=0&searchType=stnProv).
- ECCC's [GeoMet hourly observation API documentation](https://eccc-msc.github.io/open-data/msc-geomet/ogc_api_en/) describes the `climate-hourly` collection, including precipitation amount, precipitation quality flag, and station ID fields. A [2024 hourly query for station 114](https://api.weather.gc.ca/collections/climate-hourly/items?f=csv&STN_ID=114&datetime=2024-01-01%2F2024-12-31&limit=10000) is provided as a retrieval path; it has not been downloaded or checked here, including whether station 114 is present in that API collection.
- The City of Victoria's [Professional Rainwater Management Standards](https://www.victoria.ca/media/file/rainwater-management-standards-professional-edition) state a 32 mm in 24 hours rainwater-management target. This is a property rainwater-management design target, not a measured storm, drainage-system capacity, or S61 design storm.
- The sources reviewed did not provide a public flood/ponding event record spatially linked to the S61 assets.

## What this says about the model

The model's 20, 40, and 80 mm uniform profiles each last two hours. The City target's 24-hour duration differs, so comparing totals would be misleading. ECCC station metadata identifies a nearby regional rainfall source, but a station listing or climate normal is not an event series. No event-level observations were downloaded and aligned to model rainfall, so this review makes no claim that model response matches observed rainfall or flooding.

The modeled catchment has no observed runoff parameters or blockage/cleaning records. Its assumed source units and vertical datum also remain unverified. The displayed ranking therefore answers only: which modeled subset has the least overflow under these fixed assumptions? It does not establish which maintenance action would reduce real flooding.

## Required review before stronger claims

1. A drainage professional should check the S61 boundary and topology, source units/elevations, runoff and blockage assumptions, outfall treatment, and interpretation of recommended assets.
2. Obtain ECCC hourly precipitation for Victoria Gonzales CS over a documented period, inspect missing/quality flags, and select dated events with rainfall coverage suitable for comparison. Preserve the raw source and record timezone, missing values, and station-to-catchment distance.
3. Obtain dated, geolocated flooding or surcharge observations for S61 and compare them to matching rainfall/model runs. If such records are unavailable, state that limitation; do not substitute citywide flood counts or rainfall normals for local event validation.
4. Rebuild and review the SWMM model with qualified inputs before assessing event response. The current 2-hour uniform profiles are stress scenarios and cannot be treated as historical event hyetographs.

No expert was contacted as part of this implementation. This document is a desk review and a checklist for the independent review still needed.
