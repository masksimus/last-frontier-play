# Relay beacon — original Last Frontier asset

An original procedural sci-fi mission objective created locally in **Blender 4.3.2**.
No downloaded meshes, stock textures, third-party materials, provider calls, or paid
generation services were used. The geometry and materials come entirely from
[`../scripts/create_relay_blender.py`](../scripts/create_relay_blender.py).

## Files

- `relay.blend`: editable source scene, named parts, procedural materials, lights,
  and an orthographic camera. Keep this source outside the web release.
- `relay.glb`: optional portable 3D mesh, without lights or camera. This is source
  material for future 3D use, not loaded by the current Canvas game.
- `../assets/relay.png`: 384 × 384 transparent RGBA sprite for the game.
- `validation.json`: independent byte-level PNG / GLB checks and SHA-256 digests.
- `blender-render.log`: output of the actual local Blender generation and export.

## Rebuild

From the repository root, run:

```sh
blender -b --python app/scripts/create_relay_blender.py
```

This recreates the three outputs above. The CPU Cycles render uses 96 samples and
does not require a GPU, OpenImageDenoise, an account, or an API key. Geometry uses
simple meshes and flat shading; the GLB omits normals so importers calculate the
flat face normals required by glTF. No image textures are needed.

## Art brief and budgets

Stable name: `LastFrontier_RelayBeacon`. An industrial graphite and blue-steel
relay tower with two cyan emitter rings, four diagonal braces, an antenna,
illuminated console, orange safety lamps, and orange/black hazard plates. The
wide octagonal footprint and sparse bright accents are intended to remain legible
when the Canvas game draws the sprite at approximately 150 × 150 pixels.

The render's nonzero-alpha bounds are `(76, 62)` to `(308, 356)` inside its square
384-pixel canvas. Centre the canvas on the objective; the visual footprint sits
near `y + 0.88 × height` when positioning the canvas by its top-left corner.
Camera angle is an elevated orthographic three-quarter view. There is no baked
opaque floor or cast ground shadow, so gameplay can draw its own objective ring.

Target budgets: PNG 384 × 384 RGBA, GLB under 100 KiB, under 3,000 triangles,
no textures, no skeletal rig or animation. Actual validation is in
`validation.json`. PNG was also visually inspected after rendering. The optional
GLB received static structure, bounds, and index validation; it has not been
imported into a runtime renderer. The local `game-dev` CLI was unavailable, so no
canonical game-dev package or GPU validation is claimed.

## License and provenance

SPDX-License-Identifier: **CC0-1.0**

The new procedural source script, generated geometry, materials, and rendered
sprite in this asset pack are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No attribution is
required. This statement applies to this original relay asset only; other game
assets keep their existing licenses and attribution requirements.

Created for the Last Frontier development task with local Python / Blender
procedural construction on 2026-10-18. There is no reference image, model prompt,
external source URL, or negative prompt because no generative media service was
used. The art brief above and the preserved script are the complete construction
specification.
