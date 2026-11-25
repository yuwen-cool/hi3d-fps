import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { withGpuTex, fixGpuTextures } from '../render/gputex.js';
import { aniso } from '../world/assets.js';

// Runtime retarget: Mesh2Motion (T-pose rest) clips -> robot skeleton (A-pose rest).
// For every sampled frame:  Qt_world = Qs_world * inv(Qs_restWorld) * Qt_restWorld,
// then back to local with the target's own parent chain. Pelvis translation is scaled by
// the leg-length ratio and expressed in each rig's root space.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // animation-only files: no materials, no textures
const skinLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const WANT = {
  base: ['Idle_A', 'Jog', 'Walk', 'Sprint', 'Crouch_Idle', 'Crouch_Walk', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload', 'Pistol_Idle', 'Hit_Chest', 'Hit_Head', 'Death_D', 'Roll'],
  addon: ['Death_A', 'Death_B', 'Death_C', 'Strafe_left', 'Strafe_right', 'Walk_Backwards', 'Run_Stealth', 'Dodge_left', 'Dodge_right', 'Idle Hurt'],
};

function boneMap(root) { const m = {}; root.traverse((o) => { if (o.isBone) m[o.name] = o; }); return m; }
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export async function loadRobotRig(url = '/models/robot_skin.glb') {
  await withGpuTex(skinLoader);
  const [g, base, addon] = await Promise.all([skinLoader.loadAsync(url), loader.loadAsync('/anim/human-base-animations.glb'), loader.loadAsync('/anim/human-addon-animations.glb')]);
  const tgtRoot = g.scene; fixGpuTextures(tgtRoot, aniso()); tgtRoot.updateMatrixWorld(true);
  const tb = boneMap(tgtRoot);
  const clips = {};
  for (const [src, names] of [[base, WANT.base], [addon, WANT.addon]]) {
    const sRoot = src.scene; sRoot.updateMatrixWorld(true);
    const sb = boneMap(sRoot);
    // rest world rotations
    const restS = {}, restT = {};
    for (const n in tb) if (sb[n]) { restS[n] = sb[n].getWorldQuaternion(new THREE.Quaternion()); restT[n] = tb[n].getWorldQuaternion(new THREE.Quaternion()); }
    const order = []; tgtRoot.traverse((o) => { if (o.isBone && restS[o.name]) order.push(o.name); });
    // rest-direction alignment (A-pose target vs T-pose source): rotate each target bone's rest
    // direction onto the source's before transferring world-space deltas
    const CHILD = { clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r',
      thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r', pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head' };
    for (const n of order) {
      const c = CHILD[n]; if (!c || !tb[c] || !sb[c]) continue;
      const dt_ = tb[c].getWorldPosition(new THREE.Vector3()).sub(tb[n].getWorldPosition(new THREE.Vector3())).normalize();
      const ds_ = sb[c].getWorldPosition(new THREE.Vector3()).sub(sb[n].getWorldPosition(new THREE.Vector3())).normalize();
      // express both in their root frames so differing root orientations do not leak in
      dt_.applyQuaternion(tgtRoot.getWorldQuaternion(new THREE.Quaternion()).invert()).applyQuaternion(sRoot.getWorldQuaternion(new THREE.Quaternion()));
      restT[n] = new THREE.Quaternion().setFromUnitVectors(dt_.clone().applyQuaternion(sRoot.getWorldQuaternion(new THREE.Quaternion()).invert()).applyQuaternion(tgtRoot.getWorldQuaternion(new THREE.Quaternion())), ds_.clone().applyQuaternion(sRoot.getWorldQuaternion(new THREE.Quaternion()).invert()).applyQuaternion(tgtRoot.getWorldQuaternion(new THREE.Quaternion()))).multiply(restT[n]);
    }
    const sRootInv = new THREE.Matrix4().copy(sRoot.matrixWorld).invert();
    const pelS0 = sb.pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(sRootInv);
    const legS = sb.thigh_l.getWorldPosition(new THREE.Vector3()).distanceTo(sb.foot_l.getWorldPosition(new THREE.Vector3()));
    const legT = tb.thigh_l.getWorldPosition(new THREE.Vector3()).distanceTo(tb.foot_l.getWorldPosition(new THREE.Vector3()));
    const k = legT / legS;
    const pelT0 = tb.pelvis.position.clone();
    const tRootW = tgtRoot.matrixWorld.clone();
    const restLocalT = {}; for (const n of order) restLocalT[n] = tb[n].quaternion.clone();
    const mixer = new THREE.AnimationMixer(sRoot);
    for (const clip of src.animations) {
      if (!names.includes(clip.name)) continue;
      const act = mixer.clipAction(clip); act.play();
      const fps = 30, N = Math.max(2, Math.ceil(clip.duration * fps) + 1);
      const times = new Float32Array(N); const qv = {}; for (const n of order) qv[n] = new Float32Array(N * 4);
      const pv = new Float32Array(N * 3);
      const worldT = {};
      for (let i = 0; i < N; i++) {
        const t = Math.min(clip.duration, i / fps); times[i] = t;
        mixer.setTime(t); sRoot.updateMatrixWorld(true);
        for (const n of order) {
          const qsw = sb[n].getWorldQuaternion(_q);
          const qtw = (worldT[n] ||= new THREE.Quaternion()).copy(qsw).multiply(_q2.copy(restS[n]).invert()).multiply(restT[n]);
          const par = tb[n].parent;
          let pw;
          if (par && par.isBone && worldT[par.name]) pw = worldT[par.name];
          else pw = par.getWorldQuaternion(new THREE.Quaternion());
          const ql = _q2.copy(pw).invert().multiply(qtw);
          ql.toArray(qv[n], i * 4);
        }
        // pelvis translation
        const ps = sb.pelvis.getWorldPosition(_v).applyMatrix4(sRootInv).sub(pelS0).multiplyScalar(k);
        // displacement in root space -> pelvis parent space
        const par = tb.pelvis.parent; _m.copy(par.matrixWorld).invert().multiply(tRootW);
        const dd = new THREE.Vector3().copy(ps).applyMatrix3(new THREE.Matrix3().setFromMatrix4(_m));
        pv[i * 3] = pelT0.x + dd.x; pv[i * 3 + 1] = pelT0.y + dd.y; pv[i * 3 + 2] = pelT0.z + dd.z;
      }
      act.stop();
      const tracks = order.map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, qv[n]));
      tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, pv));
      clips[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    }
    for (const n of order) tb[n].quaternion.copy(restLocalT[n]);
  }
  return { gltf: g, clips };
}
