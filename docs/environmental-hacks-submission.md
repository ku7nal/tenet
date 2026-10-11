# Environmental Hacks submission draft

## Project

**Tenet — drainage maintenance planning**  
**Track:** Heat and Water

## Problem

Municipal drainage teams have limited time and crews to inspect or clean drains before heavy rain. A map shows where infrastructure is, but it does not show how different cleaning choices might affect a connected network.

## What Tenet demonstrates

Tenet lets a dispatcher choose a rainfall scenario and crew limit, then compare no cleaning, a single-drain baseline, and a network-aware cleaning plan. The Victoria S61 pilot displays the selected source GIS assets on an interactive city map and highlights the modeled cleaning choice.

The comparison is a demonstration of a planning workflow, not an operational instruction. It uses 15 mains and explicit assumptions for rainfall, blockage, runoff, source units, and outfall conditions. Results are uncalibrated and do not establish real-world flood reduction. The citywide map is context; hydraulic recommendations apply only to S61.

## How it is built

- React, TypeScript, and Vite serve the interactive dashboard on AWS Amplify Hosting.
- Python preprocessing runs EPA SWMM offline and writes precomputed scenario results.
- API Gateway HTTP API and Python Lambda validate a scenario request and read the matching JSON from a private S3 bucket. SWMM does not run in the live API.
- City GIS is displayed as GeoJSON over OpenStreetMap tiles. The public map identifies the City of Victoria as the GIS source and OpenStreetMap contributors for the basemap.

## Three-minute demo outline

Target length: **2:45**. Record the deployed app; the event judges the video rather than a live demo.

| Time | Show and explain |
| --- | --- |
| 0:00–0:20 | State the problem: dispatchers need to choose where limited cleaning crews can work before rain. |
| 0:20–0:40 | Select Victoria S61 and explain that the city map is real GIS while the modeled pilot is a small subset. |
| 0:40–1:05 | Keep the heavy rainfall profile and one modeled job; point out the scenario assumptions. |
| 1:05–1:35 | Compare no cleaning, the single-drain baseline, and the network-aware plan by modeled junction overflow. |
| 1:35–1:55 | Select the recommended S61 main and show its location and source attributes on the map. |
| 1:55–2:15 | Change crew count or rainfall and show the selected plan and results update. |
| 2:15–2:35 | Explain AWS: Amplify serves the app; API Gateway and Lambda select precomputed results from private S3. |
| 2:35–2:45 | State the limit clearly: these are uncalibrated scenario results, not flood predictions or verified maintenance advice. |

## Before submission

- Confirm that the public repository contains the source shown in the video and opens while signed out.
- Check that the YouTube video is public or unlisted, stays under three minutes, and opens while signed out.
- Include the problem, what was built, and where AWS is used in the submission form.
- Credit all source data, map tiles, libraries, and AI tools used by the team. The City Open Government Licence allows reuse of covered information for lawful purposes with attribution. Use its required attribution, and confirm the snapshot layers are City information covered by that licence because third-party rights are excluded.
- The project work must have started during the hackathon. The visible Git history begins October 10, 2026; do not alter history to obscure when work began.

**AI development tools:** OpenAI Codex assisted with planning, code, and this writeup. Add any other tools used by the team before submitting.
