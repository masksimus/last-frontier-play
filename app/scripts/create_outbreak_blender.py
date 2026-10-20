"""Original CC0 industrial isometric kit. blender -b --python app/scripts/create_outbreak_blender.py"""
from pathlib import Path
import bpy, json, math, random, hashlib, os
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'outbreak'; SRC=ROOT/'art-source'/'outbreak'
OUT.mkdir(parents=True,exist_ok=True); SRC.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
random.seed(41)

def mat(name,c,metal=0,emit=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1)
 p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.47
 if emit: p.inputs['Emission Color'].default_value=(*c,1); p.inputs['Emission Strength'].default_value=emit
 return m
steel=mat('Blue steel',(.12,.19,.23),.6); edge=mat('Worn steel',(.29,.36,.36),.7)
dark=mat('Graphite',(.027,.045,.056),.4); black=mat('Rubber',(.009,.017,.021))
orange=mat('Safety amber',(.9,.24,.025),.2); yellow=mat('Warning ochre',(.8,.53,.07),.2)
red=mat('Barrel red',(.48,.055,.035),.4); cyan=mat('Cold circuit',(.015,.7,.9),.2,3)
green=mat('Toxic core',(.25,.95,.07),.1,2.4); skin=mat('Mutant hide',(.17,.26,.12))
flesh=mat('Mutant membranes',(.33,.06,.1)); bone=mat('Chitin',(.45,.46,.25),.1)
armor=mat('Marine armour',(.13,.25,.29),.6); visor=mat('Marine visor',(.03,.65,.9),.4,1.7)
white=mat('Stencilled marking',(.74,.77,.65)); cloth=mat('Combat underlayer',(.035,.055,.057))
current=None; specs={}
def finish(o,name,m,bevel=0):
 o.name=name; o.data.materials.append(m)
 for c in list(o.users_collection): c.objects.unlink(o)
 current.objects.link(o)
 if bevel:
  b=o.modifiers.new('Machined bevel','BEVEL'); b.width=bevel; b.segments=1
  o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
 return o
def box(n,p,s,m,rot=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p); o=bpy.context.object; o.dimensions=s
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.rotation_euler.z=rot
 return finish(o,n,m,.018)
def sphere(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=p)
 o=bpy.context.object; o.scale=s
 for f in o.data.polygons: f.use_smooth=True
 return finish(o,n,m)
def cyl(n,p,r,d,m):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=d,location=p)
 return finish(bpy.context.object,n,m,.012)
def beam(n,a,b,r,m):
 d=Vector(b)-Vector(a); o=cyl(n,(Vector(a)+Vector(b))/2,r,d.length,m)
 o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); return o
def spike(n,a,b,r,m):
 d=Vector(b)-Vector(a); bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=r,radius2=.008,depth=d.length,location=(Vector(a)+Vector(b))/2)
 o=finish(bpy.context.object,n,m); o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); return o
def start(n,scale=4.4,target=.8,width=96,footprint=[1,1]):
 global current
 current=bpy.data.collections.new(n); bpy.context.scene.collection.children.link(current)
 specs[n]={'ortho':scale,'target':target,'displayWidth':width,'footprint':footprint}
def bolt(x,y,z): cyl('Bolt',(x,y,z),.045,.035,edge)
def stripe(p,size=(.12,.5,.025)): box('Hazard stripe',p,size,black,.35)

start('floor',3.12,-.04,106)
box('Deck',(0,0,-.04),(2,2,.08),dark)
for x in [-.75,-.25,.25,.75]:
 for y in [-.75,-.25,.25,.75]:
  box('Deck plate',(x,y,.005),(.485,.485,.025),steel)
  for k in range(3): box('Scuff',(x+random.uniform(-.16,.16),y+random.uniform(-.16,.16),.02),(.1,.009,.002),edge,random.random()*3)
for x in [-.85,.85]:
 for y in [-.85,.85]: bolt(x,y,.04)

