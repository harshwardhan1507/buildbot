# Update BuildLab Timeline — Registration Closes 08 October Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the BuildLab '26 schedule to align with the single major early registration + PRD deadline on 08 October, implement phase detection, update `/status` and reminder service copy, and eliminate all references to outdated dates.

**Architecture:**
- Modernize `src/config/events.js` with the clean 4-milestone timeline (`kickoff_registration`, `registration_prd_close`, `midpoint_checkin`, `final_submission`) and a robust `getCurrentPhase(date)` detector covering all specified intervals.
- Enhance `src/commands/status.js` to be phase-oriented for both participant views (with and without PRD) and staff overview.
- Overhaul `src/services/reminders.js` with exact milestone triggers and specified announcement copy (Registration Closing, Midpoint Check-in, Final Submission) without build phase spam.
- Add comprehensive test coverage in `tests/test-suite.js` validating date logic across all 10 key boundary dates (06, 07, 08, 09, 15, 16, 17, 22, 23, 24 Oct) and verify full test suite passes.

**Tech Stack:** Node.js (CommonJS), Discord.js v14, better-sqlite3

## Global Constraints
- Registration closes: `08 OCTOBER 2026, 11:59 PM` (IST: `+05:30`).
- Combined early deadline: `REGISTRATION + PRD CLOSES 08 OCT` (never split into separate registration and PRD events).
- Midpoint check-in: `16 OCTOBER 2026` is a progress check-in, NOT a formal submission deadline.
- Final submission & conclusion: `23 OCTOBER 2026`.
- Remove all references to 01 Oct kickoff, 04 Oct track selection, 08 Oct separate PRD, 15 Oct formal review, 22 Oct submission, 24 Oct Demo Day, and 25 Oct Closing & Results.
- Do NOT invent Demo Day, results ceremony, closing ceremony, or separate judging dates.

---

### Task 1: Update Timeline & Phase Detection in `src/config/events.js`

**Files:**
- Modify: `src/config/events.js`
- Test: `tests/test-suite.js`

**Interfaces:**
- Consumes: JavaScript `Date` and ISO 8601 strings in IST (`+05:30`).
- Produces:
  - `timeline`: Array of 4 milestones (`kickoff_registration`, `registration_prd_close`, `midpoint_checkin`, `final_submission`).
  - `getTimeRemaining(targetDate, fromDate?)`: calculates diff, format, and past status.
  - `getCurrentPhase(date?)`: returns `{ phaseKey, phaseName, nextLabel, nextValue, description }` for dates across the program.
  - `ANNOUNCEMENTS`: Object containing verbatim announcement copy templates for registration, registration closing, build phase, midpoint, and final submission.

- [ ] **Step 1: Write tests for `src/config/events.js` boundary date logic**

