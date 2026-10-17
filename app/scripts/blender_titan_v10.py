"""Generate an original textured biomechanical Siege Titan for Последний рубеж.
Use: blender -b -t 2 --python app/scripts/blender_titan_v10.py -- --output app/assets/models/Siege_Titan_HD.glb
All geometry is original procedural hard-surface design; material images from
generate_titan_pbr.py. No screenshot/card/background substitution.
"""
import bpy,math,sys,argparse,random
from pathlib import Path
from mathutils import Vector
R=random.Random(7312)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--textures',default='app/assets/generated/titan');ap.add_argument('--blend',default='')
cfg=ap.parse_args(args)
out=Path(cfg.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
textures=Path(cfg.textures).resolve()
assert (textures/'armor_albedo.jpg').is_file(), 'Generate PBR maps first'
groups={}
def material(name,base,met,rough,emission=None,tex=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*base,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF')
 bs.inputs['Base Color'].default_value=(*base,1)
 bs.inputs['Metallic'].default_value=met
 bs.inputs['Roughness'].default_value=rough
 if emission:
  bs.inputs['Emission'].default_value=(*emission,1)
  bs.inputs['Emission Strength'].default_value=3.5
 if tex:
  nodes=m.node_tree.nodes;links=m.node_tree.links
  al=nodes.new('ShaderNodeTexImage')
  al.image=bpy.data.images.load(str(textures/(tex+'_albedo.jpg')),check_existing=True)
  links.new(al.outputs['Color'],bs.inputs['Base Color'])
  ro=nodes.new('ShaderNodeTexImage')
  ro.image=bpy.data.images.load(str(textures/(tex+'_roughness.png')),check_existing=True)
  ro.image.colorspace_settings.name='Non-Color'
  links.new(ro.outputs['Color'],bs.inputs['Roughness'])
  nm=nodes.new('ShaderNodeTexImage')
  nm.image=bpy.data.images.load(str(textures/(tex+'_normal.png')),check_existing=True)
  nm.image.colorspace_settings.name='Non-Color'
  normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.6
  links.new(nm.outputs['Color'],normal.inputs['Color'])
  links.new(normal.outputs['Normal'],bs.inputs['Normal'])
 return m
ARMOR=material('PBR__Graphite_Armour',(0.25,.32,.37),.75,.32,tex='armor')
EDGE=material('PBR__Machined_Titanium',(.50,.56,.62),.88,.22,tex='steel')
FLESH=material('PBR__Mutant_Organic',(0.54,.29,.27),.09,.67,tex='flesh')
DARK=material('PBR__Oil_Steel',(.07,.10,.14),.6,.55,tex='steel')
ORANGE=material('PBR__Emissive_Forge',(.98,.23,.06),.13,.37,(1,.07,.01))
RED=material('PBR__Emissive_Scanners',(.92,.03,.02),.08,.29,(1,.015,.004))
BLUE=material('PBR__Electric_Blue',(.05,.45,.88),.3,.4,(.02,.45,1))
RUBBER=material('PBR__Industrial_Rubber',(.045,.048,.05),.03,.94)
PALETTE=[ARMOR,EDGE,FLESH,DARK,ORANGE,RED,BLUE,RUBBER]
def pivot(name,loc=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
 o.empty_display_type='PLAIN_AXES';o.location=loc
 if parent:o.parent=parent
 return o
ROOT=pivot('ROOT_GAME_ASSET');TORSO=pivot('TORSO',parent=ROOT)
ARM_L=pivot('ARM_L',(-1.39,0,3.65),ROOT);ARM_R=pivot('ARM_R',(1.39,0,3.65),ROOT)
LEG_L=pivot('LEG_L',(-.84,0,1.65),ROOT);LEG_R=pivot('LEG_R',(.84,0,1.65),ROOT)
HEAD=pivot('HEAD',(0,-.04,4.32),ROOT)
CANNON=pivot('CANNON_R',(1.67,-.45,3.16),ARM_R)
def assign(o,name,mat,parent):
 o.name=name;o.data.materials.append(mat)
 if parent:
  bpy.context.view_layer.update()
  m=o.matrix_world.copy()
  o.parent=parent
  o.matrix_world=m
 groups.setdefault((parent.name if parent else 'Root',mat.name),[]).append(o)
 return o
def bevel(o,amount=.035,segments=2):
 if amount<=0:return
 mod=o.modifiers.new('Machined_rounded_joins','BEVEL');mod.width=amount;mod.segments=segments
 bpy.context.view_layer.objects.active=o
 try:bpy.ops.object.modifier_apply(modifier=mod.name)
 except Exception:pass
def block(name,xyz,dims,mat,parent=TORSO,rounding=.03,rot=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz)
 o=bpy.context.object;o.dimensions=dims;o.rotation_euler[2]=rot
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel(o,min(rounding,min(dims)*.18))
 return assign(o,name,mat,parent)
def ball(name,xyz,dims,mat,parent=TORSO,sub=2):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=xyz)
 o=bpy.context.object;o.scale=dims
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return assign(o,name,mat,parent)
def cylinder(name,a,b,radius,mat,parent=TORSO,verts=12,r2=None):
 a,b=Vector(a),Vector(b)
 v=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=radius,radius2=radius if r2 is None else r2,depth=v.length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_mode='QUATERNION'
 o.rotation_quaternion=Vector((0,0,1)).rotation_difference(v)
 bevel(o,min(.015,radius*.07),1)
 return assign(o,name,mat,parent)
def torus(name,pos,major,minor,mat,parent=TORSO,rotate=(0,0,0)):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=7,location=pos,rotation=rotate,major_radius=major,minor_radius=minor)
 return assign(bpy.context.object,name,mat,parent)
# Anatomical silhouette: thick organic chest, sloping shoulders and crouched legs.
ball('Mutant_Ribcage',(0,0,2.75),(1.23,.83,1.31),FLESH,TORSO,3)
ball('Abdomen_Carbon',(0,.15,1.94),(.96,.69,.63),DARK,TORSO,2)
ball('Spinal_Armor',(0,.73,3.05),(.89,.30,1.10),ARMOR,TORSO,2)
for sign in (-1,1):
 ball('Oblique_Flesh',(sign*.83,-.13,2.8),(.57,.63,.87),FLESH,TORSO,2)
 ball('Shoulder_Organic',(sign*1.43,.02,3.58),(.74,.75,.81),FLESH,TORSO,2)
 block('Chest_Armour_V',(sign*.47,-.71,3.25),(.85,.17,.8),ARMOR,TORSO,.10,rot=sign*-.12)
 for i in range(4):
  block('Lower_Rib'+str(i),(sign*(.42+i*.14),-.69+i*.055,2.77-i*.2),(.65-i*.09,.11,.14),EDGE,TORSO,.018,rot=sign*.08)
 for i in range(3):
  ball('Muscle_Braid',(sign*.98,-.65,2.97-i*.23),(.18,.24,.18),FLESH,TORSO,1)
 # Shoulder armor comprised of overlapping separate curved plates.
 for i in range(5):
  theta=-.6+i*.32
  x=sign*(1.26+math.sin(theta)*.31)
  y=-.16-.57*math.cos(theta)
  block('Shoulder_Plate', (x,y,3.77-i*.15),(.70,.28,.47),ARMOR,TORSO,.095,rot=sign*theta*.31)
 # Fasteners (actual geometry; visible shiny edges)
 for i in range(4):
  ball('Tungsten_Stud',(sign*(1.01+i*.15),-.87,3.57-i*.19),(.055,.055,.055),EDGE,TORSO,1)
for i in range(7):
 x=(i-3)*.19
 block('Spine_Bony_Plate',(x,.72,3.95-abs(x)*.32),(.18,.29,.5),ARMOR,TORSO,.07)
for z in (2.45,2.82,3.2,3.57):
 torus('Core_Pulsing_Collar',(0,-.85,z),.28,.048,RED,TORSO,rotate=(math.pi/2,0,0))
 ball('Central_Organic_Heart',(0,-.90,z),(.12,.12,.12),ORANGE,TORSO,1)
# Terrifying angular skull and jaw.
ball('Head_Flesh',(0,-.3,4.4),(.6,.48,.55),FLESH,HEAD,3)
block('Skull_Armour',(0,-.36,4.69),(1.25,.8,.42),ARMOR,HEAD,.12)
block('Jaw_Plating',(0,-.73,4.11),(1.08,.43,.27),DARK,HEAD,.045)
block('Demon_Mouth',(0,-.965,4.25),(.81,.05,.22),RED,HEAD,.01)
for sign in (-1,1):
 ball('Fiery_Optic',(sign*.29,-.775,4.56),(.14,.11,.09),RED,HEAD,2)
 block('Brow_Ridge',(sign*.36,-.78,4.74),(.52,.19,.15),ARMOR,HEAD,.03,rot=sign*.13)
 for i in range(3):
  cylinder('Chin_Teeth',(sign*(.12+i*.14),-.98,4.32),(sign*(.12+i*.14),-1.0,4.16),.046,EDGE,HEAD,6,r2=.001)
 # Huge throat bio-cables to chest.
 for i in range(3):
  ball('Cervical_Sacs',(sign*(.45+i*.12),-.3,4.11-i*.16),(.19,.25,.16),FLESH,HEAD,1)
# Three-segment mechanical digitigrade legs, articulated via empty nodes.
for sign,piv in [(-1,LEG_L),(1,LEG_R)]:
 ball('Thigh_Bundle',(sign*.9,-.04,1.6),(.46,.50,.64),FLESH,piv,2)
 block('Thigh_Armour',(sign*.9,-.5,1.55),(.73,.29,.72),ARMOR,piv,.07)
 ball('Knee_Hinge',(sign*.87,-.24,1.1),(.31,.32,.32),EDGE,piv,1)
 block('Lower_Leg_Plate',(sign*.92,-.37,.71),(.61,.64,.82),ARMOR,piv,.075)
 block('Foot_Bracer',(sign*.92,-.67,.29),(.74,.98,.4),DARK,piv,.06)
 for j in range(3):
  block('Crawl_Claw',(sign*.92+(j-1)*.17,-1.17,.12),(.14,.38,.18),EDGE,piv,.02)
 for j in range(4):
  ball('Knee_LED',(sign*.9,-.71,1.23+(j-1)*.13),(.064,.06,.045),RED,piv,1)
# Heavy asymmetrical shoulders/arms (can swing at runtime).
for sign,piv in [(-1,ARM_L),(1,ARM_R)]:
 ball('Triceps_Organic',(sign*1.5,-.1,3.12),(.62,.63,.66),FLESH,piv,2)
 block('Arm_Armoured_Carapace',(sign*1.56,-.58,3.2),(.81,.38,.96),ARMOR,piv,.08)
 block('Forearm_Gauntlet',(sign*1.69,-.66,2.42),(.86,.86,1.1),DARK,piv,.10)
 for j in range(4):
  block('Bicep_Armour_Rib',(sign*(1.45+j*.1),-.88,3.31-j*.15),(.14,.12,.32),EDGE,piv,.015)
 for j in range(3):
  cylinder('Elbow_Hydraulic',(sign*(1.28+j*.19),-.25,3.37),(sign*(1.32+j*.18),-.25,2.42),.06,EDGE,piv,8)
 # Giant three-pronged metal claw on left, cannon on right.
 if sign<0:
  for i in range(3):
   x=-1.7+(i-1)*.24
   cylinder('Claw_Hydraulic_Base',(x,-.65,2.05),(x,-1.06,1.56),.12,DARK,piv,9,r2=.055)
   cylinder('Claw_Iron_Fang',(x,-1.06,1.56),(x,-1.29,1.2),.075,EDGE,piv,8,r2=.008)
 else:
  ball('Energy_Reactor_Bicep',(1.79,-.92,2.71),(.43,.18,.39),RED,piv,2)
# Heroic-level rotary cannon on boss right arm, offset in front of torso.
cylinder('Cannon_Casing',(1.85,-.95,2.80),(1.85,-2.25,2.80),.43,ARMOR,CANNON,18)
cylinder('Cannon_Armoured_Sleeve',(1.85,-1.55,2.8),(1.85,-2.46,2.8),.35,DARK,CANNON,18)
for k in range(6):
 a=2*math.pi*k/6
 x=1.85+math.cos(a)*.23;z=2.80+math.sin(a)*.23
 cylinder('Rotary_Heavy_Barrel',(x,-1.2,z),(x,-3.35,z),.083,EDGE,CANNON,10)
 ball('Muzzle_Flash_Emitter',(x,-3.34,z),(.082,.04,.082),ORANGE,CANNON,1)
for y in (-1.15,-1.9,-2.6,-3.2):
 torus('Barrel_Band',(1.85,y,2.8),.41,.055,ARMOR,CANNON,rotate=(math.pi/2,0,0))
torus('Red_Muzzle_Gate',(1.85,-3.4,2.8),.36,.085,RED,CANNON,rotate=(math.pi/2,0,0))
for j in range(5):
 ball('Cannon_Cooling_Lights',(1.46+j*.19,-1.64,3.22),(.065,.07,.07),RED,CANNON,1)
# Additional high-frequency surface detail: lines of bolts, glowing coils and wires.
for sign in (-1,1):
 for j in range(14):
  angle=j*math.tau/14
  pos=(sign*(1.35+math.cos(angle)*.48),-.35+math.sin(angle)*.3,3.6)
  ball('Micro_Rivet',pos,(.044,.044,.044),EDGE,TORSO,1)
 for j in range(6):
  x=sign*(.31+j*.16)
  block('Chest_Cable_Warning',(x,-.89,3.06),(.09,.08,.23),ORANGE,TORSO,.016)
for j in range(26):
 angle=j*math.tau/26
 pos=(math.cos(angle)*1.08,-.82,2.92+math.sin(angle)*.86)
 ball('Chest_Tech_Stud',pos,(.04,.04,.04),EDGE,TORSO,1)
# Stiffen muzzle and eyes with specular bolts, no runtime shader compilation.
bpy.context.view_layer.update()
# Group static meshes into one mesh per material and articulated parent to keep draw calls sane.
merged_groups=0
for (parentname,matname),objects in list(groups.items()):
 if len(objects)<2:continue
 for o in bpy.context.selected_objects:o.select_set(False)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.object.join()
 objects[0].name='BATCH_'+parentname+'__'+matname
 merged_groups+=1
bpy.ops.object.select_all(action='DESELECT')
# Models export with source PBR texture assets embedded directly into .glb.
bpy.context.scene.render.engine='BLENDER_EEVEE'
bpy.context.scene.world.color=(.07,.1,.14)
bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=False,export_animations=False,export_materials='EXPORT',export_texcoords=True,export_normals=True)
assert out.stat().st_size>10000
print('Generated ORIGINAL PBR SIEGE TITAN',out,out.stat().st_size,'bytes; merged material groups',merged_groups)
