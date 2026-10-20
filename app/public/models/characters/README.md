# Tactical operator — external source assets and production status

## Files

- `tactical_operator.glb` — textured, skinned tactical suit for visual review (not the old procedural V9).
- `tactical_operator_rig.glb` — a **different** rigged military character with 50 animation clips, for separate movement and rigging tests.
- `operator_audit.json` — actual GLB structure verified via binary header and glTF JSON.
- `tactical_operator_{front,threequarter,back}.png` — screenshots to be rendered by Blender CI.
- `../../operator-preview.html` — interactive touch-friendly web viewer.

## Credits and reuse terms

The textured character uses **Military tactical suit (LowPolyGameReady)** by **DanlyVostok (1799danly)**,
[Sketchfab source](https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The version from [cktang88/3d-fps](https://github.com/cktang88/3d-fps) uses merged meshes and WebP textures.

The animation test character uses **FREE [Military Soldier] RIGGED** by **BAMEN**,
[Sketchfab source](https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The copy from [cktang88/3d-fps](https://github.com/cktang88/3d-fps) includes retargeted motion clips.

Both third-party sources are credited here, and that notice must remain with redistributions.

## What is *not* done

- The textured model and separate 50-animation character are **not yet unified into one armature**.
- Matching the user's original visual reference has **not been independently confirmed**.
- Artistic sculpting, game LODs, collision capsules, animation retargeting and performance tests
  are **not complete**. Do not label the asset as a final custom AAA hero.
- The old Blender V9 scene remains unchanged in Higgsfield.

This branch intentionally adds independent importable GLB assets and an inspection page,
not a silent replacement for the main playable character.

## Quick verification

`npm --prefix app install` and `npm --prefix app run build`, then serve Vite
and open `/operator-preview.html`. On a phone, rotate with one finger and zoom
with two. For direct use, import `tactical_operator.glb` into Blender, Three.js or Godot.