start('wall',5.2,.85,144,[2, .35])
box('Wall base',(0,0,.12),(3.8,.7,.24),dark); box('Armoured wall',(0,0,1.05),(3.7,.5,1.7),steel)
box('Coping',(0,0,1.98),(3.95,.67,.21),edge)
for x in [-1.7,-.55,.55,1.7]:
 box('Vertical ribs',(x,.29,1.07),(.15,.1,1.65),dark)
 box('Rib inset',(x,.36,1.05),(.05,.025,.8),edge)
for x in [-1.2,0,1.2]:
 box('Amber lower warning',(x,.31,.42),(.75,.035,.17),yellow)
 for dx in [-.2,0,.2]: box('Warning bars',(x+dx,.334,.42),(.08,.012,.17),black,-.15)
 box('Panel line',(x,.274,1.5),(.75,.025,.04),edge)
# Runtime coordinates (x,y) correspond to Blender coordinates (y,x).
bpy.context.view_layer.update()
for obj in current.objects: obj.matrix_world=Matrix.Rotation(-math.pi/2,4,'Z')@obj.matrix_world

start('crate',3.3,.6,72)
box('Storage crate',(0,0,.6),(1.45,1.3,1.2),steel)
for x in [-.67,.67]:
 for y in [-.6,.6]: box('Reinforced corner',(x,y,.62),(.15,.15,1.3),dark)
for z in [.12,1.15]:
 box('Crate front brace',(0,.68,z),(1.5,.12,.15),edge)
 box('Crate side brace',(.77,0,z),(.12,1.3,.15),edge)
box('Seal',(0,.689,.63),(.35,.03,.32),orange); box('Identity label',(.3,.705,.87),(.4,.02,.1),white)
for y in [-.42,.42]: box('Lid rail',(0,y,1.25),(1.5,.16,.1),dark)

start('barrel',3,.55,58)
cyl('Explosive drum',(0,0,.58),.52,1.16,red)
for z in [.07,.28,.91,1.12]: cyl('Drum metal band',(0,0,z),.545,.065,dark)
cyl('Drum lid',(0,0,1.18),.49,.045,edge); cyl('Cap',(.24,.13,1.22),.075,.04,dark)
box('Warning label',(0,.515,.61),(.4,.025,.4),yellow)
for x in [-.12,.12]: box('Crossbones',(x,.535,.61),(.05,.025,.32),black,x*4)

start('terminal',3.9,.9,80)
box('Console footing',(0,0,.13),(1.4,1,.26),dark)
box('Armoured console',(0,0,.85),(1.2,.7,1.5),steel)
box('Display bezel',(0,.38,1.2),(1.13,.16,.75),dark)
box('Display glass',(0,.475,1.22),(.86,.025,.48),cyan)
for x in [-.27,0,.27]: box('Display telemetry',(x,.493,1.2),(.16,.018,.045),white)
box('Keyboard shelf',(0,.67,.72),(1.2,.6,.13),dark)
for x in [-.35,-.12,.12,.35]: box('Input keys',(x,.67,.8),(.13,.24,.03),edge)
for x in [-.46,.46]: cyl('Status LED',(x,.43,1.69),.055,.06,green)

start('generator',5.1,.95,120,[2,1.2])
box('Generator foundation',(0,0,.12),(3.1,1.9,.24),dark)
box('Generator block',(0,0,.95),(2.7,1.5,1.5),steel)
for x in [-1.15,1.15]:
 box('Armour bulkhead',(x,0,1),(.3,1.7,1.8),dark)
 for y in [-.7,.7]: bolt(x,y,1.92)
for x in [-.7,-.35,0,.35,.7]: box('Cooling fin',(x,.79,1.1),(.14,.1,1.2),edge)
for x in [-.8,0,.8]:
 cyl('Exhaust',(x,-.25,1.9),.2,.5,dark); cyl('Exhaust rim',(x,-.25,2.15),.23,.08,edge)
box('Power conduit',(0,0,1.75),(1.8,.3,.1),cyan)
box('Service placard',(.4,.855,.67),(.7,.03,.25),yellow)
for x in [.2,.4,.6]: stripe((x,.88,.67),(.08,.025,.26))

