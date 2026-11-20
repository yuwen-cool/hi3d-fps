# Blender headless: Hi3D 5M-tri GLB -> low-poly with new UVs + baked normal/baseColor/roughness. Proof + pipeline base.
# usage: blender -b --python bake_lowpoly.py -- <src.glb> <tag> <out_dir> <target_tris> <tex_size>
import bpy, sys, time, math
from mathutils import Vector
a=sys.argv[sys.argv.index('--')+1:]; src,tag,out=a[0],a[1],a[2]; target=int(a[3]); TS=int(a[4])
t0=time.time(); log=lambda *x: print('BAKE',round(time.time()-t0,1),*x,flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]; hi.name='hi'
hi.data.polygons.foreach_set('use_smooth',[True]*len(hi.data.polygons))
ntri=len(hi.data.polygons); log('high tris',ntri)
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); bpy.context.view_layer.objects.active=hi
bpy.ops.object.duplicate(); lo=bpy.context.view_layer.objects.active; lo.name='lo'
# weld UV-seam duplicates first so decimation doesn't tear along the fragmented atlas
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-6); bpy.ops.object.mode_set(mode='OBJECT')
m=lo.modifiers.new('dec','DECIMATE'); m.ratio=target/ntri; bpy.ops.object.modifier_apply(modifier='dec')
log('low tris',len(lo.data.polygons))
lo.data.polygons.foreach_set('use_smooth',[True]*len(lo.data.polygons))
while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003); bpy.ops.object.mode_set(mode='OBJECT'); log('uv done')
# low material with bake targets
mat=bpy.data.materials.new('lo_mat'); mat.use_nodes=True; nt=mat.node_tree; bsdf=nt.nodes['Principled BSDF']
lo.data.materials.clear(); lo.data.materials.append(mat)
def img(name,size,cs):
    im=bpy.data.images.new(f'{tag}_{name}',size,size,alpha=False); im.colorspace_settings.name=cs
    n=nt.nodes.new('ShaderNodeTexImage'); n.image=im; n.name=name; return im,n
imN,nN=img('normal',TS,'Non-Color'); imB,nB=img('base',TS,'sRGB'); imR,nR=img('rough',TS//2,'Non-Color'); imM,nM=img('metal',TS//2,'Non-Color')
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=2
try:
    pr=bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type='METAL'; pr.get_devices()
    for d in pr.devices: d.use=True
    sc.cycles.device='GPU'
except Exception as e: log('gpu setup failed',e)
size=max(hi.dimensions); b=sc.render.bake; b.use_selected_to_active=True; b.cage_extrusion=size*0.006; b.max_ray_distance=size*0.012; b.margin=8
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active=lo
def bake(kind,node,**kw):
    nt.nodes.active=node; bpy.ops.object.bake(type=kind,**kw); log('baked',kind)
bake('NORMAL',nN)
bake('DIFFUSE',nB,pass_filter={'COLOR'})
bake('ROUGHNESS',nR)
# metallic: route the high material's metallic input to emission and bake EMIT
hm=hi.data.materials[0]; hnt=hm.node_tree; hb=[n for n in hnt.nodes if n.type=='BSDF_PRINCIPLED'][0]
ml=hb.inputs['Metallic'].links
if ml:
    em=hnt.nodes.new('ShaderNodeEmission'); hnt.links.new(ml[0].from_socket,em.inputs['Color'])
    outn=[n for n in hnt.nodes if n.type=='OUTPUT_MATERIAL'][0]; old=outn.inputs['Surface'].links[0].from_socket
    hnt.links.new(em.outputs[0],outn.inputs['Surface']); bake('EMIT',nM); hnt.links.new(old,outn.inputs['Surface'])
for im,n in ((imN,'normal'),(imB,'base'),(imR,'rough'),(imM,'metal')):
    im.filepath_raw=f'{out}/{tag}_lo_{n}.png'; im.file_format='PNG'; im.save()
# wire low material
nm=nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nN.outputs[0],nm.inputs['Color']); nt.links.new(nm.outputs[0],bsdf.inputs['Normal'])
nt.links.new(nB.outputs[0],bsdf.inputs['Base Color']); nt.links.new(nR.outputs[0],bsdf.inputs['Roughness']); nt.links.new(nM.outputs[0],bsdf.inputs['Metallic'])
# side-by-side renders (same camera): high vs low
sc.render.engine='BLENDER_EEVEE'; sc.render.resolution_x=1600; sc.render.resolution_y=900; sc.view_settings.view_transform='AgX'
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.35,0.36,0.38,1)
sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sun.data.energy=4; sun.rotation_euler=(math.radians(55),0,math.radians(120)); sc.collection.objects.link(sun)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.lens=60; cam.data.clip_start=0.005
bb=[hi.matrix_world@Vector(c) for c in hi.bound_box]; mn=Vector([min(v[i] for v in bb) for i in range(3)]); mx=Vector([max(v[i] for v in bb) for i in range(3)]); ctr=(mn+mx)/2; L=max(mx-mn)
views={'side':(Vector((1,0.15,0.15)),0.45,Vector((0,0.05,0))*L),'fps':(Vector((0.35,1.0,0.45)),0.75,Vector((0,0.1,0.05))*L)} if tag=='rifle' else {'chest':(Vector((0.35,-1,0.1)),0.55,Vector((0,0,0.22))*L)}
for vn,(d,dist,off) in views.items():
    tgt=ctr+off; cam.location=tgt+d.normalized()*L*dist; cam.rotation_euler=(tgt-cam.location).to_track_quat('-Z','Y').to_euler()
    for o,nm_ in ((hi,'hi'),(lo,'lo')):
        hi.hide_render=(o is not hi); lo.hide_render=(o is not lo)
        sc.render.filepath=f'{out}/{tag}_bake_{vn}_{nm_}.png'; bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{out}/{tag}_lo.glb',use_selection=True,export_format='GLB',export_image_format='JPEG')
log('DONE')
