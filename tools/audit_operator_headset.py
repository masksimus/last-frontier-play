#!/usr/bin/env python3
"""Read-only examination of original GLB, its skinning and the headset position."""
import bpy, json, math, struct, pathlib, statistics
from mathutils import Vector
source=pathlib.Path("app/public/models/characters/tactical_operator.glb")
raw=source.read_bytes()
n,kind=struct.unpack_from("<I4s",raw,12)
assert kind==b"JSON"
gltf=json.loads(raw[20:20+n])
print("GLTF_SCENE",json.dumps({
 "asset":gltf.get("asset"),"scenes":gltf.get("scenes"),"skins":gltf.get("skins"),
 "nodes":[{"id":i,"name":j.get("name"),"mesh":j.get("mesh"),"skin":j.get("skin"),
 "translation":j.get("translation"),"scale":j.get("scale"),"children":j.get("children")}
 for i,j in enumerate(gltf["nodes"]) if j.get("mesh") is not None], "meshes":[{"id":i,"name":m.get("name"),"primitives":len(m["primitives"])}
 for i,m in enumerate(gltf["meshes"])]},ensure_ascii=False,default=str))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
bpy.context.view_layer.update()
rows=[]
for obj in bpy.data.objects:
 if obj.type not in {"MESH","ARMATURE"}:continue
 corners=[obj.matrix_world@Vector(p) for p in obj.bound_box] if obj.type=="MESH" else []
 lo=[round(min(p[i] for p in corners),3) for i in range(3)] if corners else []
 hi=[round(max(p[i] for p in corners),3) for i in range(3)] if corners else []
 record={"name":obj.name,"type":obj.type,"parent":obj.parent.name if obj.parent else None,
 "location":[round(x,4) for x in obj.location],"scale":[round(x,4) for x in obj.scale],
 "world_min":lo,"world_max":hi,"modifiers":[m.type for m in obj.modifiers],
 "vertex_count":len(obj.data.vertices) if obj.type=="MESH" else 0,
 "materials":[m.name for m in obj.data.materials if m] if obj.type=="MESH" else [],
 "bone_count":len(obj.data.bones) if obj.type=="ARMATURE" else 0}
 rows.append(record)
 print("OBJECT_AUDIT",json.dumps(record,ensure_ascii=False))
print("ARMATURE_BONES",json.dumps({
 o.name:[b.name for b in o.data.bones] for o in bpy.data.objects if o.type=="ARMATURE"
},ensure_ascii=False))
print("HEADSET_CANDIDATES",json.dumps([r for r in rows if any(k in (r["name"]+" "+" ".join(r["materials"])).lower() for k in
["ear","head","headset","helmet","earmuff","radio","phones","науш","earpad"])],ensure_ascii=False))
