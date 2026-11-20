# Rig the baked robot (A-pose, faces -Y) with the Mesh2Motion human skeleton (bone names only;
# clips are retargeted at runtime). Joints come from the mesh itself; skin is near-rigid so
# armour plates move as plates.
# usage: blender -b --python rig_robot.py -- <low.glb> <m2m_anim.glb> <out.glb> <preview.png>
import bpy, sys, math, json
import numpy as np
from mathutils import Vector
low, animf, out, prev = sys.argv[sys.argv.index('--') + 1:][:4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=animf)
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o)
if arm.animation_data:
    arm.animation_data_clear()
before = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=low)
mesh = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
V = np.array([list(v.co) for v in mesh.data.vertices])
mn, mx = V.min(0), V.max(0); H = mx[2] - mn[2]
# normalise: stand on z=0, centred in x/y, height 1.0 (game scales it later)
V = (V - np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]])) / H
for i, v in enumerate(mesh.data.vertices): v.co = Vector(V[i])
z = V[:, 2]; x = V[:, 0]; y = V[:, 1]
def band(z0, z1): return V[(z >= z0) & (z < z1)]
# legs: below crotch, split by x sign
def side_center(z0, z1, s):
    b = band(z0, z1); b = b[np.sign(b[:, 0]) == s]
    return b.mean(0) if len(b) else np.array([0.09 * s, 0, (z0 + z1) / 2])
tor = V[(np.abs(x) < 0.12) & (z > 0.55) & (z < 0.8)]; ty = float(np.median(tor[:, 1])) if len(tor) else 0.0
hd = V[(np.abs(x) < 0.08) & (z > 0.86)]; hy = float(np.median(hd[:, 1])) if len(hd) else ty
pl = V[(np.abs(x) < 0.12) & (z > 0.48) & (z < 0.56)]; py = float(np.median(pl[:, 1])) if len(pl) else ty
J = {}
for s, sd in ((1, 'l'), (-1, 'r')):
    ank = side_center(0.04, 0.08, s); kn = side_center(0.27, 0.31, s); hp = side_center(0.47, 0.51, s)
    foot = band(0.0, 0.05); foot = foot[np.sign(foot[:, 0]) == s]
    toe = foot[foot[:, 1].argmin()] if len(foot) else ank + [0, -0.12, 0]
    J[f'ankle_{sd}'] = [ank[0], ank[1], 0.06]; J[f'knee_{sd}'] = [kn[0], kn[1] - 0.01, 0.29]; J[f'hip_{sd}'] = [hp[0] * 0.8, hp[1], 0.52]
    J[f'toe_{sd}'] = [ank[0], toe[1], 0.015]
    # arm (A-pose): vertices far out in x between 0.38 and 0.86 height
    a = V[(np.sign(x) == s) & (np.abs(x) > 0.16) & (z > 0.36) & (z < 0.86)]
    tip = a[np.argmax(np.abs(a[:, 0]) * 0.3 - a[:, 2])]          # lowest-outermost = finger tips
    hand = a[(a[:, 2] < tip[2] + 0.09)]; wr = hand.mean(0); wr[2] = tip[2] + 0.085
    sh = np.array([0.175 * s, ty, 0.80])
    el = (sh + wr) / 2 + np.array([0.025 * s, 0.015, 0])
    J[f'shoulder_{sd}'] = sh.tolist(); J[f'elbow_{sd}'] = el.tolist(); J[f'wrist_{sd}'] = wr.tolist(); J[f'tip_{sd}'] = tip.tolist()
J['pelvis'] = [0, py, 0.53]; J['neck'] = [0, (ty + hy) / 2, 0.835]; J['head'] = [0, hy, 0.875]; J['head_top'] = [0, hy, 1.0]
json.dump({k: [round(float(c), 4) for c in v] for k, v in J.items()}, open(out.replace('.glb', '_joints.json'), 'w'), indent=1)
# place bones (armature space == world after applying its transform)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT'); eb = arm.data.edit_bones
P = {k: Vector(v) for k, v in J.items()}
def place(n, h, t):
    b = eb[n]; b.head = h; b.tail = t
