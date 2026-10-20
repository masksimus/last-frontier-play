#!/usr/bin/env python3
"""Conservative GLB patch: lower HeadphonesT geometry, keep rig/materials/animations intact.
The source GLB remains unchanged. Run under Blender Python for 3D placement checks.
"""
import bpy, json, math, pathlib, struct, copy
from mathutils import Vector

ROOT=pathlib.Path("app/public/models/characters")
SRC=ROOT/"tactical_operator.glb"
DST=ROOT/"tactical_operator_headset_fixed.glb"
REPORT=ROOT/"headset_fix_report.json"
TARGET_LOWER_METRES=0.12
def parse_glb(path):
    d=path.read_bytes()
    assert d[:4]==b"glTF" and struct.unpack_from("<II",d,4)==(2,len(d))
    n,t=struct.unpack_from("<I4s",d,12)
    assert t==b"JSON"
    g=json.loads(d[20:20+n].decode("utf8"))
    pos=20+n
    size,t=struct.unpack_from("<I4s",d,pos)
    assert t==b"BIN\\x00".replace(b"\x00",b"\x00") or t==b"BIN\\x00", repr(t)
    return g,bytearray(d[pos+8:pos+8+size])
def glb_write(path,g,b):
    a=json.dumps(g,ensure_ascii=False,separators=(",",":")).encode("utf8")
    a+=b" " * ((-len(a))%4)
    b+=b"\x00"*((-len(b))%4)
    payload=struct.pack("<I4s",len(a),b"JSON")+a+struct.pack("<I4s",len(b),b"BIN\\x00")+b
    path.write_bytes(struct.pack("<4sII",b"glTF",2,12+len(payload))+payload)
def meshes_geometry(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    out={}
    for obj in bpy.context.scene.objects:
        if obj.type!="MESH":continue
        p=[obj.matrix_world @ Vector(c) for c in obj.bound_box]
        low=[min(v[i] for v in p) for i in range(3)]
        high=[max(v[i] for v in p) for i in range(3)]
        out[obj.name]={"min":low,"max":high,"center":[(low[i]+high[i])/2 for i in range(3)],
             "materials":[m.name for m in obj.data.materials if m]}
    return out
g,b=parse_glb(SRC)
material_ids={i for i,m in enumerate(g["materials"]) if "headphones" in m.get("name","").lower()}
assert len(material_ids)==1,("Expected exactly one HeadphonesT material",material_ids)
matches=[]
for mi,m in enumerate(g["meshes"]):
    for primitive in m["primitives"]:
        if primitive.get("material") in material_ids:
            matches.append((mi,primitive))
assert len(matches)==1,("Headphone geometry must be uniquely identifiable",len(matches))
mi,primitive=matches[0]
pos_acc=primitive["attributes"]["POSITION"]
assert not any(pos_acc==p["attributes"].get("POSITION") for i,m in enumerate(g["meshes"]) for p in m["primitives"] if i!=mi), "Accessor shared with other meshes"
a=g["accessors"][pos_acc]; view=g["bufferViews"][a["bufferView"]]
assert a["componentType"]==5126 and a["type"]=="VEC3" and "sparse" not in a
assert view.get("buffer",0)==0 and "extensions" not in view,"Compressed or external geometry is not safely patchable"
stride=view.get("byteStride",12)
assert stride>=12
offset=view.get("byteOffset",0)+a.get("byteOffset",0)
count=a["count"]
assert offset+stride*(count-1)+12<=len(b)
print("HEADSET_MESH",mi,g["meshes"][mi].get("name"),"accessor",pos_acc,"vertices",count,"position_bounds",a.get("min"),a.get("max"))
# glTF is Y-up; the local headset vertex positions are lowered, without changing
# skin nodes, inverse bind matrices, textures, or any other geometry.
for i in range(count):
    p=offset+i*stride+4 # float Y of each XYZ vertex
    y=struct.unpack_from("<f",b,p)[0]
    struct.pack_into("<f",b,p,y-TARGET_LOWER_METRES)
for key in ("min","max"):
    if key in a:
        a[key][1]-=TARGET_LOWER_METRES
glb_write(DST,g,b)
before=meshes_geometry(SRC)
after=meshes_geometry(DST)
def mesh_with_material(table,needle):
    found=[(name,v) for name,v in table.items() if needle in [m.lower() for m in v["materials"]]]
    assert len(found)==1,(needle,[v[0] for v in found])
    return found[0]
source_name,pre=mesh_with_material(before,"headphonest")
fixed_name,post=mesh_with_material(after,"headphonest")
movement=[post["center"][i]-pre["center"][i] for i in range(3)]
print("HEADPHONE_MOVE_BLENDER_WORLD_XYZ",movement)
# Never ship a modification if its actual 3D result did not move DOWN in Z.
assert -.20<movement[2]<-.06,("Headset did not move down in world Z",movement)
assert abs(movement[0])<.04 and abs(movement[1])<.04,("Headset moved sideways",movement)
for k in before:
    if k==source_name:continue
    assert k in after,("Unrelated mesh removed",k)
    displacement=max(abs(after[k]["center"][i]-before[k]["center"][i]) for i in range(3))
    assert displacement<1e-3,("Unrelated geometry moved",k,displacement)
head_name,head=mesh_with_material(after,"mil_suit_r5_head") if False else ("Object_97",after.get("Object_97",{}))
report={"source":SRC.name,"fixed_file":DST.name,"modified_mesh":source_name,
        "modified_material":"HeadphonesT","accessor":pos_acc,"vertices_changed":count,
        "glTF_downward_m":TARGET_LOWER_METRES,
        "blender_world_displacement_xyz_m":[round(v,5) for v in movement],
        "source_headphone_z":[round(pre["min"][2],5),round(pre["max"][2],5)],
        "fixed_headphone_z":[round(post["min"][2],5),round(post["max"][2],5)],
        "reference_cap_z":[round(x,5) for x in after["Object_109"]["min"][2:3]+after["Object_109"]["max"][2:3]],
        "meshes_checked":len(before),"other_meshes_unchanged":True,
        "source_bytes":SRC.stat().st_size,"fixed_bytes":DST.stat().st_size,
        "skins":len(g.get("skins",[])),"textures":len(g.get("textures",[])),
        "images":len(g.get("images",[]))}
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
print("FIX_REPORT",json.dumps(report,ensure_ascii=False))
