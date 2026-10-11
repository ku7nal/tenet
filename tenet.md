# Drainage Maintenance Prioritization MVP

## Project

**Working title:** Tenet (name can change)

**Track:** Heat & Water + Waste & Energy

**Geography decision:** The currently deployed eight-drain demo is an illustrative Delhi/Barapullah prototype. The future real-network pilot will use public City of Victoria, BC storm-drain GIS. Do not present the Delhi illustration as a real mapped network or Victoria result.

**Core question:** Given limited crews and a selected rainfall profile, which drain-cleaning actions produce the least modeled junction overflow across the network?

This is a maintenance decision tool, not another flood-risk map. It compares candidate actions by simulating how cleaning changes flows through a connected drainage network.

## MVP experience

Build a small web dashboard for a municipal dispatcher.

1. Select one drainage basin and a planning window.
2. Choose one of three rainfall profiles: moderate, heavy, or extreme. Show results separately; do not combine them using unsupported scenario probabilities.
3. Set the maximum number of available crews, from one to three. Each crew can complete one drain-cleaning job in the planning window, and all selected jobs are assumed complete before rainfall begins. Travel-time and route optimization are out of scope.
4. Compare three plans: no cleaning, a single-drain-benefit baseline, and the network-aware recommendation. Both cleaning plans may use fewer than the available crews.
5. Display selected drains on a map and in a ranked action list. For each plan, show modeled junction overflow volume across all modeled junctions and its change from the no-cleaning case. Give all junctions equal weight. Show DMP waterlogging locations as geographic context only; they are not mapped to modeled junctions.
6. Show data quality and assumptions beside the results: illustrative, observed, estimated, or missing network attributes; assumed blockage state; rainfall profile; and model run status. The current Delhi prototype uses illustrative assets; the Victoria pilot has a selected source-mapped S61 extract, with its limits documented in the source audit.

The main demo moment is changing rainfall or crew count and watching the selected set of drains and simulated outcomes update. The app must label outputs as **model simulations**, not real-time flood predictions or guaranteed avoided damage.

## Data and feasibility gate

The public-data check is complete. The department publishes an indicative drainage map and the DMP report, but the official downloads checked do not include a ready-to-use GIS network or SWMM model file. The report provides useful basin context and describes the data and SWMM models IIT Delhi assembled, but by itself it is not enough to reproduce a validated hydraulic simulation from public downloads.

The report also documents important input gaps: some invert levels are missing or interpolated, drain dimensions are estimated in places, some outfalls were assumed, and other network details need verification. Historical waterlogging locations provide real-world context, but do not by themselves validate event-level flood volumes. Therefore, the MVP will use DMP information to ground the selected basin and hotspot context, while using a hand-built, clearly labeled illustrative network with eight candidate drains for the maintenance simulation. These model assets are not verified real drains. Describe impacts as simulated; do not claim a validated real-Delhi network or real flood prediction.

