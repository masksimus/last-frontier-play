#!/usr/bin/env python3
"""Patch only the HeadphonesT glTF node TRS, preserving original mesh and skin bytes.
Calibrate transform empirically against Blender 3D world-space bounding boxes.
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
nodes=[i for i,n in enumerate(g["nodes"]) if n.get("mesh")==mi]
assert len(nodes)==1,("Ambiguous headphone node",nodes)
node_id=nodes[0]
assert "matrix" not in g["nodes"][node_id]
print("HEADPHONE_GLTF_NODE",node_id,g["nodes"][node_id])
def patch(local_delta,output):
    new_g=copy.deepcopy(g)
    node=new_g["nodes"][node_id]
    existing=node.get("translation",[0,0,0])
    node["translation"]=[existing[i]+local_delta[i] for i in range(3)]
    write(output,new_g,original)
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
print("ORIGINAL_HEADPHONE_WORLD",list(head["center"]),"CAP",list(reference["Object_109"]["center"]))
PROBE=10000.
columns=[]
for axis in range(3):
    d=[0.,0.,0.];d[axis]=PROBE
    tmp=ROOT/("temporary_node_probe_"+str(axis)+".glb")
    try:
        patch(d,tmp)
        rows,name=inspect(tmp)
        disp=rows[name]["center"]-head["center"]
        columns.append(disp/PROBE)
        print("NODE_WORLD_PER_LOCAL_AXIS",axis,list(disp/PROBE))
    finally:tmp.unlink(missing_ok=True)
jac=Matrix(tuple(tuple(columns[col][row] for col in range(3)) for row in range(3)))
det=jac.determinant()
print("NODE_JACOBIAN_DET",det)
assert abs(det)>1e-22,("Node TRS does not control the headphone world position",det)
local=jac.inverted()@Vector((0.,0.,-TARGET_DOWN))
assert all(math.isfinite(x) and abs(x)<1e8 for x in local),("Suspicious local movement",list(local))
patch(list(local),DST)
corrected,correct_name=inspect(DST)
actual=corrected[correct_name]["center"]-head["center"]
print("ACTUAL_HEADPHONE_WORLD_SHIFT",list(actual),"LOCAL_TRANSLATION",list(local))
assert abs(actual.z+TARGET_DOWN)<.025 and abs(actual.x)<.025 and abs(actual.y)<.025,("Headset placement incorrect",list(actual))
assert len(corrected)==len(reference)
for name,ob in reference.items():
    if name==head_name:continue
    assert name in corrected and (corrected[name]["center"]-ob["center"]).length<.0001,("Other mesh changed",name)
report={
 "source":SRC.name,"fixed_file":DST.name,"headset_mesh":head_name,
 "headset_material":"HeadphonesT","headset_node_id":node_id,"change":"node translation only, binary mesh intact",
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
