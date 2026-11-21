# Blender headless bake: Hi3D high-poly GLB -> low-poly + raw baked maps.
# usage: blender -b --python bake.py -- <src.glb> <out_dir> <target_tris> <tex_size> [--rigid]
# writes: low.glb (geometry+UV only), tex_normal.png, tex_onormal.png (object space), tex_base.png,
#         tex_rough.png, tex_metal.png, tex_ao.png, bake.json
import bpy, sys, time, math, json, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out, target, TS = a[0], a[1], int(a[2]), int(a[3])
os.makedirs(out, exist_ok=True)
t0 = time.time(); info = {}
def log(*x): print('BAKE', round(time.time() - t0, 1), *x, flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]; hi.name = 'hi'
# apply any import transform so object space == world space
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); bpy.context.view_layer.objects.active = hi
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
hi.data.polygons.foreach_set('use_smooth', [True] * len(hi.data.polygons))
info['hi_tris'] = len(hi.data.polygons)
bpy.ops.object.duplicate(); lo = bpy.context.view_layer.objects.active; lo.name = 'lo'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-6); bpy.ops.object.mode_set(mode='OBJECT')
for i in range(5):  # collapse stalls on meshes whose triangles are not welded: weld coarser and go again
    if len(lo.data.polygons) <= target * 1.25: break
    if i == 1:  # still stuck: rebuild it as a clean voxel shell (fine for rock and other organic shapes), then collapse
        d = max(lo.dimensions); r = lo.modifiers.new('vx', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = d / 260; bpy.ops.object.modifier_apply(modifier='vx'); log('voxel remesh', len(lo.data.polygons))
    m = lo.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1.0, target / len(lo.data.polygons)); bpy.ops.object.modifier_apply(modifier='dec')
# small edges: weighted normals keep large flat panels flat after decimation
lo.data.polygons.foreach_set('use_smooth', [True] * len(lo.data.polygons))
try:
    wn = lo.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = True; bpy.ops.object.modifier_apply(modifier='wn')
except Exception as e: log('weighted normal skipped', e)
info['lo_tris'] = len(lo.data.polygons); log('low', info['lo_tris'])
while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.6)
try: bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
except Exception as e: log('pack skipped', e)
bpy.ops.object.mode_set(mode='OBJECT'); log('uv')
mat = bpy.data.materials.new('lo_mat'); mat.use_nodes = True; nt = mat.node_tree
lo.data.materials.clear(); lo.data.materials.append(mat)
imgs = {}
def img(name, size, cs, float_=False):
    im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_); im.colorspace_settings.name = cs
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = im; n.name = name; imgs[name] = (im, n); return n
img('normal', TS, 'Non-Color'); img('onormal', TS // 2, 'Non-Color'); img('base', TS, 'sRGB')
img('rough', TS // 2, 'Non-Color'); img('metal', TS // 2, 'Non-Color'); img('ao', TS // 2, 'Non-Color')
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 1
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d in pr.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e: log('gpu', e)
size = max(hi.dimensions); info['size'] = size
b = sc.render.bake; b.use_selected_to_active = True; b.cage_extrusion = size * 0.008; b.max_ray_distance = size * 0.02; b.margin = 16
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
def bake(kind, name, **kw):
    nt.nodes.active = imgs[name][1]; bpy.ops.object.bake(type=kind, **kw); log('baked', name)
bake('NORMAL', 'normal')
b.normal_space = 'OBJECT'; bake('NORMAL', 'onormal'); b.normal_space = 'TANGENT'
bake('DIFFUSE', 'base', pass_filter={'COLOR'})
bake('ROUGHNESS', 'rough')
sc.cycles.samples = 24; bake('AO', 'ao'); sc.cycles.samples = 1
hm = hi.data.materials[0]; hnt = hm.node_tree; hb = [n for n in hnt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
ml = hb.inputs['Metallic'].links
outn = [n for n in hnt.nodes if n.type == 'OUTPUT_MATERIAL'][0]; old = outn.inputs['Surface'].links[0].from_socket
em = hnt.nodes.new('ShaderNodeEmission')
if ml: hnt.links.new(ml[0].from_socket, em.inputs['Color'])
else: em.inputs['Color'].default_value = (hb.inputs['Metallic'].default_value,) * 3 + (1,)
hnt.links.new(em.outputs[0], outn.inputs['Surface']); bake('EMIT', 'metal'); hnt.links.new(old, outn.inputs['Surface'])
for name, (im, n) in imgs.items():
    im.filepath_raw = f'{out}/tex_{name}.png'; im.file_format = 'PNG'; im.save()
bb = [lo.matrix_world @ Vector(c) for c in lo.bound_box]
info['bbox'] = [[min(v[i] for v in bb) for i in range(3)], [max(v[i] for v in bb) for i in range(3)]]
lo.data.materials.clear()
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{out}/low.glb', use_selection=True, export_format='GLB', export_materials='NONE')
info['seconds'] = round(time.time() - t0, 1)
json.dump(info, open(f'{out}/bake.json', 'w'), indent=1)
log('DONE')
