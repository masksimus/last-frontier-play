# Last Frontier — character technical acceptance, 24 Oct 2026

## Existing verified assets
- app/public/models/characters/tactical_operator.glb — textured tactical body by DanlyVostok, CC BY 4.0. Existing operator_audit.json records 15 meshes, 1 skin, 19 images, 0 animations.
- app/public/models/characters/tactical_operator_headset_fixed.glb — headset-corrected export, browser report records valid GLB export, 9,947,936 bytes.
- app/public/models/characters/tactical_operator_rig.glb — SEPARATE BAMEN soldier, CC BY 4.0, existing audit records 1 skin and 50 clips. They are NOT transferred to tactical_operator.
- Respect source credits in app/public/models/characters/README.md.

## Acceptance targets and real status
| Criterion | Required | Status |
|---|---|---|
| Match approved visual reference | Correct equipment, proportions, headset | NOT VERIFIED |
| Height / pivot | 1.80–1.85m, ground origin | Existing visual audit says 1.80m; pivot unverified |
| LOD0 | 60k–70k triangles, about 30k–35k verts | To audit |
| LOD1, LOD2 | About 30k / 10k–12k triangles | NOT CREATED |
| Clean animated topology | Quads in source, edge loops, manifold | NOT VERIFIED |
| PBR textures | BaseColor, Normal, Roughness, Metallic, AO; 4K source, 2K WebGL | PARTIAL, resolutions unverified |
| Humanoid bones and sockets | root, pelvis, spine, fingers, weapon_r/l, holster_r, backpack_root | Names and functionality unverified |
| Skinning | <=4 positive weights per vertex | Structural check only; real weights not fully verified |
| Same-character animation | Anim_Idle, Anim_Walk, Anim_Run, Anim_Aim, Anim_Crouch | NOT DONE |
| Export | GLB LOD0/1/2 + Unity/UE FBX + editable Blend | NOT DONE |
| On-device test | Three.js/WebGL mobile, Unity, UE5 | Partial preview test, no full cross-engine approval |

## Technical clarifications
- glTF exports Y-up; Blender uses Z-up; Unreal typically uses +X forward, +Z up. Validate orientations after import.
- ORM image convention: red Occlusion, green Roughness, blue Metallic.
- Two separate skinned models are NOT equivalent to one model with animations.
- Zero nonzero weights on a required joint or odd deformation cannot be diagnosed by checking attribute names alone.
- Full reference match and measured runtime performance require independent visual and engine inspection.

## Continuous audit
Execute from repository root:
    node --test app/tests/operator_qa.test.cjs
    node app/scripts/audit_operator_glb.cjs app/public/models/characters/tactical_operator.glb app/public/models/characters/tactical_operator_headset_fixed.glb app/public/models/characters/tactical_operator_rig.glb > operator_technical_audit.json

GitHub Actions workflow operator-tz-qa.yml uploads operator-technical-qa-report with measured triangles, vertex counts, joint names, clip names, material usage, and missing required items. Structural checks never indicate AAA art completion.

## Delivery structure (TARGET ONLY — not all files exist)
    Project_Character_LastFrontier/
      Source_Files/Character_HighPoly.blend
      Source_Files/Character_LowPoly_Rigged.blend
      Textures_4K/T_Character_Albedo.png
      Textures_4K/T_Character_Normal.png
      Textures_4K/T_Character_Roughness.png
      Textures_4K/T_Character_Metallic.png
      Textures_4K/T_Character_AO.png
      Textures_4K/T_Character_ORM.png
      Export_Formats/GLB/Character_LastFrontier_LOD0.glb
      Export_Formats/GLB/Character_LastFrontier_LOD1.glb
      Export_Formats/GLB/Character_LastFrontier_LOD2.glb
      Export_Formats/Unity/Character_LastFrontier.fbx
      Export_Formats/UnrealEngine/SK_Character_LastFrontier.fbx
      Export_Formats/Blender/Character_LastFrontier_ReadyScene.blend
      QA/operator_technical_audit.json
      QA/rig_and_animations_report.md
      QA/license_attribution.md

Paid products are not required for this acceptance process; the current asset still needs manual/automated rig retarget, independent LODs and proper production exports.