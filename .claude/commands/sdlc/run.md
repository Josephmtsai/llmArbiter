---
name: "SDLC: Run"
description: Start or resume the Gated SDLC pipeline for a feature (SA → Human Gate → Developer → codex-reviewer → QA)
category: Workflow
tags: [workflow, sdlc, pipeline]
---

Use the **sdlc-workflow** skill to start or resume the SDLC pipeline.

The argument after `/sdlc:run` is the feature name (kebab-case), e.g. `007-structured-logging`.
If omitted, the skill will ask.
