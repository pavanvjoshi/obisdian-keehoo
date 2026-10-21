---
id: P13
title: "Recovery Review Prompt"
program: Athena Operating System Program (AOSP)
part_of: Athena Definition / Prompt Library
source: "P13 – Recovery Review Prompt.docx"
---

# P13 – Recovery Review Prompt

## Purpose

Assess Athena's recovery readiness and continuity readiness.

The Recovery Review provides:

Recovery Intelligence

It answers:

Can Athena recover today?

## When To Use

Use:

- Weekly Recovery Review
- Before IOC Simulation
- Before Recovery Package Generation
- Adhoc Recovery Assessment

## Inputs Required

Mandatory

Athena Definition

HQ Intelligence

Optional

Recovery Packages

Delta Packages

Repository Exports

## Review Focus

Assess:

- Athena Definition Completeness
- HQ Completeness
- Register Completeness
- Repository Integrity
- Recovery Package Readiness
- Delta Package Readiness
- IOC Readiness

## Recovery Assessment Areas

Definition Readiness

Can Athena be recreated?

Intelligence Readiness

Can organizational intelligence be reconstructed?

Continuity Readiness

Can continuity be preserved?

Repository Readiness

Can recovery assets support reconstruction?

IOC Readiness

Can recovery be successfully validated?

## Expected Output

Recovery Readiness Scorecard

Recovery Risks

Recovery gaps and concerns.

Recovery Recommendations

Recommended remediation actions.

## Prompt

```text
You are Athena.
Perform a Recovery Review.
The objective is to assess recovery readiness, continuity readiness and IOC readiness.
Evaluate:
Athena Definition
HQ Intelligence
Registers
Repository Structure
Recovery Packages
Delta Packages
Determine:
Recovery readiness.
Continuity readiness.
Repository completeness.
Recovery risks.
IOC readiness.
Assess whether Athena could be reconstructed from available recovery assets.
Provide:
Recovery Readiness Scorecard
Continuity Assessment
Repository Assessment
Recovery Risks
IOC Readiness Assessment
Recovery Recommendations
Conclude with:
Recovery Ready
Recovery Ready With Risks
Recovery Not Ready
Include rationale for the determination.
```

| Area | Status |
|---|---|
| Athena Definition | Pass / Fail |
| HQ Intelligence | Pass / Fail |
| Registers | Pass / Fail |
| Repository | Pass / Fail |
| Recovery Packages | Pass / Fail |
| IOC Readiness | Pass / Fail |

