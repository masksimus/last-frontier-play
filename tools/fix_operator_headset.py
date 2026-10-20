#!/usr/bin/env python3
"""Move only the headset by giving its skinned mesh a corrected set of inverse bind matrices.
This keeps all existing vertices, textures, bones and other meshes byte-for-byte intact.
"""
import bpy,copy,json,math,pathlib,struct
from mathutils import Vector,Matrix
ROOT=pathlib.Path("app/public/models/characters")
SRC=ROOT/"tactical_operator.glb"
DST=ROOT/"tactical_operator_headset_fixed.glb"
REPORT=ROOT/"headset_fix_report.json"
TARGET_DOWN=.12
def parse(path):
    raw=path.read_bytes()
    assert raw[:4]==b"glTF" and struct.unpack_from("<II",raw,4)==(2,len(raw))
    length,typ=struct.unpack_from("<I4s",raw,12);assert typ==b"JSON"
    g=json.loads(raw[20:20+length].decode())
    p=20+length
    size,typ=struct.unpack_from("<I4s",raw,p);assert typ==b"BIN\x00"
    return g,raw[p+8:p+8+size]
def write(path,g,b):
    j=json.dumps(g,ensure_ascii=False,separators=(",",":")).encode();j+=b" "*((-len(j))%4)
    b+=b"\x00"*((-len(b))%4)
    body=struct.pack("<I4s",len(j),b"JSON")+j+struct.pack("<I4s",len(b),b"BIN\x00")+b
    path.write_bytes(struct.pack("<4sII",b"glTF",2,12+len(body))+body)
g,orig=parse(SRC)
mid={i for i,m in enumerate(g["materials"]) if m.get("name","").lower().startswith("headphonest")}
assert len(mid)==1,mid
meshes={i for i,m in enumerate(g["meshes"]) if any(p.get("material") in mid for p in m["primitives"])}
assert len(meshes)==1,meshes
nodes=[i for i,n in enumerate(g["nodes"]) if n.get("mesh") in meshes and "skin" in n]
assert len(nodes)==1,nodes
nodeid=nodes[0]
oldskin=g["nodes"][nodeid]["skin"]
skin=g["skins"][oldskin]
acc=g["accessors"][skin["inverseBindMatrices"]]
view=g["bufferViews"][acc["bufferView"]]
assert acc["type"]=="MAT4" and acc["componentType"]==5126 and acc["count"]==len(skin["joints"])
assert view.get("buffer",0)==0 and not view.get("extensions")
start=view.get("byteOffset",0)+acc.get("byteOffset",0)
stride=view.get("byteStride",64)
assert stride>=64 and start+(acc["count"]-1)*stride+64<=len(orig)
print("HEADPHONE_SKIN",nodeid,oldskin,"joints",acc["count"],"original_ibm_offset",start)
def patch(local_delta,dst):
    gg=copy.deepcopy(g)
    bin=bytearray(orig)
    while len(bin)%4:bin.append(0)
    newoffset=len(bin)
    # Duplicate original inverse bind matrices so only HeadphonesT changes.
    for j in range(acc["count"]):
        mat=list(struct.unpack_from("<16f",orig,start+j*stride))
        for i in range(3):mat[12+i]+=local_delta[i]
        bin.extend(struct.pack("<16f",*mat))
    gg["bufferViews"].append({"buffer":0,"byteOffset":newoffset,"byteLength":acc["count"]*64})
    newacc={"bufferView":len(gg["bufferViews"])-1,"componentType":5126,"count":acc["count"],"type":"MAT4"}
    gg["accessors"].append(newacc)
    newskin=copy.deepcopy(skin)
    newskin["inverseBindMatrices"]=len(gg["accessors"])-1
    gg["skins"].append(newskin)
    gg["nodes"][nodeid]["skin"]=len(gg["skins"])-1
    gg["buffers"][0]["byteLength"]=len(bin)
    write(dst,gg,bin)
def inspect(path):
    bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    meshes={}
    for o in bpy.context.scene.objects:
        if o.type!="MESH":continue
        p=[o.matrix_world @ Vector(c) for c in o.bound_box]
        low=Vector([min(v[i] for v in p) for i in range(3)])
        high=Vector([max(v[i] for v in p) for i in range(3)])
        meshes[o.name]={"low":low,"high":high,"center":(low+high)/2,"material":[m.name.lower() for m in o.data.materials if m]}
    names=[n for n,x in meshes.items() if any(m.startswith("headphonest") for m in x["material"])]
    assert len(names)==1,(names,list(meshes))
    return meshes,names[0]
reference,oldname=inspect(SRC)
head=reference[oldname]["center"]
print("ORIGINAL_WORLD",list(head),"HELMET",list(reference["Object_109"]["center"]))
PROBE=10000.
columns=[]
for i in range(3):
    v=[0.,0.,0.];v[i]=PROBE
    tmp=ROOT/("temporary_ibm_probe_"+str(i)+".glb")
    try:
        patch(v,tmp)
        rows,name=inspect(tmp)
        shift=(rows[name]["center"]-head)/PROBE
        columns.append(shift)
        print("IBM_WORLD_PER_LOCAL",i,list(shift))
    finally:tmp.unlink(missing_ok=True)
M=Matrix(tuple(tuple(columns[col][row] for col in range(3)) for row in range(3)))
det=M.determinant()
print("IBM_JACOBIAN_DET",det)
assert abs(det)>1e-22,("Skin inverse binds did not influence world height",det)
local=M.inverted()@Vector((0.,0.,-TARGET_DOWN))
assert all(math.isfinite(x) and abs(x)<1e8 for x in local),list(local)
patch(list(local),DST)
rows,newname=inspect(DST)
real=rows[newname]["center"]-head
print("WORLD_SHIFT_FINAL",list(real))
assert abs(real.z+TARGET_DOWN)<.025 and abs(real.x)<.025 and abs(real.y)<.025,("Headphone final position not safe",list(real))
assert all(name in rows and (rows[name]["center"]-rec["center"]).length<.0001
           for name,rec in reference.items() if name!=oldname), "Other meshes changed"
report={"source":SRC.name,"fixed_file":DST.name,
        "method":"separate inverse bind matrices for headset skin only",
        "headset_node":nodeid,"joints":acc["count"],"target_down_m":TARGET_DOWN,
        "verified_world_delta_xyz_m":[round(v,5) for v in real],
        "original_headset_z":[round(reference[oldname]["low"].z,5),round(reference[oldname]["high"].z,5)],
        "corrected_headset_z":[round(rows[newname]["low"].z,5),round(rows[newname]["high"].z,5)],
        "helmet_z":[round(reference["Object_109"]["low"].z,5),round(reference["Object_109"]["high"].z,5)],
        "unmodified_meshes":len(reference)-1,
        "textures":len(g.get("textures",[])),"images":len(g.get("images",[])),
        "source_bytes":SRC.stat().st_size,"corrected_bytes":DST.stat().st_size}
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
print("HEADSET_FIX_VERIFIED",json.dumps(report,ensure_ascii=False))
