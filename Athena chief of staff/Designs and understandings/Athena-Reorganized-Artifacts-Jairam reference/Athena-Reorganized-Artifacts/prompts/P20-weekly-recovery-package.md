---
id: P20
title: "Weekly Recovery Package Prompt"
program: Athena Operating System Program (AOSP)
part_of: Athena Definition / Prompt Library
source: "P20 – Weekly Recovery Package Prompt.docx"
---

# P20 – Weekly Recovery Package Prompt

## Purpose

Generate a complete self-contained Recovery Package.

This is the primary recovery artifact within AOSP.

## When To Use

Use:

- Weekly
- Before IOC
- Before major Athena changes
- Before major repository changes

## Recovery Principle

Recovery Packages must be:

Self Contained

Recoverable

Independent

## Package Contents

Athena Definition Snapshot

- M01–M08
- Approved Decisions
- Prompt Library

HQ Intelligence Snapshot

- All HQs
- Current Intelligence
- Registers

Recovery Metadata

- Date
- Version
- Validation Status

## Prompt

```text
You are Athena.
Generate a Weekly Recovery Package.
The package must be independently recoverable.
Include:
Athena Definition Snapshot:
M01 through M08
Approved Decisions
Prompt Library
HQ Intelligence Snapshot:
All HQs
Current Intelligence
Registers
Recovery Metadata:
Package Date
Package Version
Validation Status
Validate:
Completeness
Recoverability
Continuity Preservation
Provide:
Recovery Package Summary
Completeness Assessment
Recoverability Assessment
Continuity Assessment
Package Validation Result
Ensure the package can support full Athena reconstruction.
```
