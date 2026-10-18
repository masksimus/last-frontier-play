"""Build Last Frontier's original relay beacon with Blender 4.3+.

Run from any directory: blender -b --python app/scripts/create_relay_blender.py
No downloads, textures, add-ons, external assets, or paid services are required.
The resulting source and artwork are offered under CC0-1.0.
"""

from pathlib import Path
import json
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source"
SOURCE.mkdir(parents=True, exist_ok=True)
ASSET = ROOT / "assets" / "relay.png"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0


def material(name, color, metallic=0.0, roughness=0.5, emission=0.0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return result


graphite = material("Graphite armour", (0.037, 0.067, 0.095), 0.65, 0.31)
steel = material("Brushed blue steel", (0.19, 0.30, 0.36), 0.68, 0.31)
edge = material("Silver bevels", (0.36, 0.49, 0.53), 0.7, 0.28)
black = material("Inset / hazard stripes", (0.009, 0.016, 0.024), 0.3, 0.65)
orange = material("Rescue orange", (1.0, 0.245, 0.035), 0.32, 0.41)
cyan = material("Powered cyan", (0.028, 0.76, 1.0), 0.2, 0.25, 3.5)
amber = material("Status amber", (1.0, 0.21, 0.015), 0.1, 0.3, 2.3)
asset_objects = []


def finish(obj, name, mat, bevel=0.0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Machined edges", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        normal = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    asset_objects.append(obj)
    return obj


def cylinder(name, radius, depth, z, mat, vertices=8, radius_top=None):
    if radius_top is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                            location=(0, 0, z), rotation=(0, 0, math.pi / 8))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius_top,
                                        depth=depth, location=(0, 0, z),
                                        rotation=(0, 0, math.pi / 8))
    return finish(bpy.context.object, name, mat)


def box(name, location, size, mat, rotation=0.0, bevel=0.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=(0, 0, rotation))
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def ring(name, radius, minor, z, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=4,
                                    location=(0, 0, z), major_radius=radius,
                                    minor_radius=minor)
    return finish(bpy.context.object, name, mat)


def beam(name, a, b, thickness, mat):
    midpoint = (Vector(a) + Vector(b)) / 2
    direction = Vector(b) - Vector(a)
    obj = box(name, midpoint, (thickness, thickness, direction.length), mat)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


# Broad octagonal silhouette makes the objective readable at a 150-pixel draw size.
cylinder("Foundation / lower chamfer", 1.72, 0.19, 0.095, graphite, radius_top=1.58)
cylinder("Foundation / steel rim", 1.58, 0.09, 0.235, edge)
cylinder("Armoured service deck", 1.48, 0.19, 0.36, graphite)
cylinder("Circular core socket", 0.85, 0.21, 0.55, steel)
cylinder("Lower orange collar", 0.74, 0.12, 0.69, orange)
cylinder("Octagonal tower", 0.64, 1.66, 1.55, graphite, radius_top=0.49)
cylinder("Tower footing", 0.7, 0.13, 0.82, steel)
cylinder("Tower shoulder", 0.61, 0.18, 2.38, edge, radius_top=0.76)
cylinder("Antenna power chamber", 0.55, 0.59, 2.74, black, vertices=12)
cylinder("Emitter cap", 0.74, 0.15, 3.09, graphite, vertices=12, radius_top=0.54)
cylinder("Crown reflector", 0.58, 0.11, 3.23, steel, vertices=12, radius_top=0.32)
cylinder("Antenna mast", 0.12, 0.58, 3.56, steel, vertices=8, radius_top=0.075)
cylinder("Transmission tip", 0.07, 0.28, 3.97, cyan, vertices=8, radius_top=0.025)
ring("Lower cyan signal ring", 0.7, 0.064, 2.57, cyan)
ring("Upper cyan signal ring", 0.7, 0.064, 2.94, cyan)
ring("Deck live seam", 1.16, 0.028, 0.47, cyan)

