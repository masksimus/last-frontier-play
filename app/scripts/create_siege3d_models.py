"""Original articulated siege characters. Blender 4.3+, no external assets.

Run: blender -b -t 2 --python app/scripts/create_siege3d_models.py
Authoring: +X forward, +Z up. glTF export converts up to +Y.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'
SOURCE = ROOT / 'art-source/siege3d'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0

def material(name, color, metal=0, rough=.45, glow=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if glow:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=glow
    return m

def weight(obj, bone, mat):
    obj.data.materials.append(mat)
    g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    for face in obj.data.polygons:face.use_smooth=True
    pieces.append(obj)
    return obj

def ell(name,pos,scale,mat,bone,segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return weight(o,bone,mat)

def box(name,pos,size,mat,bone,bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return weight(o,bone,mat)

def rod(name,a,b,r,mat,bone,r2=None,sides=10):
    d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=sides,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(Vector(a)+Vector(b))/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    return weight(o,bone,mat)

def make(kind):
    global pieces
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    pieces=[];marine=kind=='marine';boss=kind=='queen';heavy=kind in ('brute','queen');armed=marine or heavy
    scale=1 if marine else 1.04 if kind=='crawler' else 1.38 if kind=='brute' else 2.42
    armor=material('Ceramic blue steel' if marine else 'Burnished iron',(.045,.105,.15) if marine else (.085,.075,.068),.78,.31)
    dark=material('Graphite joints',(.018,.026,.032),.5,.62)
    trim=material('Scuffed edge metal',(.25,.31,.34),.88,.3)
    flesh=material('Mutant muscle',(.35,.095,.077),.05,.58)
    light=material('Amber visor' if marine else 'Red reactor', (1,.26,.025) if marine else (1,.012,.006),.2,.23,3.5)
    tooth=material('Bone and claws',(.47,.36,.24),.12,.4)
    brass=material('Ammunition',(.55,.31,.09),.8,.28)
    suit=dark if marine else flesh
    # Rest-pose joints. Every piece is rigidly weighted to a real armature bone.
    bones=[('root',(0,0,0),(0,0,.12),None),('hips',(0,0,.82),(0,0,1.03),'root'),('spine',(0,0,1.03),(0,0,1.48),'hips'),('head',(0,0,1.48),(0,0,1.8),'spine')]
    for side,y in [('L',-.22),('R',.22)]:
        bones += [('thigh_'+side,(0,y,.91),(.08,y,.49),'hips'),('shin_'+side,(.08,y,.49),(0,y,.12),'thigh_'+side),('foot_'+side,(0,y,.12),(.25,y,.1),'shin_'+side)]
        shoulder=(0,y*1.65,1.42);elbow=(.26,y*1.85,1.12);hand=(.53,y*.8,1.22) if armed else (.43,y*2.15,.76)
        bones += [('upperarm_'+side,shoulder,elbow,'spine'),('forearm_'+side,elbow,hand,'upperarm_'+side),('hand_'+side,hand,(hand[0]+.16,hand[1],hand[2]),'forearm_'+side)]
    bones += [('weapon',(.45,0,1.24),(.95,0,1.24),'spine')]
    bpy.ops.object.armature_add(enter_editmode=True);rig=bpy.context.object;rig.name=kind+'_rig'
    rig.data.edit_bones.remove(rig.data.edit_bones[0]);created={}
    for name,a,b,parent in bones:
        bone=rig.data.edit_bones.new(name);bone.head=a;bone.tail=b
        if parent:bone.parent=created[parent]
        created[name]=bone
    bpy.ops.object.mode_set(mode='OBJECT')
    ell('Pelvis',(0,0,.96),(.22,.3,.2),suit,'hips')
    ell('Chest',(0,0,1.32),(.25,.35 if marine else .43,.34),suit,'spine')
    box('Breastplate',(.19,0,1.36),(.15,.57,.39),armor,'spine',.055)
    for y in [-.2,.2]:
        box('Chest layered plate',(.28,y,1.39),(.07,.19,.25),armor,'spine',.025)
        box('Belt pouch',(.19,y,.98),(.15,.16,.14),dark,'hips',.015)
        for z in [1.25,1.34,1.43]:box('Plate rivet',(.324,y,z),(.025,.037,.025),trim,'spine',.005)
    for z in [1.06,1.12]:box('Abdominal laminate',(.2,0,z),(.12,.36,.055),trim,'hips',.012)
    box('Backpack',(-.25,0,1.33),(.2,.43,.45),armor,'spine',.045)
    for y in [-.27,.27]:
        rod('Reactor bottle',(-.25,y,1.15),(-.25,y,1.61),.065,trim,'spine')
        rod('Luminous tube',(-.25,y,1.32),(-.25,y,1.55),.048,light,'spine')
    ell('Helmet or skull',(.035,0,1.69),(.23,.23,.24),armor if marine else flesh,'head',16,10)
    box('Jaw guard',(.18,0,1.57),(.13,.32,.13),armor,'head',.025)
    if marine:
        box('Helmet brow',(.18,0,1.79),(.18,.41,.09),armor,'head',.025)
        ell('Visor',(.222,0,1.715),(.038,.18,.064),light,'head')
        for y in [-.23,.23]:ell('Helmet comm',(.01,y,1.68),(.09,.035,.09),trim,'head')
    else:
        for y in [-.1,.1]:ell('Burning eye',(.24,y,1.74),(.04,.05,.05),light,'head')
        for i in range(7):
            y=(i-3)*.038;rod('Fang',(.25,y,1.62),(.28,y,1.52),.025,tooth,'head',0,7)
        for y in [-.18,.18]:rod('Cranial thorn',(-.04,y,1.81),(-.17,y*1.7,2.0),.055,trim,'head',0,7)
        ell('Reactor core',(.31,0,1.35),(.075,.12,.12),light,'spine')
    for side,y in [('L',-.22),('R',.22)]:
        thigh='thigh_'+side;shin='shin_'+side;foot='foot_'+side;upper='upperarm_'+side;fore='forearm_'+side;handbone='hand_'+side
        ell('Thigh muscle',(.025,y,.71),(.145,.16,.27),suit,thigh)
        box('Thigh guard',(.145,y,.73),(.12,.25,.29),armor,thigh,.03)
        ell('Knee joint',(.09,y,.47),(.14,.15,.13),dark,shin)
        ell('Kneepad',(.19,y,.48),(.085,.13,.13),armor,shin)
        ell('Shin',(.01,y,.3),(.11,.125,.21),suit,shin)
        box('Shin splint',(.115,y,.29),(.10,.19,.29),armor,shin,.025)
        box('Boot',(.11,y,.10),(.39,.28,.19),dark,foot,.035)
        box('Toe armor',(.26,y,.14),(.16,.29,.11),armor,foot,.025)
        for x in [-.01,.10,.21]:box('Boot tread',(x,y,.025),(.065,.3,.028),trim,foot,.005)
        # Armed mutants brace the receiver with both hands. Their rest-pose
        # skeleton and weighted forearm meshes must use the same grip position.
        sy=y*1.65;ey=y*1.85;hy=y*.8 if armed else y*2.15;hz=1.22 if armed else .76
        ell('Shoulder',(-.005,sy,1.44),(.22,.21,.22),suit,upper)
        ell('Pauldron',(-.025,sy,1.51),(.24,.23,.17),armor,upper)
        box('Shoulder light',(.16,sy,1.51),(.055,.10,.07),light,upper,.012)
        rod('Upper arm',(0,sy,1.38),(.26,ey,1.12),.12,suit,upper)
        ell('Elbow',(.26,ey,1.12),(.12,.13,.12),dark,fore)
        rod('Forearm',(.26,ey,1.12),(.53,hy,hz),.12,suit,fore)
        box('Bracer',(.4,(ey+hy)/2,(1.12+hz)/2),(.22,.22,.17),armor,fore,.025)
        ell('Hand',(.53,hy,hz),(.13,.1,.08),dark if marine else flesh,handbone)
        for i in range(3):
            yy=hy+(i-1)*.06
            rod('Finger',(.56,yy,hz),(.7,yy,hz-.025),.025,dark if marine else flesh,handbone,sides=7)
            if not marine:rod('Claw',(.68,yy,hz-.02),(.78,yy,hz-.13),.028,tooth,handbone,0,7)
        if not marine:
            for i in range(3):rod('Shoulder spike',(-.07+i*.10,sy,1.62),(-.16+i*.10,sy*1.22,1.86),.05,trim,upper,0,7)
    # Weapon construction is aligned to the actual firing socket, not the torso.
    muzzle_x=1.36 if marine else 1.54
    if armed:
        box('Receiver',(.7,0,1.25),(.61,.13 if marine else .25,.17),dark,'weapon',.018)
        box('Stock',(.36,0,1.25),(.28,.12,.17),armor,'weapon',.018)
        box('Magazine',(.62,0,1.08),(.13,.11,.25),dark,'weapon',.012)
        box('Top rail',(.79,0,1.36),(.5,.10,.035),trim,'weapon',.005)
        for x in [.56,.66,.76,.86,.96]:box('Rail tooth',(x,0,1.39),(.04,.13,.025),dark,'weapon',.004)
        if marine:
            rod('Barrel',(.92,0,1.26),(1.33,0,1.26),.035,trim,'weapon')
            rod('Muzzle brake',(1.27,0,1.26),(muzzle_x,0,1.26),.052,dark,'weapon')
            box('Sight',(.86,0,1.43),(.13,.09,.09),dark,'weapon',.012)
            for y in [-.071,.071]:box('Receiver indicator',(.69,y,1.27),(.10,.008,.025),light,'weapon',.003)
        else:
            for i in range(6):
                a=i*math.tau/6;yy=math.cos(a)*.105;zz=1.26+math.sin(a)*.105
                rod('Minigun barrel',(.75,yy,zz),(muzzle_x,yy,zz),.032,trim,'weapon',sides=8)
            for x in [.95,1.38]:rod('Barrel collar',(x,0,1.26),(x+.08,0,1.26),.16,dark,'weapon',sides=12)
        for i in range(8):rod('Belt round',(.36,-.18-i*.025,1.19-i*.018),(.48,-.18-i*.025,1.19-i*.018),.018,brass,'spine',sides=7)
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces:o.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=kind+'_body'
    mesh.parent=rig;mod=mesh.modifiers.new('Articulated skeleton','ARMATURE');mod.object=rig
    # Scale the rig, mesh and socket together in a root transform.
    root=bpy.data.objects.new(kind,None);bpy.context.collection.objects.link(root);rig.parent=root;root.scale=(scale,scale,scale)
    socket=bpy.data.objects.new('muzzle',None);bpy.context.collection.objects.link(socket);socket.parent=rig;socket.parent_type='BONE';socket.parent_bone='weapon' if armed else 'head'
    # Bone parenting uses the tail as origin; apply a world-space inverse for a stable authored socket.
    bpy.context.view_layer.update();socket.matrix_world.translation=Vector((muzzle_x if armed else .3,0,1.26 if armed else 1.65))*scale
    socket['forward_axis']='+X'
    rig.animation_data_create()
    for clip in ['idle','walk','fire','reload','death']:
        action=bpy.data.actions.new(clip);rig.animation_data.action=action
        for pb in rig.pose.bones:pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
        for frame in range(0,25,3):
            t=frame/24;phase=t*math.tau
            for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
            if clip=='idle':rig.pose.bones['spine'].rotation_euler.z=math.sin(phase)*.025
            if clip=='walk':
                for side,sign in [('L',1),('R',-1)]:
                    stride=math.sin(phase)*sign
                    rig.pose.bones['thigh_'+side].rotation_euler.z=stride*.48
                    rig.pose.bones['shin_'+side].rotation_euler.z=max(0,-stride)*.7
                    rig.pose.bones['foot_'+side].rotation_euler.z=-stride*.17
                    if not armed:rig.pose.bones['upperarm_'+side].rotation_euler.z=-stride*.23
                rig.pose.bones['hips'].location.y=abs(math.sin(phase))*.04
            if clip=='fire':rig.pose.bones['weapon'].location.x=-math.exp(-t*10)*.085;rig.pose.bones['spine'].rotation_euler.z=math.exp(-t*10)*.045
            if clip=='reload':rig.pose.bones['weapon'].rotation_euler.z=math.sin(t*math.pi)*.35;rig.pose.bones['forearm_L'].rotation_euler.z=-math.sin(t*math.pi)*.55
            if clip=='death':rig.pose.bones['root'].rotation_euler.z=t*1.35;rig.pose.bones['root'].location.y=-t*.65
            for pb in rig.pose.bones:
                pb.keyframe_insert('rotation_euler',frame=frame);pb.keyframe_insert('location',frame=frame)
        track=rig.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action)
    rig.animation_data.action=None
    for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
    bpy.context.scene.frame_set(0)
    path=OUT/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_apply=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(kind+'.blend')))
    mesh.data.calc_loop_triangles()
    data=path.read_bytes()
    return {'name':kind,'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':len(mesh.data.loop_triangles),'bones':len(rig.data.bones),'animations':['idle','walk','fire','reload','death'],'heightMeters':1.95*scale,'license':'CC0-1.0','authoringForward':'+X','authoringUp':'+Z','runtimeUp':'+Y'}

records=[make(kind) for kind in ['marine','crawler','brute','queen']]
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'generator':'Blender 4.3 procedural original geometry','models':records},indent=2))
(OUT/'LICENSE.txt').write_text('Original procedural character geometry and animation created for Last Frontier. Dedicated to the public domain under CC0 1.0 Universal. https://creativecommons.org/publicdomain/zero/1.0/\n')
(SOURCE/'provenance.json').write_text(json.dumps({'source':'scripts/create_siege3d_models.py','externalAssets':False,'paidGeneration':False,'reference':'User supplied industrial siege composition; original geometry authored procedurally.','models':records},indent=2))
print(json.dumps(records))