The old IIT Delhi GIS server cited in the report was checked over HTTP and HTTPS; both requests timed out. A separate OpenCity listing attributes a roughly 44 MB public-domain Barapulla drain KML to GSDL Delhi, but its listed download returned 404, and the production OpenCity catalog did not return a matching dataset. The listing is not evidence that the file is currently retrievable, and its contents could not be inspected. [OpenCity listing](https://staging.opencity.in/dataset/delhi-drains-maps)

The real-network pilot uses public City of Victoria, BC storm-drain GIS. Four source exports have been saved and audited, and a 15-main, 15-manhole, one-outfall extract was selected from catchment S61. This is a bounded real-GIS demonstration network, not a verified hydraulic model: one pipe slope is missing, the outfall elevation is missing, units and vertical datum need confirmation, and a cross-catchment link is excluded and documented as an external boundary. Applicable dataset reuse terms also need confirmation before redistribution. The City's map data are explicitly not authoritative for engineering. See the [Victoria source audit](.scratch/drainage-maintenance-prioritization/data/victoria-source-audit.md) and [ticket 04](.scratch/drainage-maintenance-prioritization/issues/04-qualify-public-victoria-network.md). Do not make calibrated or operational claims until inputs are qualified and the model is reviewed against appropriate observations.

The Delhi source review remains useful context for why the current demo is illustrative: the official public downloads checked did not include a ready-to-use georeferenced network or SWMM model. The old IIT Delhi GIS server cited in the report timed out, and a separate OpenCity listing's Barapullah KML download returned 404. These findings apply to the Delhi data path only; they do not describe the availability of the Victoria public GIS.

The current Delhi Irrigation and Flood Control Department download page lists a one-page drainage map and the Drainage Master Plan. The map labels itself indicative. The report identifies the Chirag Delhi drain as outfalling into the Barapullah drain, but this remains Delhi basin context, not the selected real-network pilot. See the [Barapullah source audit](.scratch/drainage-maintenance-prioritization/data/barapullah-source-audit.md) for the historical field-by-field review and data request.

Useful references:

- [Delhi Irrigation and Flood Control Department downloads](https://ifc.delhi.gov.in/doit-content/our-services)
- [IIT Delhi Drainage Master Plan report](https://ifc.delhi.gov.in/sites/default/files/inline-files/main_report_dmp_version51.pdf)

## Hydraulic and optimization approach

Hand-build an eight-drain connected network in EPA SWMM and place its illustrative assets within the selected DMP basin for geographic context. Document topology and hydraulic inputs as illustrative assumptions; do not imply they were extracted from DMP data. Give each candidate drain a fixed, documented blockage assumption. A cleaning action removes that assumed blockage for the planning window. Keep blockage assumptions constant across rainfall profiles. Model the same network state and rainfall profile with no cleaning and with each feasible cleaning set. Measure impact as the sum of modeled junction overflow volume across all junctions, with equal weights; do not present it as monetary loss, health cost, observed street flooding, or avoided damage.

Precompute SWMM outcomes for all feasible cleaning subsets of the eight illustrative candidate drains and all three rainfall profiles. For a crew limit of one to three, evaluate every subset with at most that many jobs, including the empty set (93 subsets per profile). Select the feasible subset with the least total modeled junction overflow; break ties by candidate asset ID. The dashboard can return this result quickly and deterministically. Compare it with a single-drain-benefit baseline: simulate each candidate cleaning action by itself for the selected profile, rank by overflow reduction, and select up to the crew limit from positive-benefit actions only. Report the empirical gap for this subset; do not claim a general optimality or approximation guarantee. These exhaustive results apply to the eight illustrative assets only. The separate Victoria S61 demonstration runs 576 feasible cleaning subsets per profile, but depends on unverified units and assumed runoff/blockage inputs; see the [S61 model notes](model/victoria-s61-model.md). Treat those outputs as uncalibrated simulations, not operational recommendations.

Cleaning changes flow capacity and can shift overflow upstream or downstream. This is hydraulic interaction, but it does **not** make the objective automatically submodular. In some cases actions may be complementary: clearing a downstream bottleneck can become more valuable after an upstream drain is cleared. Do not claim submodularity unless it is formally established for the exact objective and hydraulic model. Exhaustive subset evaluation is exact only for the small candidate set and modeled scenarios, not for a whole city or real-world flood outcomes.

Represent rainfall uncertainty with three documented profiles that state explicit depth and duration. Treat profiles as illustrative unless supported by a defensible local rainfall source. Show outcomes scenario by scenario and do not invent scenario probabilities or a combined expected result. Keep each drain's blockage assumption fixed across profiles and expose it beside results. Probabilistic blockage reports and field verification are outside the MVP.

## AWS implementation

Deploy the MVP on AWS. Build the dashboard as a React, TypeScript, and Vite single-page app; use MapLibre GL JS with GeoJSON for illustrative network assets and hotspot context. Host the static dashboard on Amplify.

- **EPA SWMM 5.2.4 command line:** run the model offline. Python scripts generate and execute the cases, then convert junction overflow and plan comparisons into JSON.
- **Amazon S3:** store source files, illustrative network data, map GeoJSON, and precomputed SWMM results. Organize result data by basin and rainfall profile, including all feasible plans up to each crew limit.
- **Amazon API Gateway HTTP API + Python AWS Lambda:** validate basin, rainfall profile, and crew limit; read the matching precomputed result from S3; and return the recommendation and baseline comparisons. Do not run SWMM in the live API.
- **AWS SAM:** define and deploy the API, Lambda, and S3 access configuration.

Do not add a database, Bedrock, or job queue to the MVP. The dashboard remains responsive because the API selects among already-computed, auditable results.

## Evaluation and demo acceptance

- The selected assets form valid cleaning actions in the chosen network subset.
- For every rainfall profile and crew limit, the recommendation is feasible and its displayed impact matches the corresponding SWMM result.
- The no-cleaning, single-drain-benefit baseline, and network-aware plans use the same rainfall inputs, blockage assumptions, and impact metric.
- The displayed recommendation is the lowest-overflow feasible subset with at most the crew limit, including the option to leave crews unused; ties are resolved by candidate asset ID.
- The baseline ranks single-drain overflow reductions and selects only positive-benefit actions, up to the same crew limit. Show where it differs from the network-aware plan, including cases where hydraulic spillover changes the result.
- For the initial simplified-network MVP, present DMP waterlogging locations as geographic context, not model validation. If usable real network data is later obtained, validate the baseline against observed reports; call it a plausibility check unless event-level data supports stronger validation.
- Every output is marked simulated and includes the scenario and key assumptions.

## Claims and scope

**Defensible claim:** The prototype links maintenance choices to system-wide simulated hydraulic outcomes under multiple rainfall scenarios and compares a network-aware plan with a simple ranking baseline.

**Do not claim:** guaranteed flood prevention; real-time citywide flood prediction; exact avoided losses; a generally submodular objective; a globally optimal citywide plan; or a calibrated/validated real-network result. The Delhi prototype is illustrative. The Victoria pilot uses real mapped assets, but still needs confirmed reuse terms, qualified model inputs, and independent review against appropriate observations before supporting hydraulic claims.

Existing research already studies drainage maintenance scheduling with limited crews and risk, and other work couples drainage optimization with SWMM. Frame novelty narrowly around the specific decision-support workflow, topology-aware cleaning scenarios, uncertainty presentation, and the Victoria S61 demonstration evaluation—not as the first drainage-maintenance optimizer.

References for positioning:

- [Bayesteh, Lu, and Lakshminarasimhan (2024), finite-crew municipal drainage maintenance planning](https://journals.vilniustech.lt/index.php/JCEM/article/view/21744?toggle_hypothesis=off)
- [Chen et al. (2017), risk-driven gully-pot maintenance and route optimization](https://www.sciencedirect.com/science/article/pii/S0377221716305641)
- [Example of SWMM-linked drainage risk optimization](https://www.tandfonline.com/doi/abs/10.1080/02626667.2022.2039661)
