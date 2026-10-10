# Tenet dispatcher

This local dispatcher slice compares moderate, heavy, and extreme illustrative rainfall profiles and crew limits of one to three for the Barapullah basin context.

## Run locally

1. Install Node.js and the EPA SWMM command-line engine.
2. Generate all 93 feasible cleaning sets for each rainfall profile (279 SWMM runs):

   ```sh
   python3 model/build_scenarios.py --swmm /path/to/swmm
   ```

   Or set `SWMM_BIN` to the executable path and omit `--swmm`.
3. Start the API in one terminal:

   ```sh
   python3 backend/dev_server.py
   ```

4. Start the dashboard in another terminal:

   ```sh
   npm install
   npm run dev
   ```

The generated result bundle is local and ignored by git. The browser shows an explicit error until the SWMM generation step succeeds. Results are selected by rainfall profile and crew limit; profiles are not combined using assumed probabilities.

## Deploy on AWS

The SAM template deploys the HTTP API, Lambda, and a private S3 bucket. Amplify Hosting deploys the static dashboard separately. The API is public and read-only; it only accepts the fixed Barapullah basin, three supported rainfall profiles, and crew limits from one to three.

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

The dashboard build is static; SWMM runs only during local preprocessing. The API role can read only objects under `barapullah/`, and the S3 bucket blocks public access. The API endpoint itself is public, so anyone can request the precomputed results. AWS deployment can incur charges; review the services and account settings before deploying. Deleting the SAM stack retains the results bucket to protect uploaded scenario data.

## Model assumptions

- The profiles are uniform rainfall over two hours: moderate 20 mm, heavy 40 mm, and extreme 80 mm. They are illustrative, not local design storms.
- The eight candidate conduits form a hand-built serial network. Each assumes 40% blockage by cross-sectional area; cleaning restores its full illustrative diameter.
- Network geometry is schematic, not georeferenced. The DMP report's 330 traffic-police-reported waterlogging segments are citywide context and are not plotted or mapped to the model junctions.
- Results are model simulations only. They are not flood predictions or avoided-damage estimates.