start('nest',4.4,.5,112)
sphere('Organic pool',(0,0,.1),(1.6,1.25,.16),flesh)
for i in range(11):
 a=i*math.tau/11; x=math.cos(a); y=math.sin(a)
 sphere('Incubation sack',(x*.95,y*.7,.38),(.4,.32,.48),skin)
 sphere('Toxic membrane',(x*1.03,y*.78,.55),(.18,.17,.23),green)
 spike('Defensive spur',(x*.9,y*.7,.38),(x*1.48,y*1.15,1.1),.15,bone)
sphere('Nest heart',(0,0,.65),(.77,.65,.8),flesh)
for x in [-.3,.3]: sphere('Bioluminescent organs',(x,.36,.94),(.22,.21,.4),green)

start('marine',3.3,.97,84)
for x,y in [(-.21,.08),(.21,-.12)]:
 box('Boot',(x,y+.1,.14),(.29,.46,.27),black); beam('Leg',(x,y,.22),(x,y,.83),.14,cloth)
 box('Shin guard',(x,y+.15,.48),(.23,.12,.35),armor)
sphere('Hip',(0,0,.83),(.4,.25,.2),dark); box('Torso armour',(0,0,1.2),(.7,.45,.65),armor)
box('Chest marking',(0,.24,1.29),(.15,.02,.22),orange)
box('Backpack',(0,-.32,1.2),(.55,.25,.55),dark)
for x in [-.43,.43]: sphere('Shoulder',(x,0,1.43),(.23,.27,.22),armor)
beam('Left forearm',(-.43,.07,1.33),(-.2,.65,1.17),.12,cloth)
beam('Right arm',(.43,.05,1.33),(.34,.51,1.09),.12,cloth)
box('Rifle',(.15,.6,1.18),(.25,.85,.18),dark); beam('Rifle barrel',(.15,.85,1.2),(.15,1.35,1.2),.05,edge)
box('Rifle muzzle',(.15,1.34,1.2),(.13,.12,.12),black)
sphere('Helmet',(0,.01,1.8),(.32,.3,.3),armor); box('Visor',(0,.285,1.8),(.47,.065,.14),visor)

def mutant(name,size,width,queen=False):
 start(name,4.5*size,.8*size,width)
 s=size
 sphere('Segmented abdomen',(0,-.22*s,.61*s),(.58*s,.8*s,.44*s),flesh)
 sphere('Chitin thorax',(0,.28*s,.79*s),(.67*s,.6*s,.53*s),skin)
 sphere('Armoured skull',(0,.78*s,.82*s),(.4*s,.42*s,.35*s),bone)
 for x in [-.23,.23]: sphere('Toxic eye',(x*s,1.05*s,.91*s),(.105*s,.12*s,.1*s),green)
 for side in [-1,1]:
  for j,y in enumerate([-.55,-.05,.43]):
   knee=(side*(.92+.1*j)*s,y*s,.49*s); foot=(side*(1.13+.12*j)*s,(y+.35)*s,.065*s)
   beam('Jointed leg',(side*.4*s,y*s,.62*s),knee,.11*s,skin); spike('Claw',knee,foot,.11*s,bone)
  spike('Mandible',(side*.27*s,1.0*s,.65*s),(side*.38*s,1.5*s,.45*s),.13*s,bone)
 for y in [-.7,-.15,.35]: spike('Dorsal spine',(0,y*s,.9*s),(0,(y-.2)*s,1.55*s),.15*s,bone)
 if queen:
  for side in [-1,1]:
   for k in range(3): spike('Royal crest',(side*.3*s,.3*s,1.1*s),(side*(.5+.25*k)*s,.1*s,(1.9-.2*k)*s),.17*s,flesh)
  for y in [-.8,-.4]: sphere('Egg organ',(0,y*s,.9*s),(.27*s,.3*s,.35*s),green)
mutant('crawler',.85,84); mutant('brute',1.2,112); mutant('queen',1.65,164,True)

