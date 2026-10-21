# AGENTS.md — Last Frontier Play

These instructions apply to the entire repository. Treat them as project-specific guidance for Codex, ChatGPT, and other coding agents.

## Mission and source of truth

Continue developing the **existing** "Последний рубеж / Last Frontier" HTML5 game. Do not replace the project with a new demo, a screenshot, a static illustration, or a simplified collection of geometric placeholders.

- Read the current files, relevant Git history, and README before making a change.
- Main game source and build tools live in `app/`; the repository root also has an `index.html` and version-specific GitHub Actions. Identify which runtime/version the requested task actually affects before editing.
- Existing deployed versions and preview paths must remain intact unless a task explicitly authorizes changing them. Do not silently change release artifacts, Pages deployment workflows, or production URLs.
- Keep all implementation files and existing game features where practical. Use the smallest coherent changes instead of rewriting working systems.
- Consult existing source under `app/src/`, tests under `app/tests/`, and the relevant workflow in `.github/workflows/`. Do not presume a feature exists merely because a workflow or filename mentions it.

## Development workflow

1. Inspect the requested behavior, code paths, assets, constraints and applicable tests.
2. State a short concrete implementation plan when the change is substantial.
3. Work on a dedicated branch. Commit focused, reviewable changes and prefer a pull request into `main`.
4. Implement working code and genuine individual game assets; keep code, textures, models, rigs, animations, audio and UI organized and referenced correctly.
5. Add or update tests for changed behavior. Investigate failures and retest instead of hiding or ignoring them.
6. Report the exact changed files, reproducible checks, logs/artifacts and remaining blockers.

## Verified build and gameplay

The `app/package.json` declares:

- `npm run test`: Node tests in `app/tests/*.test.cjs`.
- `npm run build`: Vite build plus `app/scripts/package_dist.py`.
- `npm run verify`: tests followed by build.

Run commands from `app/` after installing dependencies using the repository's actual package/lockfile state. Do not assume `npm ci` works without first confirming that a compatible lockfile exists.

For gameplay, rendering, controls, and visual changes, add browser/runtime checks when an environment is available. Test touch controls and small mobile viewports as well as desktop behavior. Verify the playable game, not merely the existence of `dist/index.html`.

For 3D or GLB work: validate glTF/GLB structure and actual game loading; inspect render, body proportions, transforms, materials, UVs/textures, skeletal hierarchy, animation playback, collision and mobile performance as applicable. A nonempty `.glb` file, thumbnail or procedural primitive is not proof of a high-quality character or of visual similarity to an approved reference. Preserve the approved character silhouette and art direction.

Do not invent test passes, performance numbers, screenshots, frame rates, tool availability, or platform approvals. If a check cannot run, mark it **NOT RUN** and explain precisely why. If it fails, include the failure.

## Privacy, security and digital-law responsibilities

For new features, existing product changes, analytics, SDKs, data collection, user login, payments or public release, apply `docs/PRIVACY_SECURITY_ROLES.md`. Review the work from the five perspectives: information security, digital law, DPO/privacy coordination, secure development and product/data analysis. Map actual data flows and user permissions first; then define safeguards and draft the relevant policies from **verified** product behavior. Assess applicable Russian law (including 152-FZ) and platform rules before release, with real operator identity and human review where needed. Report evidence-backed security/privacy tests and unresolved risks as PASS/FAIL/NOT RUN. Do not claim that an AI is an appointed DPO, that an automatically drafted policy makes the product compliant, or that regulation notifications were filed unless independently verified.

## Security, licensing and release

- Never commit credentials, tokens, private materials or production signing keys.
- Review licenses and attribution before importing third-party code, models, textures, audio or other assets. Maintain relevant notices.
- Check dependencies and generated files for unsafe behavior; avoid unnecessary services and paid APIs.
- Do not publish/deploy to GitHub Pages, Yandex Games, VK or stores without explicit authorization for that action and real platform checks.
- A prototype, preview or generated asset is not a release candidate until integration, tests and platform-specific requirements are verified.
- Keep production deploys and older release versions safe; deployment workflow changes require explicit review.

## Long tasks and resumable development

For a task spanning multiple commits or sessions, create and maintain `docs/agent-tasks/<issue-or-short-id>.md` using `docs/agent-tasks/README.md`. Record acceptance criteria, exact branch and verified SHA, changed paths, test evidence, blockers and one concrete next action. Before resuming, inspect that record alongside current code and CI. Continue with the next unfinished milestone instead of restarting or requesting requirements already in the repository. Update the checkpoint after each verified increment and before ending an interrupted session. This is **durable handoff state**, not proof of a background agent; do not claim continuous execution without a separately configured runner.

## Completion contract

Every task report must contain: **what changed**, **where it changed (paths/commit or PR)**, **what was actually tested with command and result**, **what the user can run or open**, and **remaining limitations**. Prefer a working, tested subset over an impressive but unverified claim.
