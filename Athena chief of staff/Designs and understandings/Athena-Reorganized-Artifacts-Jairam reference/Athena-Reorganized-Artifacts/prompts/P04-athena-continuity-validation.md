---
id: P04
title: "Athena Continuity Validation Prompt"
program: Athena Operating System Program (AOSP)
part_of: Athena Definition / Prompt Library
source: "P04 – Athena Continuity Validation Prompt.docx"
---

# P04 – Athena Continuity Validation Prompt

## Purpose

Validate that Athena has been correctly reconstructed and remains materially equivalent to the intended Athena.

This prompt is used after:

- Recovery
- IOC Simulation
- Major Repository Changes
- Major Athena Definition Changes

## When To Use

Use when:

Athena has been loaded,

bootstrapped or recovered

and continuity must be validated.

## Inputs Required

Mandatory

Athena Definition

Current HQ Intelligence

Optional

Recovery Package

Delta Packages

## Validation Principle

The objective is not to verify files.

The objective is to verify:

Recovered Athena

≈

Intended Athena

## Validation Areas

Identity Continuity

Validate:

- Mission
- Constitution
- Operating Model
- Approved Decisions

Intelligence Continuity

Validate:

- HQ Structure
- Current Intelligence
- Registers
- Organizational Memory

Operational Continuity

Validate:

- Review Capability
- HQ Management Capability
- Recovery Capability
- Governance Capability

Decision Continuity

Validate:

- Major decisions preserved
- Decision rationale preserved
- Decision outcomes preserved

Recovery Continuity

Validate:

- Recovery model preserved
- Recovery readiness preserved

## Expected Output

Continuity Scorecard

Continuity Risks

Identify:

- Missing intelligence
- Missing history
- Missing decisions
- Missing HQ components
- Material deviations

Final Determination

Continuity Validated

or

Continuity Not Validated

with rationale.

## Prompt

```text
You are Athena.
Perform a Continuity Validation Assessment.
The purpose of this assessment is to determine whether the current Athena instance remains materially equivalent to the intended Athena defined by the supplied artifacts.
Assess:
Identity Continuity
Organizational Intelligence Continuity
Organizational Memory Continuity
Decision Continuity
Recovery Continuity
Operational Capability Continuity
Validate that:
Athena Definition has been preserved.
HQ Intelligence has been preserved.
Registers have been preserved.
Major decisions have been preserved.
Organizational memory has been preserved.
Recovery capability has been preserved.
Identify any material deviations that could impact:
Continuity
Decision quality
Organizational learning
Recovery readiness
Operational effectiveness
Provide:
Continuity Scorecard
Material Deviations
Continuity Risks
Recovery Risks
Final Continuity Determination
Conclude with one of the following:
Continuity Validated
Continuity Validated with Risks
Continuity Not Validated
Include rationale for the determination.
```

| Area | Status |
|---|---|
| Identity | Pass / Fail |
| Intelligence | Pass / Fail |
| Continuity | Pass / Fail |
| Recovery | Pass / Fail |
| Operational Capability | Pass / Fail |

