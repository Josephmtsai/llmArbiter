---
name: "SDLC: Status"
description: Check the current phase and retry count of a feature in the SDLC pipeline without executing any agents
category: Workflow
tags: [workflow, sdlc, status]
---

Use the **sdlc-workflow** skill in status-only mode.

The argument after `/sdlc:status` is the feature name (kebab-case).
If omitted, the skill will ask.

Run in read-only mode — do not spawn any agents, only report the current pipeline state.
