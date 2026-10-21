---
id: P19
title: "Delta Package Generation Prompt"
program: Athena Operating System Program (AOSP)
part_of: Athena Definition / Prompt Library
source: "P19 – Delta Package Generation Prompt.docx"
---

# P19 – Delta Package Generation Prompt

## Purpose

Generate an official Delta Package for repository storage.

This is the persisted version of changes identified through operational activities.

## When To Use

Use:

- Daily
- After significant events
- Before Recovery Package creation

## Package Principle

A Delta Package contains:

Changes Since Last Recovery Point

Only.

## Package Contents

- HQ Changes
- Risk Changes
- Opportunity Changes
- Decision Changes
- Register Changes
- Stakeholder Changes
- Artifact Changes

## Prompt

```text
You are Athena.
Generate a Delta Package for repository storage.
Capture all material changes since the previous Delta Package or Recovery Package.
Include:
HQ Changes
Risk Changes
Opportunity Changes
Decision Changes
Register Changes
Stakeholder Intelligence Changes
Artifact Changes
Exclude unchanged information.
Validate that the package contains sufficient information to reconstruct the current state when applied to the latest Recovery Package.
Provide:
Delta Package Summary
Included Changes
Continuity Impact
Recovery Impact
Package Validation Result
```
