"""Fetch, verify, resize and bundle CC0 real-photogrammetry PBR for industrial arena.
Poly Haven API is used at build time only: no network or key needed in the game.
Assets: damaged_concrete_floor, metal_plate_02. Source and license recorded in provenance.
"""
from __future__ import annotations
import hashlib,json,urllib.request,time
from pathlib import Path
from io import BytesIO
from PIL import Image

SOURCES=('damaged_concrete_floor','metal_plate_02')
USER_AGENT='LastFrontierGame/10.1 (https://github.com/masksimus/last-frontier-play; CC0 PBR offline asset packaging)'
BASE='https://api.polyhaven.com'
TARGET=Path(__file__).resolve().parents[1]/'assets'/'pbr'
ALIASES={'albedo':['diffuse','albedo','diff','color'],'normal':['nor_gl','normal_gl','normals','normal'],'roughness':['rough','roughness']}
EXTENSIONS={'albedo':['jpg','jpeg','png'],'normal':['png','jpg'],'roughness':['jpg','png']}
def get(url):
    last=None
    for i in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT})
            with urllib.request.urlopen(req,timeout=35) as response:
                body=response.read(14*1024*1024)
                assert len(body)<14*1024*1024, 'Asset too large'
                return body
        except Exception as exc:
            last=exc;time.sleep(1+i)
    raise RuntimeError(f'Unable to download {url}: {last}')
def flatten(tree,keys=()):
    if isinstance(tree,dict):
        if isinstance(tree.get('url'),str):
            yield keys,tree
        else:
            for k,v in tree.items():yield from flatten(v,keys+(str(k).lower(),))
def select(files,kind):
    paths=list(flatten(files))
    scored=[]
    for parts,blob in paths:
        parent='/'.join(parts)
        if not any(parts and parts[0]==a for a in ALIASES[kind]):continue
        # Prefer 1K, well-supported image formats. No 8K assets on mobile.
        score=(0 if '1k' in parts else 4 if '2k' in parts else 16,
               min((EXTENSIONS[kind].index(x) for x in EXTENSIONS[kind] if x in parts),default=5),
               len(parent))
        if score[1]<5:scored.append((score,parts,blob))
    if not scored:raise ValueError(f'No {kind} in available map categories: {list(files)}')
    return sorted(scored,key=lambda z:z[0])[0][2]
def produce(slug):
    files=json.loads(get(f'{BASE}/files/{slug}'))
    summary=json.loads(get(f'{BASE}/info/{slug}'))
    assert summary.get('type')==1,'Not a texture source'
    folder=TARGET/slug;folder.mkdir(parents=True,exist_ok=True)
    result={'asset':slug,'source':f'https://polyhaven.com/a/{slug}','license':'CC0-1.0',
            'authors':summary.get('authors',{}),'maps':{}}
    for kind in ['albedo','normal','roughness']:
        data=select(files,kind);url=data['url'];raw=get(url)
        md5=data.get('md5')
        if md5:assert hashlib.md5(raw).hexdigest()==md5,(slug,kind,'MD5 mismatch')
        image=Image.open(BytesIO(raw));image.load()
        image=image.convert('RGB' if kind!='roughness' else 'L')
        assert min(image.size)>=512,'Original image below 512 pixels'
        image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
        out=folder/('color.jpg' if kind=='albedo' else 'normal.png' if kind=='normal' else 'roughness.jpg')
        if out.suffix=='.jpg':image.save(out,quality=87,optimize=True)
        else:image.save(out,optimize=True,compress_level=7)
        result['maps'][kind]={'file':out.relative_to(TARGET).as_posix(),
           'url':url,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,
           'resolution':list(image.size)}
    return result
def main():
    TARGET.mkdir(parents=True,exist_ok=True)
    records=[produce(slug) for slug in SOURCES]
    doc={'license':'CC0-1.0','builtBy':'app/scripts/fetch_cc0_pbr.py',
         'credit':'Powered by Poly Haven — https://polyhaven.com/',
         'assets':records}
    (TARGET/'provenance.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (TARGET/'README.txt').write_text('CC0 materials via Poly Haven API. Powered by Poly Haven: https://polyhaven.com/\nAuthors and original URLs recorded in provenance.json. No hotlinking at runtime.\n',encoding='utf8')
    print(json.dumps({'size':sum(x['bytes'] for r in records for x in r['maps'].values()),'assets':records},ensure_ascii=False))
if __name__=='__main__':main()
