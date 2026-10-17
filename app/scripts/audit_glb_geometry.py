"""Offline GLB polygon/rig/material audit: source-only, no renderer or Blender needed.

Measures mesh geometry before draw-call/instancing multiplication. Runtime scene
renderer.info.render.triangles is the authority for actual frame polygon counts.
"""
from __future__ import annotations
import argparse,hashlib,json,struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/'assets'/'models'
def inspect(path):
    raw=path.read_bytes()
    if len(raw)<20 or raw[:4]!=b'glTF' or struct.unpack_from('<I',raw,4)[0]!=2:
        raise ValueError(f'{path.name}: invalid glTF2 binary')
    if struct.unpack_from('<I',raw,8)[0]!=len(raw):
        raise ValueError(f'{path.name}: mismatched GLB length')
    json_length,chunk_type=struct.unpack_from('<II',raw,12)
    if chunk_type!=0x4e4f534a or json_length>len(raw)-20:
        raise ValueError(f'{path.name}: invalid JSON chunk')
    gltf=json.loads(raw[20:20+json_length])
    accessor=gltf.get('accessors',[])
    triangles=0;vertices=0;primitives=0
    for mesh in gltf.get('meshes',[]):
        for prim in mesh.get('primitives',[]):
            mode=prim.get('mode',4)
            if mode!=4:continue
            count=accessor[prim['indices']]['count'] if 'indices' in prim else accessor[prim['attributes']['POSITION']]['count']
            triangles+=count//3
            vertices+=accessor[prim['attributes']['POSITION']]['count']
            primitives+=1
    for obj in [*gltf.get('buffers',[]),*gltf.get('images',[])]:
        if obj.get('uri') and not obj['uri'].startswith('data:'):
            raise ValueError(f'{path.name}: external resource prohibited')
    return {'file':path.name,'bytes':len(raw),'trianglesPerInstance':triangles,
            'sourceVertices':vertices,'primitives':primitives,
            'meshes':len(gltf.get('meshes',[])),
            'materials':len(gltf.get('materials',[])),
            'animations':len(gltf.get('animations',[])),
            'skins':len(gltf.get('skins',[])),
            'sha256':hashlib.sha256(raw).hexdigest()}
def report():
    manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    results=[]
    for item in manifest:
        path=ROOT/item['file'];assert path.is_file()
        info=inspect(path)
        if info['sha256']!=item['sha256']:raise ValueError('SHA mismatch: '+item['file'])
        info.update({'license':item['license'],'author':item['author']})
        results.append(info)
    if len(results)<15:raise ValueError('Expected all licensed GLB models')
    return {'models':results,'modelCount':len(results),
            'totalSourceTriangles':sum(m['trianglesPerInstance'] for m in results),
            'maxSingleModelTriangles':max(m['trianglesPerInstance'] for m in results),
            'totalGlbBytes':sum(m['bytes'] for m in results),
            'note':'Source triangles exclude repeated actors and scene instancing; see renderer.info in browser.'}
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--output',default='glb-triangle-report.json')
    args=ap.parse_args();data=report()
    Path(args.output).write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
    print('Models:',data['modelCount'],'Source triangles:',data['totalSourceTriangles'],
          'Largest GLB:',data['maxSingleModelTriangles'],'size MB:',round(data['totalGlbBytes']/1048576,2))
    for entry in sorted(data['models'],key=lambda a:-a['trianglesPerInstance']):
        print(entry['file'].ljust(32),str(entry['trianglesPerInstance']).rjust(9),'tris',
              str(entry['animations']).rjust(2),'clips')
