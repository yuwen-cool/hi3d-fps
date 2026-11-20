# Blender headless: import a Hi3D GLB, report topology, render close-ups under neutral light.
import bpy, sys, time, math, numpy as np
from mathutils import Vector
src, tag, out = sys.argv[sys.argv.index('--')+1:][:3]
t0=time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
me=ob.data
print('IMPORT', round(time.time()-t0,1),'s verts',len(me.vertices),'tris',len(me.polygons))
# connected components (numpy label propagation over edges, after position-weld)
co=np.empty(len(me.vertices)*3,dtype=np.float32); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
q=np.round(co*200000).astype(np.int64); _,inv=np.unique(q,axis=0,return_inverse=True)
ed=np.empty(len(me.edges)*2,dtype=np.int32); me.edges.foreach_get('vertices',ed); ed=inv[ed].reshape(-1,2)
n=inv.max()+1; lab=np.arange(n)
for it in range(400):
    m=np.minimum(lab[ed[:,0]],lab[ed[:,1]]); new=lab.copy()
    np.minimum.at(new,ed[:,0],m); np.minimum.at(new,ed[:,1],m); new=new[new]
    if np.array_equal(new,lab): break
    lab=new
u,c=np.unique(lab,return_counts=True)
print('WELDED_VERTS',n,'COMPONENTS',len(u),'largest',sorted(c.tolist(),reverse=True)[:12],'iters',it)
bb=[ob.matrix_world@Vector(b) for b in ob.bound_box]
mn=Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb))); mx=Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb)))
print('BBOX',[round(x,3) for x in mn],[round(x,3) for x in mx])
for p in me.polygons[:1]: pass
me.polygons.foreach_set('use_smooth',[True]*len(me.polygons))
sc=bpy.context.scene; sc.render.engine='BLENDER_EEVEE'; sc.render.resolution_x=1600; sc.render.resolution_y=900
sc.view_settings.view_transform='AgX'
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.35,0.36,0.38,1); w.node_tree.nodes['Background'].inputs[1].default_value=0.9
sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sun.data.energy=4; sun.data.angle=0.15; sun.rotation_euler=(math.radians(50),0,math.radians(35)); sc.collection.objects.link(sun)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.lens=60; cam.data.clip_start=0.005
ctr=(mn+mx)/2; size=(mx-mn)
def shot(name,target,dirv,dist):
    cam.location=target+Vector(dirv).normalized()*dist
    d=(target-cam.location); cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'{out}/{tag}_{name}.png'; bpy.ops.render.render(write_still=True)
L=max(size)
ax=max(range(3),key=lambda i:size[i])
if tag=='rifle':
    side=Vector((1,0,0)) if ax!=0 else Vector((0,-1,0))
    shot('full',ctr,side+Vector((0,0,0.15)) if ax!=2 else side,L*1.9)
    for k,f in (('front',0.28),('mid',0.5),('rear',0.72)):
        t=mn.copy(); t=mn+Vector([size[i]*(f if i==ax else 0.55) for i in range(3)])
        shot('close_'+k,t,side+Vector((0.0,0.25,0.2)) if ax==2 else side+Vector((0.2,0.2,0.2)),L*0.42)
else:
    up=max(range(3),key=lambda i:size[i]); front=Vector((0,-1,0))
    shot('full',ctr,front+Vector((0.3,0,0.1)),L*2.4)
    for k,f in (('head',0.9),('chest',0.72),('legs',0.3)):
        t=ctr.copy(); t[up]=mn[up]+size[up]*f
        shot('close_'+k,t,front+Vector((0.35,0,0.1)),L*0.55)
# dump downsized textures
for img in bpy.data.images:
    if img.size[0]>0:
        nm='base' if 'base' in img.name.lower() or img.colorspace_settings.name=='sRGB' else 'orm'
        img.scale(2048,2048); img.filepath_raw=f'{out}/{tag}_tex_{nm}_{img.name[:12]}.png'; img.file_format='PNG'; img.save()
print('DONE',round(time.time()-t0,1))
