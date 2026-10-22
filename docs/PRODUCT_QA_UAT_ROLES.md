# Product quality and real-user acceptance — six accountable roles

Applies to websites, Android and VK Mini Apps, WebGL games, 3D products and AI-driven services. Read this alongside `AGENTS.md` and applicable security/design/privacy instructions. A role below is a **review responsibility**, not proof that a separate person or model was hired or that a test happened.

## 1. QA engineer / tester
- Inspect requirements, edge cases, state transitions, data preservation, accessibility, error behavior, crash reports and realistic device/browser compatibility.
- Test unit/integration/E2E, installation and startup, offline/online transitions where relevant, security regressions, exports/imports, locale, display scaling and screen orientation.
- File defects with exact repro steps, environment, expected/actual, severity, evidence and affected commit; retest after the fix.
- Deliver: test plan, executable checks, defect register, run artifacts and PASS/FAIL/NOT RUN summary. Never equate build PASS with release readiness.

## 2. UX/UI designer / design QA
- Evaluate flows, understandable text, navigation, visual hierarchy, typography, icon clarity, contrast, touch target sizes, feedback, animation and reduced-motion support.
- Compare **actual rendered** screens with user-approved reference at appropriate viewport and density. Record measured differences and mobile safe-area issues.
- Deliver: reference-to-implementation comparison, screenshots, identified defects and changes in real UI source (not a flat reference image).
- Gate: no blocking usability failures, unreadable copy, clipped content or missing critical action states.

## 3. Developer / self-reviewer
- Reproduce every critical failure; identify root cause rather than hiding it; patch source and add a regression test.
- Inspect exceptions, dependency/cross-platform differences, data loss risk, signing/upgrade compatibility, storage and security boundaries.
- Run the affected tests after each fix and preserve logs, changed files and exact commit.
- Gate: zero knowingly unresolved crashes or silent data loss in claimed supported scenarios; explicitly list untested edge cases.

## 4. Product manager / producer
- Convert the business goal into acceptance criteria: users, supported devices, key journeys, expected outcomes, excluded features, performance targets and release risks.
- Maintain priorities and a go/no-go review distinct from CI status. Match actual functionality to promised features, versions and screenshots.
- Deliver: acceptance matrix, issue severity decisions, measured KPIs where data exist and release checklist; don't invent conversion/retention/revenue numbers.

## 5. Business customer / product owner
- Validate the implemented product against the original requested reference, use case and required business behavior.
- Only an **actual authorized stakeholder** can give UAT acceptance/rejection and consent for rollout; an AI cannot impersonate the product owner or fill in approval.
- Deliver: dated approval or tracked rejection with necessary changes. Before actual input: **NOT APPROVED**, not PASS.

## 6. Real users: alpha, beta and UAT
- Recruit **opt-in** testers on representative real devices. Test first-launch, daily tasks, uncommon actions, backups/restore, accessibility and stability in their own conditions.
- Gather voluntary, privacy-safe feedback and anonymized reproduction details; use clear consent for diagnostics.
- Deliver: device/OS version, scenario, outcome, observed usability blockers and quotes only with permission. Do not invent tester counts, bug reports or feedback.
- Gate: **NOT RUN** until actual consenting users have tested the candidate; simulator/browser tests cannot substitute for user testing.

## Mandatory quality pipeline

1. **Before coding:** inspect source, baseline reference, constraints, existing tests and real data; record acceptance cases.
2. **During coding:** apply visual and functional self-review; implement smallest coherent fix plus regression coverage.
3. **CI:** unit, validation, build and safe security checks; where supported run UI/browser/E2E and Android emulator or game engine playtest, and save logs/screenshots/artifacts.
4. **Manual readiness:** check navigation, touch ergonomics, back/forward behavior, account/data lifetime, migration, errors, clear offline behavior and visual alignment against reference; label any skipped checks NOT RUN.
5. **Physical-device matrix:** include representative screen sizes and supported Android versions (or browser/desktop platforms); only mark PASS if actually executed, with observed device and log.
6. **UAT / product-owner review:** present candidate and clear acceptance checklist, collect stakeholder/user feedback when they actually participate; do not substitute assistant approval.
7. **Release gate:** no critical data-loss/security defect, evidence-backed supported-platform checks, documented residual risks, signed artifact, correct policies and real approval for store/publication.
8. **Reporting:** actual changed files, commits, tests, PASS/FAIL/NOT RUN, defects, risks and **next executable step**. Save a checkpoint for unfinished work.

## Lightweight acceptance matrix

| Area | Typical check | Automation | Human acceptance |
|---|---|---|---|
| Core functionality | Scenario works and saves data | Unit/E2E where feasible | User confirms it solves task |
| Visual fidelity | Actual screenshots versus approved reference | Screenshots and dimensional checks | Designer + product owner |
| Accessibility | Text scaling, labels, focus and touch targets | Static / automated subsets | Real users as relevant |
| Security & privacy | Permissions, user data, exports, network | Targeted AppSec checks | Authorized review |
| Recovery | Backup, restore, uninstall/update precautions | Regression / emulator tests | Physical device scenario |
| Performance | Startup, memory, ANR/crash, FPS as relevant | Measured benchmark | Real environment |
| Release | Signing, update path, app-store metadata | CI + package tools | Named owner approves |

## Report template

Use `docs/qa-reviews/<project>-<milestone>.md` for specific reviews:

```markdown
# QA and UAT: <project> <version / commit>
Approved reference and acceptance criteria:
Tested environments and device identifiers (nonpersonal):
| Scenario | PASS/FAIL/NOT RUN | Repro steps / evidence |
|---|---|---|
| Startup and critical journey | NOT RUN | |
Bugs filed/fixed + retest links:
Visual QA deviations:
Developer self-review:
Product criteria and release blockers:
Business owner approval: NOT OBTAINED
Real-user UAT / beta: NOT RUN
Critical risks and next executable step:
```

**Integrity rule:** model-generated personas and simulated feedback may help plan a study, but they are not a real person's observations or formal approval.
