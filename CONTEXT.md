# Drainage Maintenance Prioritization

This context describes the terms used in the Tenet drainage maintenance decision-support MVP.

## Language

**Candidate drain**:
An illustrative drain in the modeled network that is eligible for one cleaning job.
_Avoid_: Verified drain, real drain

**Cleaning action**:
Removal of a candidate drain's fixed blockage assumption for the planning window.
_Avoid_: Repair, maintenance action

**Planning window**:
The period in which each available crew can complete at most one cleaning job; selected jobs are assumed complete before modeled rainfall begins.
_Avoid_: Storm duration

**Rainfall profile**:
A documented rainfall depth and time pattern used as one modeled scenario.
_Avoid_: Forecast, probability-weighted scenario

**Modeled junction overflow volume**:
The volume the hydraulic simulation reports overflowing at modeled junctions for one rainfall profile, summed across all modeled junctions with equal weight.
_Avoid_: Flood damage, avoided losses, observed flood volume
