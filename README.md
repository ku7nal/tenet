# Tenet dispatcher

Tenet helps a municipal dispatcher compare drain-cleaning choices under limited crew capacity. It opens on the Victoria S61 pilot: a mapped City GIS network with a separate, uncalibrated hydraulic comparison for 15 gravity mains. The Delhi/Barapullah scenario remains an illustrative network.

For the Environmental Hacks submission, see the [project writeup and video outline](docs/environmental-hacks-submission.md).

## Run locally

1. Install Node.js and the EPA SWMM command-line engine.
2. Generate all 93 feasible cleaning sets for each rainfall profile (279 SWMM runs):

   ```sh
   python3 model/build_scenarios.py --swmm /path/to/swmm
   ```

   Or set `SWMM_BIN` to the executable path and omit `--swmm`.
3. To generate the Victoria S61 demonstration scenarios as well, run:

   ```sh
   python3 model/build_victoria_scenarios.py --swmm /path/to/runswmm
   ```

   This evaluates 576 feasible cleaning sets for each of the three profiles and writes results under `.generated/deploy/victoria-s61/`. Its source units, rainfall, runoff and cleaning assumptions are documented in [model notes](model/victoria-s61-model.md). These are uncalibrated simulations, not engineering recommendations.
4. Start the API in one terminal:

   ```sh
   python3 backend/dev_server.py
   ```

5. Start the dashboard in another terminal:

   ```sh
   npm install
   npm run dev
   ```

The generated result bundle is local and ignored by git. The browser shows an explicit error until the SWMM generation step succeeds. Results are selected by rainfall profile and crew limit; profiles are not combined using assumed probabilities.

## Deploy on AWS

The SAM template deploys the HTTP API, Lambda, and a private S3 bucket. Amplify Hosting deploys the static dashboard separately. The API is public and read-only; it accepts the fixed Barapullah or Victoria S61 basin, three supported rainfall profiles, and crew limits from one to three. The City of Victoria Open Government Licence permits reuse of covered information for lawful purposes with attribution. The source service has no separate layer copyright text, so confirm the layers are covered by that licence and contain no third-party material before redistributing them.

1. Generate the scenarios as above. This also writes one deployable JSON file per profile under `.generated/deploy/barapullah/`.
2. Install and configure the AWS CLI and AWS SAM CLI for an account with permission to create the SAM stack, then run:

   ```sh
   sam build
   sam deploy --guided
   ```

   Use `tenet-dispatcher` as the stack name. The stack outputs the API base URL and results bucket name.
3. Upload the precomputed profile files to the private results bucket:

   ```sh
   RESULTS_BUCKET=$(aws cloudformation describe-stacks --stack-name tenet-dispatcher --query "Stacks[0].Outputs[?OutputKey=='ScenarioResultsBucketName'].OutputValue" --output text)
   aws s3 sync .generated/deploy "s3://$RESULTS_BUCKET"
   ```

4. In the Amplify console, connect the repository and branch for Hosting. Amplify uses `amplify.yml`. Add the `VITE_API_BASE_URL` environment variable with the stack's `ApiBaseUrl` output, then redeploy the branch.

The dashboard build is static; SWMM runs only during local preprocessing. The API role can read only objects under `barapullah/` and `victoria-s61/`, and the S3 bucket blocks public access. The API endpoint itself is public, so anyone can request the precomputed results. AWS deployment can incur charges; review the services and account settings before deploying. Deleting or replacing the SAM stack retains the results bucket to protect uploaded scenario data.

## Model assumptions

- The profiles are uniform rainfall over two hours: moderate 20 mm, heavy 40 mm, and extreme 80 mm. They are illustrative, not local design storms.
- The eight candidate conduits form a hand-built serial network. Each assumes 40% blockage by cross-sectional area; cleaning restores its full illustrative diameter.
- Network geometry is schematic, not georeferenced. The DMP report's 330 traffic-police-reported waterlogging segments are citywide context and are not plotted or mapped to the model junctions.
- Results are model simulations only. They are not flood predictions or avoided-damage estimates.
- Victoria S61 uses 15 City GIS gravity mains, 15 manholes, and one outfall. Its source units and vertical datum are unverified; runoff, rainfall, blockage, and outfall assumptions are not calibrated against observations. S61 output is separate from Barapullah and is not an operational recommendation. See [data attribution and licence](public/data/victoria/ATTRIBUTION.md).
- The Victoria map shows all saved citywide City GIS gravity mains, manholes, and outfalls; paths and nodes can be selected to inspect source attributes. Only the 15-main S61 subset has precomputed SWMM comparisons. Rebuild the map asset from saved source exports with `python3 model/build_victoria_city_map.py`.
- The map's draft citywide roster accepts up to the eligible active City-owned storm gravity-main count. It assigns one main per crew by recorded City GIS `ImportanceFactor` (High, Medium, Low, then unrated), with asset ID as a stable tie-breaker. This is inventory allocation only, not condition-based cleaning urgency or a hydraulic/flood-reduction recommendation. The separate S61 SWMM crew limit remains one to three.
- A preliminary Victoria evidence review identifies ECCC rainfall records and documents why no event comparison or expert review is claimed yet. See [the review](public/victoria-s61-review.md).