for i in range(4):
    angle = i * math.pi / 2 + math.pi / 4
    x, y = math.cos(angle), math.sin(angle)
    beam(f"Reinforced support {i + 1}", (x * 1.17, y * 1.17, 0.42),
         (x * 0.5, y * 0.5, 1.8), 0.2, steel)
    box(f"Support orange plate {i + 1}", (x * 1.17, y * 1.17, 0.54),
        (0.37, 0.41, 0.13), orange, angle)
    # Large, sparse hazard marks survive sprite reduction.
    for stripe in (-0.105, 0.105):
        dx, dy = math.cos(angle) * stripe, math.sin(angle) * stripe
        box(f"Hazard stripe {i + 1}.{stripe}", (x * 1.17 + dx, y * 1.17 + dy, 0.612),
            (0.075, 0.43, 0.015), black, angle + 0.28, bevel=0)

for i in range(4):
    angle = i * math.pi / 2
    x, y = math.sin(angle), -math.cos(angle)
    box(f"Tower inset {i + 1}", (x * 0.565, y * 0.565, 1.6),
        (0.34, 0.045, 1.03), black, angle)
    box(f"Tower power strip {i + 1}", (x * 0.594, y * 0.594, 1.72),
        (0.105, 0.03, 0.65), cyan, angle, bevel=0.005)
    box(f"Chamber brace {i + 1}", (x * 0.59, y * 0.59, 2.75),
        (0.12, 0.13, 0.59), steel, angle)
    box(f"Deck bolt {i + 1}", (x * 1.37, y * 1.37, 0.49),
        (0.12, 0.12, 0.06), edge, angle)

# Front control console and two orange lamps give the tower a clear facing.
box("Console armoured case", (0, -0.82, 0.96), (0.8, 0.33, 0.4), graphite, bevel=0.04)
box("Console screen bezel", (0, -1.0, 1.03), (0.57, 0.025, 0.22), black)
box("Console illuminated screen", (-0.06, -1.017, 1.04), (0.33, 0.012, 0.13), cyan, bevel=0)
box("Console indicator", (0.21, -1.018, 1.04), (0.065, 0.014, 0.13), amber, bevel=0)
for x in (-1.03, 1.03):
    box("Safety lamp housing", (x, -0.89, 0.6), (0.19, 0.2, 0.15), black)
    box("Safety lamp", (x, -0.89, 0.69), (0.12, 0.13, 0.055), amber)


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, location, power, color, size):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    aim(light, (0, 0, 1.5))


area("Warm key", (-3.5, -4.5, 7), 950, (1.0, 0.86, 0.71), 5)
area("Cold rim", (3.5, 2.5, 5.5), 1100, (0.35, 0.76, 1.0), 4)
area("Front fill", (1, -5, 2.7), 240, (0.57, 0.83, 1.0), 4)

bpy.ops.object.camera_add(location=(6.3, -9.8, 10.8))
camera = bpy.context.object
camera.name = "Isometric sprite camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 5.65
aim(camera, (0, 0, 1.72))

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 96
# Debian's headless Blender build can omit OpenImageDenoise; CPU sampling is portable.
scene.cycles.use_denoising = False
scene.render.film_transparent = True
scene.render.resolution_x = 384
scene.render.resolution_y = 384
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(ASSET)
scene.world.color = (0.15, 0.15, 0.15)
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.color_depth = "8"

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "relay.blend"))
bpy.ops.render.render(write_still=True)

# GLB stores one mesh with material groups; lights/camera stay in the .blend only.
bpy.ops.object.select_all(action="DESELECT")
for obj in asset_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = asset_objects[0]
for obj in asset_objects:
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active = asset_objects[0]
bpy.ops.object.join()
bpy.context.object.name = "LastFrontier_RelayBeacon"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.export_scene.gltf(filepath=str(SOURCE / "relay.glb"), export_format="GLB",
                          use_selection=True, export_materials="EXPORT", export_cameras=False,
                          export_lights=False, export_yup=True, export_animations=False,
                          export_normals=False, export_texcoords=False)

mesh = bpy.context.object.data
mesh.calc_loop_triangles()
print(json.dumps({"sprite": str(ASSET), "blend": str(SOURCE / "relay.blend"),
                  "glb": str(SOURCE / "relay.glb"), "vertices": len(mesh.vertices),
                  "triangles": len(mesh.loop_triangles), "original": True,
                  "license": "CC0-1.0"}, ensure_ascii=False))
