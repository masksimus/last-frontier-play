#!/usr/bin/env python3
"""Fix tactical operator ear protection geometry in GLB, preserving textures/skin/bones.
Derive a glTF-local displacement from Blender world-space samples (original has exotic units).
"""
import bpy, copy, json, pathlib, struct, math
from mathutils import Vector, Matrix
ROOT=pathlib.Path("app/public/models/characters")
SRC=ROOT/"tactical_operator.glb"
DST=ROOT/"tactical_operator_headset_fixed.glb"
REPORT=ROOT/"headset_fix_report.json"
TARGET_DOWN=0.12
def parse(path):
    raw=path.read_bytes()
    assert raw[:4]==b"glTF" and struct.unpack_from("<II",raw,4)==(2,len(raw))
    ln,t=struct.unpack_from("<I4s",raw,12)
    assert t==b"JSON"
    g=json.loads(raw[20:20+ln].decode())
    p=20+ln
    blen,kind=struct.unpack_from("<I4s",raw,p)
    assert kind==b"BIN\x00"
    return g,raw[p+8:p+8+blen]
def write(path,g,binbytes):
    a=json.dumps(g,ensure_ascii=False,separators=(",",":")).encode()
    a+=b" "*((-len(a))%4)
    binbytes+=b"\x00"*((-len(binbytes))%4)
    chunks=struct.pack("<I4s",len(a),b"JSON")+a+struct.pack("<I4s",len(binbytes),b"BIN\x00")+binbytes
    path.write_bytes(struct.pack("<4sII",b"glTF",2,len(chunks)+12)+chunks)
g,original=parse(SRC)
material_ids={i for i,m in enumerate(g["materials"]) if m.get("name","").lower().startswith("headphonest")}
assert len(material_ids)==1,material_ids
matches=[(mi,prim) for mi,m in enumerate(g["meshes"]) for prim in m["primitives"] if prim.get("material") in material_ids]
assert len(matches)==1,("Ambiguous headphone mesh",matches)
mi,primitive=matches[0]
aidx=primitive["attributes"]["POSITION"]
assert not any(aidx==p["attributes"].get("POSITION") for i,m in enumerate(g["meshes"]) for p in m["primitives"] if i!=mi)
accessor=g["accessors"][aidx];view=g["bufferViews"][accessor["bufferView"]]
assert accessor["type"]=="VEC3" and accessor["componentType"]==5126 and "sparse" not in accessor
assert view.get("buffer",0)==0 and "extensions" not in view
offset=view.get("byteOffset",0)+accessor.get("byteOffset",0)
stride=view.get("byteStride",12)
assert stride>=12 and offset+(accessor["count"]-1)*stride+12<=len(original)
print("SOURCE_HEADPHONES",g["meshes"][mi].get("name"),"vertices",accessor["count"],"glTF_position_range",accessor.get("min"),accessor.get("max"))
def patch(local_delta,output):
    new_g=copy.deepcopy(g)
    new_b=bytearray(original)
    for v in range(accessor["count"]):
        at=offset+stride*v
        p=struct.unpack_from("<3f",original,at)
        struct.pack_into("<3f",new_b,at,*(p[i]+local_delta[i] for i in range(3)))
    acc=new_g["accessors"][aidx]
    for key in ("min","max"):
        if key in acc:acc[key]=[acc[key][i]+local_delta[i] for i in range(3)]
    write(output,new_g,new_b)
def inspect(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    rows={}
    for ob in bpy.context.scene.objects:
        if ob.type!="MESH":continue
        pp=[ob.matrix_world @ Vector(c) for c in ob.bound_box]
        low=Vector(min(p[i] for p in pp) for i in range(3))
        high=Vector(max(p[i] for p in pp) for i in range(3))
        rows[ob.name]={"center":(low+high)/2,"low":low,"high":high,
                       "materials":[m.name.lower() for m in ob.data.materials if m]}
    candidates=[name for name,r in rows.items() if any(m.startswith("headphonest") for m in r["materials"])]
    assert len(candidates)==1,("Expected exactly one headphone object",candidates)
    return rows,candidates[0]
reference,head_name=inspect(SRC)
head=reference[head_name]
print("HEADSET_ORIGINAL_WORLD",list(head["center"]),"reference_cap",list(reference["Object_109"]["center"]))
PROBE=10000.0
columns=[]
for axis in range(3):
    d=[0.0,0.0,0.0];d[axis]=PROBE
    probe=ROOT/("temporary_headset_axis_"+str(axis)+".glb")
    try:
        patch(d,probe)
        rows,name=inspect(probe)
        disp=rows[name]["center"]-head["center"]
        columns.append(disp/PROBE)
        print("WORLD_PER_GLTF_UNIT_AXIS",axis,list(disp/PROBE))
    finally:
        probe.unlink(missing_ok=True)
jac=Matrix(tuple(tuple(columns[col][row] for col in range(3)) for row in range(3)))
det=jac.determinant()
print("TRANSFORM_DETERMINANT",det)
assert abs(det)>1e-22,("Cannot safely derive headset transform",det)
local=jac.inverted() @ Vector((0,0,-TARGET_DOWN))
assert all(math.isfinite(x) and abs(x)<10000000 for x in local),("Unreasonable local shift",list(local))
print("CALCULATED_GLTF_LOCAL_MOVE",list(local))
patch(list(local),DST)
corrected,correct_name=inspect(DST)
actual=corrected[correct_name]["center"]-head["center"]
print("ACTUAL_WORLD_SHIFT",list(actual))
assert abs(actual.z+TARGET_DOWN)<.025 and abs(actual.x)<.025 and abs(actual.y)<.025,("Headset placement incorrect",list(actual))
assert len(corrected)==len(reference)
for name,ob in reference.items():
    if name==head_name:continue
    assert name in corrected,("Missing other mesh",name)
    assert (corrected[name]["center"]-ob["center"]).length<0.0001,("Unrelated mesh moved",name)
report={
 "source":SRC.name,"fixed_file":DST.name,"headset_mesh":head_name,
 "headset_material":"HeadphonesT","accessor":aidx,"changed_vertices":accessor["count"],
 "requested_down_metres":TARGET_DOWN,
 "glTF_local_displacement":[round(v,4) for v in local],
 "verified_blender_world_displacement":[round(v,5) for v in actual],
 "before_headset_world_z":[round(head["low"].z,5),round(head["high"].z,5)],
 "after_headset_world_z":[round(corrected[correct_name]["low"].z,5),round(corrected[correct_name]["high"].z,5)],
 "helmet_world_z":[round(reference["Object_109"]["low"].z,5),round(reference["Object_109"]["high"].z,5)],
 "other_meshes_unchanged":True,"mesh_count":len(reference),
 "source_bytes":SRC.stat().st_size,"fixed_bytes":DST.stat().st_size,
 "skins":len(g.get("skins",[])),"textures":len(g.get("textures",[])),"images":len(g.get("images",[]))
}
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
print("HEADSET_FIX_VERIFIED",json.dumps(report,ensure_ascii=False))
