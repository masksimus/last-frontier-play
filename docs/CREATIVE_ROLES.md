# Creative production roles — design, art and level design

This contract complements `AGENTS.md`, existing engineering/QA instructions and task checkpoints. It applies to **applications, websites, games and assets** as relevant. "Role" means a responsibility and independently reviewable deliverable, **not** proof that a separate model, tool or person was executed.

## 1. UI/UX designer — apps and websites

**Responsibilities:** understand the target audience and job-to-be-done; map navigation and user flows; plan information architecture, responsive layouts and states (loading, empty, error, success); define typography, iconography, design tokens, interaction and accessible controls.

**Deliverables:** editable design specification or design-source file if supported; layouts for relevant screen sizes; reusable component inventory; working interactive UI in the chosen stack; a list of states and interactions.

**Acceptance checks:** compare rendered screen captures against the **actual approved reference**, including spacing, alignment, visual hierarchy, colors, typography, buttons and icons; test mobile touch targets, forms, keyboard navigation, contrast, overflow and content clarity. Do not call an image mockup a functional application.

## 2. Game designer

**Responsibilities:** set the core gameplay loop, win/lose conditions, controls, scoring, challenge, progression, upgrades, reward economy, onboarding and intended session length; define measurable balance hypotheses.

**Deliverables:** implementable design document, state/flow diagram, balancing table, testable acceptance criteria, playable changes and telemetry plan **only if data collection is authorized**.

**Acceptance checks:** verify every claimed mechanic in the playable build; test difficulty and progression with defined scenarios, edge conditions and mobile input; separate playtest opinions from measured data.

## 3. Game UI/UX designer

**Responsibilities:** design HUD, menus, inventory, upgrade choices, maps, tutorials, pause/death/victory flows and responsive mobile controls, keeping playfield readable.

**Deliverables:** approved screen-by-screen UI direction, component states and animations, integrated actual UI assets and implementation.

**Acceptance checks:** capture gameplay on representative mobile and desktop viewports; compare approved art direction, safe areas, thumb reach, legibility, touch precision, feedback latency and interface overlap. A static layout alone does not prove a good game interaction.

## 4. Concept artist and 2D designer

**Responsibilities:** establish coherent art direction, silhouettes, palette, material language and visual storytelling; create character, props, environment, UI illustration and VFX concepts that map to real assets.

**Deliverables:** approved turnarounds / orthographic views when requested; separate transparent production-ready sprites, textures, atlas layouts, visual variants and usage/attribution records, with source/editable files where the tooling supports them.

**Acceptance checks:** individual assets must have the needed dimensions, transparent alpha, anchor points, UV or source rectangles, readable animation frames and correct in-game references. Do not paste a composite reference image as a game background or substitute geometric primitives for approved illustrated art unless explicitly requested.

## 5. 3D artist and environment artist

**Responsibilities:** produce proper meshes matching the visual reference; proportion, topology, UV mapping, material/texture sets, scene scale, pivots, lighting and set dressing. Rig/skin/animate when the character brief requires it and use a suitable dedicated toolchain.

**Deliverables:** actual importable `.glb`/`.gltf` (or project-required USD/FBX) with referenced textures/materials, named objects, documented polygon/texture budgets and source project when feasible; scene integration rather than just preview images.

**Acceptance checks:** parse and import the model into the target engine; inspect front/side/back silhouette vs reference, normals, texture presence, transform scale/origin, skeleton/weights/animation playback (when required), collision and measured runtime/mobile cost. File creation alone is **not** proof of professional visual similarity or a working rig.

## 6. Level designer

**Responsibilities:** plan spaces, routes, encounters, enemy placement, objectives, pacing, progression gates, landmarks, secrets, camera sightlines, checkpoints and difficulty.

**Deliverables:** level layouts/greybox, playable scene data/maps, spawn/trigger/collision configuration, annotated encounter plan and acceptance criteria.

**Acceptance checks:** verify traversal, reachability, collision, objective completion, spawn bounds, softlocks, camera readability, mobile control usability and pacing via actual playtests. Greybox testing comes before final decoration, but greybox is not final art.

## Required collaborative workflow

1. **Inspect:** read existing repo, current task checkpoint and user-approved references; identify the target platform and dependencies.
2. **Brief:** document what is approved versus inferred; define success criteria, visual constraints and budget. Use a small clear plan, not generic placeholder art.
3. **Specialist pass:** choose all relevant roles, record each one's output. Roles outside the task scope are N/A, not fabricated PASS.
4. **Implement:** keep real separated UI/assets/meshes/scenes/source code, integrated into the existing app/game. Favor reusable components.
5. **QA:** render screenshots or engine previews from the actual build; compare to approved reference at matching dimensions; test behavior, accessibility, performance and automated builds. Fix deviations, retest, retain evidence.
6. **Handoff:** record exact changed files, commits/PR, artifacts, screenshot/test links, issues and next executable milestone. Label each item **PASS / FAIL / NOT RUN**. Never infer physical-device compatibility from an emulator or simulation.

## Reference fidelity contract

- The user-approved screenshot or image is **art direction and visual acceptance target**. Preserve its layout, proportions, colors, typography, details and intended composition unless the user explicitly requests changes.
- When a reference includes multiple screens or a character turnaround, map each into separately functional screens/parts/assets; do not embed the reference itself as a fake UI or game world.
- Pixel-perfect or "1:1" similarity is a test claim requiring a like-for-like render comparison and documented deviations, not a marketing label. Exact equality may be infeasible across different font engines, densities or device form factors; disclose differences.
- If a needed build, design editor, GPU, Blender, device emulator or renderer is unavailable, use an authorized alternative when practical and mark missing checks **NOT RUN** rather than claiming completed work.
- Copyright, third-party asset licenses, user privacy and safe production credentials still apply.