# Eight authored headings retain 3D lighting and the origin anchor; no bitmap rotations.
for base in ['marine','crawler','brute','queen']:
 for heading in range(8):
  name=base+'_'+str(heading); col=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
  rotation=Matrix.Rotation(-heading*math.pi/4,4,'Z')
  for original in bpy.data.collections[base].objects:
   obj=original.copy(); col.objects.link(obj); obj.matrix_world=rotation@original.matrix_world
  specs[name]={**specs[base],'heading':heading,'facingRadians':heading*math.pi/4}
# World-Y wall shares exactly the same editable mesh data.
col=bpy.data.collections.new('wall_y'); bpy.context.scene.collection.children.link(col)
for original in bpy.data.collections['wall'].objects:
 obj=original.copy(); col.objects.link(obj); obj.matrix_world=Matrix.Rotation(math.pi/2,4,'Z')@original.matrix_world
specs['wall_y']={**specs['wall'],'footprint':[.35,2]}

def aim(o,p): o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for pos,power,color,size in [((-3,-4,7),850,(.73,.87,1),5),((4,4,6),1100,(1,.77,.5),4),((-4,4,3),400,(.28,.7,.9),3)]:
 bpy.ops.object.light_add(type='AREA',location=pos); l=bpy.context.object; l.data.energy=power; l.data.color=color; l.data.size=size; aim(l,(0,0,.7))
bpy.ops.object.camera_add(); camera=bpy.context.object; camera.data.type='ORTHO'
scene=bpy.context.scene; scene.camera=camera; scene.render.engine='CYCLES'; scene.cycles.samples=20; scene.cycles.use_denoising=False
scene.render.film_transparent=True; scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.image_settings.color_depth='8'
scene.render.resolution_percentage=100; scene.world.color=(.2,.2,.2); scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
metadata={'license':'CC0-1.0','original':True,'projection':'2:1 isometric; +x bottom right, +y bottom left','sprites':{}}
only=set(filter(None,os.environ.get('OUTBREAK_SPRITES','').split(',')))
for name,spec in specs.items():
 for n in specs: bpy.data.collections[n].hide_render=n!=name
 w,h=(256,128) if name=='floor' else (256,256)
 scene.render.resolution_x=w; scene.render.resolution_y=h
 target=Vector((0,0,spec['target'])); camera.location=target+Vector((7,7,math.sqrt(98)/math.sqrt(3))); camera.data.ortho_scale=spec['ortho']; aim(camera,target)
 bpy.context.view_layer.update(); anchor=world_to_camera_view(scene,camera,Vector((0,0,0)))
 path=OUT/(name+'.png'); scene.render.filepath=str(path)
 if not only or name in only: bpy.ops.render.render(write_still=True)
 metadata['sprites'][name]={'file':name+'.png','width':w,'height':h,'anchorX':round(anchor.x,6),'anchorY':round(1-anchor.y,6),'displayWidth':spec['displayWidth'],'footprint':spec['footprint'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 if 'heading' in spec: metadata['sprites'][name].update(heading=spec['heading'],facingRadians=spec['facingRadians'])
for n in specs:
 bpy.data.collections[n].hide_render=n not in ['floor','marine']
 bpy.data.collections[n].hide_viewport=n not in ['floor','marine']
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'outbreak.blend'),compress=True)
(OUT/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
(OUT/'metadata.js').write_text('window.OutbreakArt = '+json.dumps(metadata,separators=(',',':'))+';\n')
(OUT/'LICENSE.txt').write_text('Original procedural artwork for Last Frontier. Dedicated to the public domain under CC0 1.0 Universal. https://creativecommons.org/publicdomain/zero/1.0/\n')
(SRC/'README.md').write_text('# Outbreak isometric kit\n\nOriginal CC0 artwork, authored procedurally in Blender. No third-party meshes or textures. `outbreak.blend` uses Blender\'s native lossless compression and remains fully editable.\n\nRebuild with `blender -b --python app/scripts/create_outbreak_blender.py`. The source file contains one editable collection per sprite. Orthographic camera uses a 30° elevation for a true 2:1 diamond projection. `metadata.json` records the exact projected world-origin anchor, display size and sprite SHA256.\n')
print(json.dumps({'sprites':len(specs),'metadata':str(OUT/'metadata.json'),'blend':str(SRC/'outbreak.blend')}))
