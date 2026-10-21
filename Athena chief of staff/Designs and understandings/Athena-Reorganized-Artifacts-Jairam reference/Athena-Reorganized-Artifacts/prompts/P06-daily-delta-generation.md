---
id: P06
title: "Daily Delta Generation Prompt"
program: Athena Operating System Program (AOSP)
part_of: Athena Definition / Prompt Library
source: "P06 – Daily Delta Generation Prompt.docx"
---

# P06 – Daily Delta Generation Prompt

## Purpose

Generate a Delta Package containing all material changes since the previous Delta Package or Recovery Package.

Delta Packages are the primary mechanism for preserving changes between Recovery Packages.

## When To Use

Use:

- Daily
- After significant organizational changes
- Before major reviews (optional)
- Before Recovery Package generation (optional)

## Inputs Required

Mandatory

Current HQ Intelligence

Optional

Previous Delta Package

Latest Recovery Package

## Delta Principle

A Delta Package contains:

What Changed

Not:

Current State

Current State belongs to HQ Intelligence.

## Include In Delta

HQ Changes

- New work items
- Completed work items
- Priority changes
- Status changes

Risk Changes

- New risks
- Closed risks
- Severity changes

Opportunity Changes

- New opportunities
- Closed opportunities
- Priority changes

Decision Changes

- New decisions
- Decision status changes

Stakeholder Changes

- New stakeholders
- Material stakeholder intelligence updates

Register Changes

- New register entries
- Updated register entries

Artifact Changes

- New artifacts
- Modified artifacts
- Approved artifacts

## Exclude From Delta

Do not repeat unchanged intelligence.

## Expected Output

Delta Summary

Delta Package

Structured list of all material changes.

Recovery Impact

Identify whether the changes materially affect:

- Continuity
- Recovery
- IOC Readiness

## Prompt

```text
You are Athena.
Generate a Delta Package representing all material organizational intelligence changes since the previous Delta Package or Recovery Package.
A Delta Package shall contain changes only.
Do not reproduce unchanged intelligence.
Assess:
HQ changes
Risk changes
Opportunity changes
Decision changes
Stakeholder intelligence changes
Register changes
Artifact changes
Capture all material updates required to reconstruct the current organizational state when applied to a Recovery Package.
Provide:
Delta Summary
HQ Changes
Risk Changes
Opportunity Changes
Decision Changes
Stakeholder Intelligence Changes
Register Changes
Artifact Changes
Recovery Impact Assessment
Ensure the Delta Package is sufficient to support Athena recovery and continuity preservation.
```

| Area | Changes |
|---|---|
| HQ Updates | Count |
| Risks | Count |
| Opportunities | Count |
| Decisions | Count |
| Registers | Count |
| Artifacts | Count |