Add tests to `tests/test-suite.js` asserting `getCurrentPhase(date)` returns expected phase and next milestone for:
- 06 Oct: `REGISTRATION + PRD`, `NEXT DEADLINE`, `08 OCT · 11:59 PM`
- 07 Oct: `REGISTRATION + PRD`, `NEXT DEADLINE`, `08 OCT · 11:59 PM`
- 08 Oct: `REGISTRATION + PRD`, `NEXT DEADLINE`, `08 OCT · 11:59 PM`
- 09 Oct: `BUILD PHASE I`, `NEXT CHECKPOINT`, `16 OCT · MIDPOINT CHECK-IN`
- 15 Oct: `BUILD PHASE I`, `NEXT CHECKPOINT`, `16 OCT · MIDPOINT CHECK-IN`
- 16 Oct: `MIDPOINT CHECK-IN`, `NEXT CHECKPOINT` or `FINAL SUBMISSION`, `23 OCT`
- 17 Oct: `FINAL BUILD + POLISH`, `FINAL SUBMISSION`, `23 OCT`
- 22 Oct: `FINAL BUILD + POLISH`, `FINAL SUBMISSION`, `23 OCT`
- 23 Oct: `FINAL SUBMISSION / PROGRAM CONCLUSION`, `FINAL SUBMISSION`, `TODAY · 11:59 PM`
- 24 Oct: `PROGRAM COMPLETED`, `null`, `null`

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-suite.js`
Expected: FAIL due to missing `getCurrentPhase` in `src/config/events.js`.

- [ ] **Step 3: Implement new timeline, phase detector, and announcement copy in `src/config/events.js`**

Implement `timeline`, `getCurrentPhase()`, `getTimeRemaining()`, and `ANNOUNCEMENTS` in `src/config/events.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-suite.js`
Expected: PASS for phase detection tests.

---

### Task 2: Phase-Oriented Status Command in `src/commands/status.js`

**Files:**
- Modify: `src/commands/status.js`
- Test: `tests/test-suite.js`

**Interfaces:**
- Consumes: `getCurrentPhase`, `timeline`, `getTimeRemaining` from `src/config/events.js`.
- Produces:
  - Participant embed with `CURRENT PHASE` and `NEXT DEADLINE / CHECKPOINT / FINAL SUBMISSION` fields.
  - Works for users with no PRD submitted as well as users with submitted PRDs.
  - Staff dashboard showing `CURRENT PHASE` and updated countdowns.

- [ ] **Step 1: Update `src/commands/status.js` to render phase-oriented sections**

Add `getCurrentPhase()` to both the participant status view and the staff dashboard view.
For participant status:
- Include `CURRENT PHASE` (e.g. `REGISTRATION + PRD`)
- Include `NEXT DEADLINE` or `NEXT CHECKPOINT` or `FINAL SUBMISSION` (e.g. `08 OCT · 11:59 PM`)
For participant with no PRD:
- Display current phase and registration deadline prominently alongside instructions.
For staff dashboard:
- Display active phase and updated timeline countdowns.

- [ ] **Step 2: Run tests to verify status command passes**

Run: `node tests/test-suite.js`
Expected: PASS for all `/status` assertions.

---

### Task 3: Automated Reminders & Announcement Copy in `src/services/reminders.js` & `src/commands/reminders.js`

**Files:**
- Modify: `src/services/reminders.js`
- Modify: `src/commands/reminders.js`
- Test: `tests/test-suite.js`

**Interfaces:**
- Consumes: `timeline`, `getTimeRemaining`, `ANNOUNCEMENTS` from `src/config/events.js`.
- Produces:
  - Non-spam automated reminders matching prompt requirements:
    - `registration_prd_close`: 1 reminder before (1 day remaining / 07 Oct), 1 reminder on deadline day (08 Oct).
    - `midpoint_checkin`: 1 reminder on checkpoint day (16 Oct).
    - `final_submission`: 1 reminder before (1 day remaining / 22 Oct), 1 reminder on final submission day (23 Oct).
  - Verbatim embed copy for all reminders.
  - `/reminders status` reflects accurate milestone frequencies.

- [ ] **Step 1: Update `src/services/reminders.js` and `src/commands/reminders.js`**

Implement the milestone logic and announcement templates.

- [ ] **Step 2: Add reminder dispatch unit test in `tests/test-suite.js`**

Test that reminder milestones fire properly for 1-day-before and day-of deadlines with new copy.

- [ ] **Step 3: Run test suite**

Run: `node tests/test-suite.js`
Expected: PASS.

---

### Task 4: Clean Up Outdated Timeline References & Full Workspace Verification

**Files:**
- Audit & clean: `src/config/events.js`, `src/commands/status.js`, `src/services/reminders.js`, `src/commands/reminders.js`, `guide.js`, `src/commands/help.js`
- Test: `tests/test-suite.js`, `tests/live-verify.js`

- [ ] **Step 1: Audit all project files for any remnant dates (Oct 1, 4, 15, 22, 24, 25)**

Perform grep searches to guarantee zero outdated date references remain.

- [ ] **Step 2: Run complete test suite and live-verify test**

Run:
`npm test`
`node tests/live-verify.js`
Expected: 100% PASS with clean output.
