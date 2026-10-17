"""Author-owned tileable-looking PBR source textures for the Blender titan.
Pillow + NumPy are open-source. No AI concept screenshot used as an in-game background.
Writes grayscale roughness, tangent-space normal, and two color atlases.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def make_noise(size,seed):
    rng=np.random.default_rng(seed)
    texture=np.zeros((size,size),np.float32)
    weights=[.55,.23,.12,.065,.035]
    for level,weight in enumerate(weights):
        small=max(4,size//(2**(7-level)))
        arr=rng.integers(0,256,(small,small),dtype=np.uint8)
        src=Image.fromarray(arr,'L').resize((size,size),Image.Resampling.BICUBIC)
        texture+=np.asarray(src,dtype=np.float32)/255.*weight
    texture=(texture-texture.mean())/(texture.std()+1e-5)
    return np.clip(texture,-2.2,2.2),rng

def material_set(name,folder,size,seed,base,metal):
    noise,rng=make_noise(size,seed)
    yy,xx=np.mgrid[0:size,0:size]
    seams=np.minimum(xx%128,128-xx%128)
    seams=np.minimum(seams,np.minimum(yy%128,128-yy%128))
    joint=np.exp(-(seams/2.5)**2)
    grain=(rng.random((size,size),dtype=np.float32)-.5)*.16
    tarnish=np.maximum(0,.15+noise*.15+grain-joint*.35)
    scratches=np.zeros((size,size),dtype=np.float32)
    for _ in range(220 if metal else 95):
        x,y=rng.integers(0,size,size=2)
        width=int(rng.integers(2,28)) if metal else int(rng.integers(2,9))
        scratches[y:min(size,y+2),x:min(size,x+width)]+=.45
    val=np.clip(.86+noise*.075+grain*.3-scratches*.33-joint*.36, .23,1.15)
    col=np.stack([np.clip(base[c]*val+(11 if c==0 else 0)*tarnish,0,255) for c in range(3)],axis=2).astype(np.uint8)
    albedo=Image.fromarray(col,'RGB')
    albedo.save(folder/(name+'_albedo.jpg'),quality=89,subsampling=0)
    rough=np.clip((.28 if metal else .68)+tarnish*.34+joint*.22+scratches*.35,0,1)
    Image.fromarray((rough*255).astype(np.uint8),'L').save(folder/(name+'_roughness.png'))
    # Tangent-space normal field derived from synthetic microfacet height, avoids flat surfaces.
    height=(noise*.10+grain*.6-joint*.2-scratches*.3)
    dy,dx=np.gradient(height)
    vec=np.stack((-dx*2.3,-dy*2.3,np.ones_like(dx)),axis=-1)
    vec=vec/(np.linalg.norm(vec,axis=-1,keepdims=True)+1e-6)
    Image.fromarray(np.clip((vec*.5+.5)*255,0,255).astype(np.uint8),'RGB').save(folder/(name+'_normal.png'))

def generate(folder,size=512):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    material_set('armor',folder,size,117,(80,94,105),True)
    material_set('flesh',folder,size,281,(117,77,76),False)
    material_set('steel',folder,size,303,(58,64,73),True)
    for f in sorted(folder.glob('*')):print(f.name,f.stat().st_size)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',default='assets/generated/titan');p.add_argument('--size',type=int,default=512)
    a=p.parse_args();generate(a.output,a.size)