def lerp(a, b, t): return a.lerp(b, t)
place('root', Vector((0, 0, 0)), Vector((0, 0.3, 0)))
pel, nk = P['pelvis'], P['neck']
place('pelvis', pel, lerp(pel, nk, 0.19))
for n, t0, t1 in (('spine_01', 0.19, 0.41), ('spine_02', 0.41, 0.68), ('spine_03', 0.68, 1.0)): place(n, lerp(pel, nk, t0), lerp(pel, nk, t1))
place('neck_01', nk, P['head']); place('head', P['head'], P['head_top']); place('head_leaf', P['head_top'], P['head_top'] + Vector((0, 0, 0.05)))
for sd in ('l', 'r'):
    sh, el, wr, tp = P[f'shoulder_{sd}'], P[f'elbow_{sd}'], P[f'wrist_{sd}'], P[f'tip_{sd}']
    place(f'clavicle_{sd}', lerp(nk, sh, 0.1) + Vector((0, 0, -0.02)), sh); place(f'upperarm_{sd}', sh, el); place(f'lowerarm_{sd}', el, wr)
    hand = eb[f'hand_{sd}']; old = hand.head.copy(); hand_tail = wr + (tp - wr) * 0.45
    for b in [hand] + list(hand.children_recursive):   # move whole finger chain with the wrist
        b.head = wr + (b.head - old) * 0.6; b.tail = wr + (b.tail - old) * 0.6
    hand.head = wr; hand.tail = hand_tail
    hp, kn, an, to = P[f'hip_{sd}'], P[f'knee_{sd}'], P[f'ankle_{sd}'], P[f'toe_{sd}']
    ball = Vector((an.x, an.y + (to.y - an.y) * 0.6, 0.015))
    place(f'thigh_{sd}', hp, kn); place(f'calf_{sd}', kn, an); place(f'foot_{sd}', an, ball); place(f'ball_{sd}', ball, to); place(f'ball_leaf_{sd}', to, to + Vector((0, -0.03, 0)))
bpy.ops.object.mode_set(mode='OBJECT')
# near-rigid skin: distance to bone segments, weights ~ d^-10, top 2, fingers merged into hand
deform = [b for b in arm.data.bones if b.name not in ('root',) and 'leaf' not in b.name]
skip = ('index', 'middle', 'ring', 'pinky', 'thumb')
deform = [b for b in deform if not any(s in b.name for s in skip)]
for b in arm.data.bones: b.use_deform = b in deform
A = np.array([list(b.head_local) for b in deform]); B = np.array([list(b.tail_local) for b in deform]); AB = B - A
VV = np.array([list(v.co) for v in mesh.data.vertices])
t = np.clip(np.einsum('vbk,bk->vb', VV[:, None] - A[None], AB) / np.maximum((AB * AB).sum(1), 1e-9), 0, 1)
D = np.linalg.norm(VV[:, None] - (A[None] + t[..., None] * AB[None]), axis=2)
# keep torso plates on the spine: penalise arm bones for vertices close to the centre line
name = [b.name for b in deform]
for j, n in enumerate(name):
    if n.startswith(('upperarm', 'clavicle')): D[:, j] += np.clip(0.2 - np.abs(VV[:, 0]), 0, None) * 0.6
    if n.startswith('thigh'): D[:, j] += np.clip(VV[:, 2] - 0.5, 0, None) * 2.0
w = (1.0 / np.maximum(D, 1e-4)) ** 10
idx = np.argsort(-w, axis=1)[:, :2]
for o in list(mesh.vertex_groups): mesh.vertex_groups.remove(o)
groups = {n: mesh.vertex_groups.new(name=n) for n in name}
for vi in range(len(VV)):
    i0, i1 = idx[vi]; w0, w1 = w[vi, i0], w[vi, i1]; s_ = w0 + w1
    groups[name[i0]].add([vi], float(w0 / s_), 'REPLACE')
    if w1 / s_ > 0.02: groups[name[i1]].add([vi], float(w1 / s_), 'REPLACE')
mesh.parent = arm; md = mesh.modifiers.new('arm', 'ARMATURE'); md.object = arm
# preview: front + side with bones as thin cylinders
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 1000; sc.render.resolution_y = 800
w_ = bpy.data.worlds.new('w'); sc.world = w_; w_.use_nodes = True; w_.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.5, 1)
mat = bpy.data.materials.new('b'); mat.use_nodes = True; mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0.1, 0.1, 1)
mat.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 0, 0, 1); mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 3
mm = bpy.data.materials.new('m'); mm.use_nodes = True; mm.blend_method = 'BLEND' if hasattr(mm, 'blend_method') else None
mm.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.35
mesh.data.materials.clear(); mesh.data.materials.append(mm)
for b in deform:
    h, tl = b.head_local, b.tail_local; L = (tl - h).length
    if L < 1e-4: continue
    bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=L, location=(h + tl) / 2)
    c = bpy.context.active_object; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = (tl - h).to_track_quat('Z', 'Y'); c.data.materials.append(mat); c.show_in_front = True
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.3
for nm, loc, rot in (('front', (0, -3, 0.5), (math.pi / 2, 0, 0)), ('side', (3, 0, 0.5), (math.pi / 2, 0, math.pi / 2))):
    cam.location = loc; cam.rotation_euler = rot; sc.render.filepath = prev.replace('.png', f'_{nm}.png'); bpy.ops.render.render(write_still=True)
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and o is not mesh: bpy.data.objects.remove(o)
mesh.data.materials.clear()
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_animations=False, export_materials='NONE', export_skins=True)
print('RIG_DONE', len(deform), 'bones', len(VV), 'verts')
