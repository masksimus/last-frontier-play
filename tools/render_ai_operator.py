#!/usr/bin/env python3
"""Render and visually audit licensed tactical operator glTF assets.
Run: blender --background --python tools/render_ai_operator.py
Only preview PNGs are committed, never changes to the original source GLB.
"""
import bpy, math, json, statistics
from mathutils import Vector

SRC = "app/public/models/characters/tactical_operator.glb"
OUT = "app/public/models/characters"

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SRC)
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not objects:
    raise ValueError("No renderable mesh in tactical_operator.glb")
root = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
print("Found",len(objects),"meshes",len(root),"armatures")
for obj in objects:
    local_points=[obj.matrix_world @ Vector(c) for c in obj.bound_box]
    dimensions=[round(max(p[i] for p in local_points)-min(p[i] for p in local_points),3) for i in range(3)]
    print('MESH_BOUNDS',obj.name,dimensions,'hide_render',obj.hide_render)
scene = bpy.context.scene
# Bound the actual geometry, not the empty armature origin.
deps = bpy.context.evaluated_depsgraph_get()
def corners(mesh):
    return [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
def bbox(mesh):
    pp=corners(mesh)
    a=Vector([min(v[i] for v in pp) for i in range(3)])
    b=Vector([max(v[i] for v in pp) for i in range(3)])
    return (a,b)
centres={o:(bbox(o)[0]+bbox(o)[1])*.5 for o in objects}
median=Vector([statistics.median([c[i] for c in centres.values()]) for i in range(3)])
core=[]
excluded=[]
for o in objects:
    a,b=bbox(o);dimension=b-a
    distance=max(abs(v) for v in (centres[o]-median))
    if max(dimension)<4.0 and distance<8.0:
        core.append(o)
    else:
        excluded.append((o.name,round(distance,3),[round(v,3) for v in dimension]))
        o.hide_render=True
assert len(core)>=8, 'Cannot find a coherent body cluster'
print('CORE_COUNT',len(core),'EXCLUDED',excluded,'MEDIAN',list(median))
bounds=[p for o in core for p in corners(o)]
mins = Vector([min(v[i] for v in bounds) for i in range(3)])
maxs = Vector([max(v[i] for v in bounds) for i in range(3)])
center = (mins+maxs)*.5
size = maxs-mins
height=max(size.z,0.1)
print("Cluster extent in metres",tuple(round(x,3) for x in size))
# Auto rescale a character to a 1.8 metre standard height without affecting source GLB.
scale = 1.80/height
for o in list(scene.objects):
    if o.parent is None and o.type not in {'LIGHT','CAMERA'}:
        o.scale *= scale
        o.location = (o.location-center)*scale
bpy.context.view_layer.update()
bnds = [p for o in core for p in corners(o)]
min_z=min(p.z for p in bnds)
for o in list(scene.objects):
    if o.parent is None and o.type not in {'LIGHT','CAMERA'}:o.location.z-=min_z
bpy.context.view_layer.update()
bounds = [p for o in core for p in corners(o)]
mins = Vector([min(v[i] for v in bounds) for i in range(3)])
maxs = Vector([max(v[i] for v in bounds) for i in range(3)])
middle=(mins+maxs)*.5
height=(maxs-mins).z
# Place clean infinite-ish floor and three studio lights.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.015))
floor=bpy.context.object
floor.name="STUDIO_neutral_floor"
m=bpy.data.materials.new("STUDIO_floor")
m.diffuse_color=(.125,.17,.185,1)
m.use_nodes=True
bs=m.node_tree.nodes.get("Principled BSDF")
bs.inputs["Base Color"].default_value=(.125,.17,.185,1)
bs.inputs["Roughness"].default_value=.86
floor.data.materials.append(m)
scene.world.color=(.26,.3,.35)
if scene.world.use_nodes:
    bg=scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value=(.22,.27,.32,1)
        bg.inputs["Strength"].default_value=.8

def light(name,pos,energy,size,color):
    dat=bpy.data.lights.new(name,'AREA')
    dat.energy=energy;dat.shape='DISK';dat.size=size;dat.color=color
    ob=bpy.data.objects.new(name,dat);scene.collection.objects.link(ob)
    ob.location=pos;direction=Vector((0,0,1.05))-ob.location
    ob.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
light("Key softbox",(2.4,-3.5,4.7),750,3.5,(1.,.92,.82))
light("Fill softbox",(-3.2,-1.5,2.7),420,3.2,(.83,.90,1.))
light("Rim softbox",(-1.0,3.7,4.1),850,2.0,(.82,.91,1.))

dat=bpy.data.cameras.new('Camera')
cam=bpy.data.objects.new('Camera',dat)
scene.collection.objects.link(cam);scene.camera=cam
dat.type='ORTHO';dat.ortho_scale=2.75
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=False
for vl in scene.view_layers:
    if hasattr(vl, 'cycles'):vl.cycles.use_denoising=False
scene.render.resolution_x=540
scene.render.resolution_y=720
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX' if 'AgX' in [e.identifier for e in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
target=Vector((0,0,height*.55))
views=[("front",(-0.06,-4.2,height*.85)),
       ("threequarter",(3.0,-3.3,height*.93)),
       ("back",(0.07,4.2,height*.85))]
for label,location in views:
    cam.location=location
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=f"{OUT}/tactical_operator_{label}.png"
    bpy.ops.render.render(write_still=True)
    print("RENDERED",scene.render.filepath)
report={"source":"https://github.com/cktang88/3d-fps/blob/main/public/assets/models/characters/soldier_tac.glb",
        "license":"CC BY 4.0 original character DanlyVostok","objects":len(objects),"body_objects":len(core),"excluded":excluded,
        "armatures":len(root),
        "measured_m":[round(v,3) for v in size],
        "final_dimensions_m":[round(v,3) for v in maxs-mins],
        "renders":[x[0] for x in views]}
with open(f"{OUT}/operator_visual_audit.json","w") as f:json.dump(report,f,indent=2)
