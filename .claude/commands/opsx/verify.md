---
description: Verify implementation against specs and AC - produce PASS/FAIL verdict
---

Verify implementation against OpenSpec specs and Acceptance Criteria, then produce a structured PASS/FAIL report.

**Input**: Change name after `/opsx:verify` (e.g., `/opsx:verify add-restart-tool`).
If omitted, run `openspec list --json` and prompt for selection.

---

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise run `openspec list --json` and use **AskUserQuestion** to let the user select.

   Announce: "Verifying change: <name>"

2. **Check status**
   ```bash
   openspec status --change "<name>" --json
   ```
   Confirm the change exists and tasks artifact is present. If `/opsx:apply` has not been run, warn the user.

3. **Read verification sources**

   Read ALL of the following:
   - `openspec/changes/<name>/tasks.md` → extract every Acceptance Criteria item
   - `openspec/changes/<name>/specs/` → delta specs (if any)
   - Corresponding main specs at `openspec/specs/<capability>/spec.md`

4. **Verify each AC item**

   For each AC in `tasks.md`:
   - Read relevant implementation files (Glob / Grep / Read)
   - Determine result: **PASS** / **FAIL** / **PARTIAL**
   - Record concrete evidence: file path + line number

5. **Compare delta specs vs main specs** (if delta specs exist)

   Check that implementation matches what was designed in `openspec/changes/<name>/specs/`.
   Mark spec compliance: PASS / FAIL + list any divergences.

6. **Run tests**
   ```bash
   uv run pytest tests/ -v --cov=src --cov-report=term-missing
   ```
   Record: total tests, passed, failed, coverage %.

7. **Produce verification report**

   Output the report in this format:

   ```markdown
   ## Verification Report
   **Change**: <name>
   **Date**: <YYYY-MM-DD>
   **Verdict**: PASS / FAIL / PASS_WITH_WARNINGS

   ## AC Checklist
   | # | Acceptance Criteria | Result | Evidence |
   |---|---------------------|--------|----------|
   | 1 | <AC text> | PASS | src/services/analyzer.py:87 |
   | 2 | <AC text> | FAIL | Not found — see issues below |

   ## Spec Compliance
   PASS / FAIL — <summary of any divergences>

   ## Test Results
   Coverage: <N>% | Tests: <N> passed, <N> failed

   ## Issues Found
   | # | Severity | Description | Location |
   |---|----------|-------------|----------|
   | 1 | Critical | <issue> | src/...:line |

   ## Verdict
   PASS     → safe to run /opsx:archive
   FAIL     → returning to developer — blocking issues listed above
   ```

8. **Report to orchestrator**
   - **PASS** or **PASS_WITH_WARNINGS**: "Verification passed. Safe to run `/opsx:archive <name>`."
   - **FAIL**: "Verification failed. Returning to developer." + list blocking issues.

---

**Guardrails**
- Only READ files — never modify `src/` or any business logic
- FAIL must include specific file path + line number evidence
- If a test fails due to infrastructure (DB not initialized, missing env var), fix the infra issue before re-running — do not mark as FAIL due to environment setup
- If AC is ambiguous, mark as PARTIAL and note what was unclear
- Do not auto-archive — only report verdict
