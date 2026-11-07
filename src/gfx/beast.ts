// Builds rigged beasts from Look definitions and animates them procedurally.
import * as THREE from 'three';
import { blob, loft, merge, spike, type Hex, type Sec, type V3 } from './geom';
import { PATTERN, type Look } from './looks';
import { ALL_LOOKS as LOOKS } from './looks2';
import { makeBeastMaterial, type BeastUniforms } from './beastMaterial';
import { EVOLUTIONS } from '../sim/progression';
import { angleDelta } from '../sim/battle';

const rad = (d: number) => (d * Math.PI) / 180;
/** Beasts draw larger than their collision size so they read clearly at battle distance. */
export const VISUAL_SCALE = 1.3;
const EYE = 2.2;
/** Marks small painted parts (noses, teeth, pupils) so coat patterns and rainbow colours skip them. */
const MATTE = 0.006;

function node(name: string, parent: THREE.Object3D, p: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(p[0], p[1], p[2]);
  parent.add(g);
  return g;
}

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry): THREE.Mesh {
  const m = new THREE.Mesh(geo);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ── Shared feature builders ───────────────────────────────

/** A real eye: pale sclera, a team-coloured iris that glows, and a dark pupil looking forward. */
function eye(parts: (THREE.BufferGeometry | null)[], x: number, y: number, z: number, r: number): void {
  const side = Math.sign(x) || 1;
  parts.push(blob([x, y, z], [r, r, r], '#f2eadb', '#d8cdb8', MATTE, 8));
  parts.push(blob([x + side * r * 0.42, y, z + r * 0.42], [r * 0.68, r * 0.68, r * 0.68], '#ffffff', '#ffffff', EYE, 7));
  parts.push(blob([x + side * r * 0.66, y, z + r * 0.66], [r * 0.36, r * 0.36, r * 0.36], '#060506', '#060506', MATTE, 6));
}

function buildHead(parent: THREE.Object3D, l: Look, evo: number): void {
  if (l.beak) { buildBirdHead(parent, l, evo); return; }
  const head = node('head', parent);
  head.scale.setScalar(l.headScale ?? 1.28);
  const { headLen: hl, headR: hr, snoutLen: sl, snoutR: sr, top, bottom } = l;
  const upper: (THREE.BufferGeometry | null)[] = [];
  const nose = l.pattern === 3 ? l.accent : l.dark;
  // Nose and muzzle give the face a focal point at game distance.
  if (l.pattern !== 3 && !l.trunk) {
    upper.push(blob([0, sr * 0.28, hl + sl * 0.96], [sr * 0.46, sr * 0.34, sr * 0.3], '#17120f', '#17120f', MATTE, 8));
  }
  if (sl < hl * 0.95 && !l.trunk) {
    for (const side of [-1, 1]) {
      upper.push(blob([side * sr * 0.52, -sr * 0.18, hl + sl * 0.62], [sr * 0.68, sr * 0.62, sr * 0.72], bottom, bottom, 0, 8));
    }
  }

  upper.push(loft([
    { p: [0, 0, -hl * 0.3], r: [hr * 0.7, hr * 0.7] },
    { p: [0, hr * 0.1, hl * 0.15], r: [hr, hr * 0.95] },
    { p: [0, hr * 0.12, hl * 0.6], r: [hr * 0.92, hr * 0.8] },
    { p: [0, hr * 0.02, hl * 0.95], r: [sr * 1.3, sr * 1.05] },
    { p: [0, -hr * 0.02, hl + sl * 0.6], r: [sr, sr * 0.8] },
    { p: [0, -hr * 0.02, hl + sl * 0.98], r: [sr * 0.7, sr * 0.5], top: nose },
  ], { top, bottom, radial: 12 }));
  // Eyes.
  for (const side of [-1, 1]) {
    eye(upper, side * hr * 0.66, hr * 0.42, hl * 0.62, hr * (l.bigEyes ? 0.3 : 0.17));
    if (l.eyePatch) upper.push(blob([side * hr * 0.6, hr * 0.36, hl * 0.6], [hr * 0.25, hr * 0.28, hr * 0.28], l.bottom, l.bottom, 0, 8));
    // Brow ridge gives every beast a mean look.
    upper.push(blob([side * hr * 0.62, hr * 0.58, hl * 0.62], [hr * 0.28, hr * 0.1, hr * 0.26], top, top, 0, 8));
  }
  // Ears.
  for (const side of [-1, 1]) {
    const ex = side * hr * 0.72;
    const ey = hr * 0.72;
    const ez = hl * 0.08;
    if (l.ears === 'pointy') upper.push(spike([[ex, ey, ez], [ex + side * hr * 0.14, ey + hr * 0.45, ez - hr * 0.1], [ex + side * hr * 0.18, ey + hr * 0.95, ez - hr * 0.2]], hr * 0.28, top, 0, l.dark));
    else if (l.ears === 'round') upper.push(blob([ex, ey + hr * 0.1, ez], [hr * 0.24, hr * 0.28, hr * 0.12], l.darkEars ? l.bottom : top, l.darkEars ? l.bottom : bottom));
    else if (l.ears === 'small') upper.push(blob([ex, ey, ez], [hr * 0.17, hr * 0.2, hr * 0.1], top, bottom));
    else if (l.ears === 'long') upper.push(loft([
      { p: [ex * 0.8, ey * 0.8, ez], r: [hr * 0.12, hr * 0.08] },
      { p: [ex * 0.95, ey + hr * 0.9, ez - hr * 0.3], r: [hr * 0.24, hr * 0.1] },
      { p: [ex, ey + hr * 2, ez - hr * 0.7], r: [hr * 0.08, hr * 0.04] },
    ], { top, bottom: l.accent, radial: 8 }));
  }
  // Teeth along the upper jaw.
  if (sl > 0.1) {
    const n = Math.max(3, Math.round(sl * 8));
    for (let i = 0; i < n; i++) {
      const z = hl + sl * (0.15 + (0.75 * i) / n);
      for (const side of [-1, 1]) {
        upper.push(spike([[side * sr * 0.72, -sr * 0.42, z], [side * sr * 0.72, -sr * 0.95, z]], sr * 0.11, '#f5efdc', MATTE, '#ffffff', 4));
      }
    }
  }
  if (l.sabers) {
    for (const side of [-1, 1]) {
      upper.push(spike([
        [side * sr * 0.7, -sr * 0.3, hl + sl * 0.5], [side * sr * 0.74, -hr * 0.9, hl + sl * 0.52], [side * sr * 0.66, -hr * 1.9, hl + sl * 0.32],
      ], sr * 0.3, '#fff6dc', 0, '#fffdf2'));
    }
  }
  if (l.tusks === 'small') {
    for (const side of [-1, 1]) {
      upper.push(spike([
        [side * sr * 0.8, -sr * 0.5, hl + sl * 0.7], [side * sr * 1.25, -sr * 0.05, hl + sl * 0.82], [side * sr * 1.35, sr * 0.8, hl + sl * 0.7],
      ], sr * 0.25, '#efe6c8', 0, '#fffbe9'));
    }
  }
  if (l.tusks === 'long' || l.tusks === 'mammoth') {
    // Tusks were drawn for an elephant's head, so they scale with whatever head they're on.
    const big = (l.tusks === 'mammoth' ? 1.75 : 1) * (hr / 0.56);
    const tx = hr * 0.5;
    for (const side of [-1, 1]) {
      upper.push(spike([
        [side * tx, -hr * 0.45, hl * 0.82],
        [side * (tx + 0.1 * big), -hr * 0.95, hl + 0.35 * big],
        [side * (tx + 0.3 * big), -hr * 0.8, hl + 0.9 * big],
        [side * (tx + (l.tusks === 'mammoth' ? 0.15 : 0.28)), hr * (l.tusks === 'mammoth' ? 0.55 : -0.25), hl + 1.35 * big],
      ], 0.09 * Math.sqrt(big) * 1.4, '#efe6c8', 0, '#fffdf0'));
    }
  }
  if (l.rhinoHorn) {
    upper.push(spike([[0, sr * 0.55, hl + sl * 0.68], [0, sr * 1.6, hl + sl * 0.8], [0, sr * 3.1, hl + sl * 0.56]], sr * 0.52, '#6d675c', 0, '#c7bfa8'));
    upper.push(spike([[0, sr * 0.72, hl + sl * 0.15], [0, sr * 1.5, hl + sl * 0.15]], sr * 0.3, '#6d675c', 0, '#b8b09a'));
  }
  if (l.horns) {
    for (const side of [-1, 1]) {
      upper.push(spike([
        [side * hr * 0.55, hr * 0.5, hl * 0.1], [side * hr * 0.9, hr * 1.1, -hl * 0.35], [side * hr * 1.05, hr * 1.3, -hl * 1.0], [side * hr * 0.8, hr * 1.9, -hl * 1.6],
      ], hr * 0.27, '#2b1a14', 0, l.glowCol ?? '#ffffff'));
    }
  }
  if (l.antlers) {
    const g = 0.95;
    for (const side of [-1, 1]) {
      const base: V3 = [side * hr * 0.5, hr * 0.65, hl * 0.05];
      const mid: V3 = [side * hr * 1.8, hr * 3.0, -hl * 0.5];
      const tip: V3 = [side * hr * 3.0, hr * 6.0, -hl * 0.3];
      upper.push(spike([base, mid, tip], hr * 0.22, '#d8ffe9', g, l.accent));
      upper.push(spike([mid, [side * hr * 3.1, hr * 3.2, hl * 0.5]], hr * 0.13, '#d8ffe9', g, l.accent));
      upper.push(spike([[side * hr * 2.3, hr * 4.3, -hl * 0.4], [side * hr * 1.1, hr * 5.8, hl * 0.3]], hr * 0.12, '#d8ffe9', g, l.accent));
      upper.push(spike([[side * hr * 2.6, hr * 4.9, -hl * 0.35], [side * hr * 4.2, hr * 5.9, -hl * 0.1]], hr * 0.1, '#d8ffe9', g, l.accent));
    }
  }
  if (l.hornStyle) {
    for (const side of [-1, 1]) {
      const x0 = side * hr * 0.55;
      const bone = l.hornStyle === 'ram' ? '#b8a888' : '#d8cdb0';
      if (l.hornStyle === 'bull') upper.push(spike([[x0, hr * 0.62, hl * 0.2], [side * hr * 1.45, hr * 0.8, hl * 0.25], [side * hr * 1.75, hr * 1.5, hl * 0.6]], hr * 0.2, bone, 0, '#2a2420'));
      if (l.hornStyle === 'goat') upper.push(spike([[x0 * 0.7, hr * 0.8, hl * 0.2], [side * hr * 0.6, hr * 1.7, -hl * 0.25], [side * hr * 0.75, hr * 2.2, -hl * 1.0]], hr * 0.15, '#6a5a48', 0, '#2a2420'));
      if (l.hornStyle === 'ram') {
        const pts: V3[] = [];
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 1.75 - 0.6;
          const R = hr * (0.72 - i * 0.04);
          pts.push([side * (hr * 0.72 + i * hr * 0.05), hr * 0.5 + Math.sin(a) * R, -hl * 0.1 - Math.cos(a) * R * -0.1 - Math.cos(a) * R]);
        }
        upper.push(spike(pts, hr * 0.32, bone, 0, '#8a7a60', 8));
      }
    }
    if (l.hornStyle === 'unicorn') upper.push(spike([[0, hr * 0.7, hl * 0.55], [0, hr * 2.4, hl * 1.0], [0, hr * 4, hl * 1.35]], hr * 0.2, '#ffe8a0', 0.7, '#fff8e0', 7));
  }
  if (l.antlerKind) {
    for (const side of [-1, 1]) {
      const b: V3 = [side * hr * 0.5, hr * 0.7, hl * 0.1];
      if (l.antlerKind === 'deer') {
        const m: V3 = [side * hr * 1.5, hr * 2.2, -hl * 0.3];
        upper.push(spike([b, m, [side * hr * 2.1, hr * 3.8, -hl * 0.2]], hr * 0.16, '#d8c8a8', 0, '#f0e8d8'));
        upper.push(spike([m, [side * hr * 2.3, hr * 2.6, hl * 0.3]], hr * 0.09, '#d8c8a8', 0, '#f0e8d8'));
        upper.push(spike([[side * hr * 1.8, hr * 3, -hl * 0.25], [side * hr * 1.1, hr * 3.9, hl * 0.2]], hr * 0.08, '#d8c8a8', 0, '#f0e8d8'));
      } else {
        upper.push(spike([b, [side * hr * 1.6, hr * 1.0, -hl * 0.1]], hr * 0.2, '#b8a888', 0, '#b8a888'));
        upper.push(blob([side * hr * 2.4, hr * 1.5, -hl * 0.1], [hr * 1.15, hr * 0.8, hr * 0.13], '#c8b898', '#a89878', 0, 10));
        for (let i = 0; i < 5; i++) {
          const a = -0.5 + i * 0.5;
          const x = side * (hr * 2.4 + Math.cos(a) * hr * 1.0);
          const y = hr * 1.5 + Math.sin(a) * hr * 0.75;
          upper.push(spike([[x, y, -hl * 0.1], [x + side * hr * 0.3 * Math.cos(a), y + hr * 0.55, -hl * 0.1]], hr * 0.1, '#c8b898', 0, '#efe8d8', 5));
        }
      }
    }
  }
  if (l.ossicones) for (const side of [-1, 1]) {
    upper.push(spike([[side * hr * 0.35, hr * 0.7, hl * 0.1], [side * hr * 0.45, hr * 1.7, -hl * 0.1]], hr * 0.14, l.accent, 0, l.accent));
    upper.push(blob([side * hr * 0.45, hr * 1.72, -hl * 0.1], [hr * 0.18, hr * 0.18, hr * 0.18], '#2a1c10', '#2a1c10', 0, 7));
  }
  if (l.dome) upper.push(blob([0, hr * 0.75, hl * 0.15], [hr * 1.02, hr * 0.85, hl * 0.9], '#e8d4a8', l.accent, 0, 12));
  if (l.crest && !l.beak) upper.push(spike([[0, hr * 0.85, hl * 0.3], [0, hr * (1.2 + l.crest), -hl * 0.1], [0, hr * (1.1 + l.crest), -hl * 0.9]], hr * 0.2, l.accent, 0, '#ffb060'));
  if (l.crestStyle === 'tube') upper.push(spike([[0, hr * 0.85, hl * 0.4], [0, hr * 1.7, -hl * 0.5], [0, hr * 2.1, -hl * 1.7], [0, hr * 1.9, -hl * 2.8]], hr * 0.34, l.accent, 0, '#f0d080'));
  if (l.crestStyle === 'twin') for (const side of [-1, 1]) {
    upper.push(loft([
      { p: [side * hr * 0.35, hr * 0.7, hl + sl * 0.55], r: [hr * 0.04, hr * 0.14] },
      { p: [side * hr * 0.42, hr * 1.45, hl * 0.5], r: [hr * 0.05, hr * 0.5] },
      { p: [side * hr * 0.42, hr * 1.2, -hl * 0.1], r: [hr * 0.03, hr * 0.14] },
    ], { top: l.accent, bottom: '#ffef90', radial: 6 }));
  }
  if (l.frillNeck) for (const side of [-1, 1]) {
    upper.push(blob([side * hr * 1.0, -hr * 0.1, -hl * 0.1], [hr * 0.85, hr * 0.85, hr * 0.06], l.accent, '#d04a2a', 0, 10));
  }
  if (l.frill) {
    const fr = hr * l.frill * 1.35;
    upper.push(blob([0, hr * 0.75, -hl * 0.2], [fr, fr * 0.95, hr * 0.14], l.accent, top, 0, 14));
    upper.push(blob([0, hr * 0.75, -hl * 0.24], [fr * 0.72, fr * 0.68, hr * 0.15], top, l.accent, 0, 12));
    if (l.frillSpikes) for (let i = 0; i < 9; i++) {
      const a = 0.15 + (i / 8) * (Math.PI - 0.3);
      const x = Math.cos(a) * fr * 0.96;
      const y = hr * 0.75 + Math.sin(a) * fr * 0.92;
      upper.push(spike([[x, y, -hl * 0.2], [x * 1.45, hr * 0.75 + Math.sin(a) * fr * 1.5, -hl * 0.32]], hr * 0.15, '#e8dcc0', 0, '#ffffff', 6));
    }
  }
  if (l.noseHorn) upper.push(spike([[0, sr * 0.7, hl + sl * 0.62], [0, sr * (0.9 + l.noseHorn * 1.1), hl + sl * 0.72], [0, sr * (1 + l.noseHorn * 2.4), hl + sl * 0.82]], sr * 0.44, '#d8cdb0', 0, '#fff8e8'));
  if (l.browHorns) for (const side of [-1, 1]) {
    const b = l.browHorns;
    upper.push(spike([[side * hr * 0.5, hr * 0.7, hl * 0.5], [side * hr * 0.62, hr * (0.9 + b * 0.8), hl * (0.65 + b * 0.5)], [side * hr * 0.6, hr * (0.95 + b * 1.1), hl * (0.7 + b * 1.35)]], hr * 0.2, '#d8cdb0', 0, '#fff8e8'));
  }
  // Legend crown: every evolved beast earns a visible mark on the head.
  if (evo >= 3) {
    const glowHex = EVOLUTIONS[3].color;
    for (let i = -2; i <= 2; i++) {
      upper.push(spike([
        [i * hr * 0.3, hr * 0.85, hl * 0.2],
        [i * hr * 0.4, hr * (1.4 + (2 - Math.abs(i)) * 0.32), hl * 0.05],
      ], hr * 0.14, glowHex, 0.9, '#fff7cf', 5));
    }
  }
  addMesh(head, merge(upper));

  // Jaw on its own joint so bites read at a distance.
  const jaw = node('jaw', head, [0, -hr * 0.32, hl * 0.3]);
  const jl = hl * 0.7 + sl * 0.92;
  const jaws: THREE.BufferGeometry[] = [loft([
    { p: [0, 0, -hl * 0.05], r: [hr * 0.7, hr * 0.42] },
    { p: [0, -hr * 0.05, jl * 0.45], r: [sr * 1.2, sr * 0.45] },
    { p: [0, -hr * 0.02, jl], r: [sr * 0.65, sr * 0.3] },
  ], { top: '#7a2b2b', bottom, radial: 8 })];
  const nT = Math.max(2, Math.round(sl * 6));
  for (let i = 0; i < nT; i++) {
    const z = jl * (0.45 + (0.5 * i) / nT);
    for (const side of [-1, 1]) {
      jaws.push(spike([[side * sr * 0.55, sr * 0.08, z], [side * sr * 0.55, sr * 0.48, z]], sr * 0.09, '#f5efdc', MATTE, '#ffffff', 4));
    }
  }
  addMesh(jaw, merge(jaws));

  if (l.ears === 'big') {
    for (const side of [-1, 1]) {
      const ear = node(side < 0 ? 'earL' : 'earR', head, [side * hr * 0.75, hr * 0.32, -hl * 0.05]);
      addMesh(ear, merge([loft([
        { p: [0, 0.1 * hr, 0], r: [0.04, hr * 0.5] },
        { p: [side * hr * 0.75, 0, -0.1], r: [0.055, hr * 1.05] },
        { p: [side * hr * 1.55, -hr * 0.2, -0.18], r: [0.05, hr * 0.85] },
        { p: [side * hr * 1.95, -hr * 0.4, -0.22], r: [0.03, hr * 0.15] },
      ], { top: l.top, bottom: '#a57d78', radial: 8 })]));
    }
  }
  if (l.trunk) {
    const segs = 6;
    let prev: THREE.Object3D = node('trunkBase', head, [0, -hr * 0.2, hl + sl * 0.55]);
    let r = sr * 0.88;
    const len = hr * 0.55;
    for (let i = 0; i < segs; i++) {
      const seg = node(`trunk${i}`, prev, i === 0 ? [0, 0, 0] : [0, -len, 0]);
      addMesh(seg, loft([
        { p: [0, 0, 0], r },
        { p: [0, -len * 0.5, 0], r: r * 0.93 },
        { p: [0, -len, 0], r: r * 0.86 },
      ], { top: l.top, bottom: l.bottom, radial: 8, subdiv: 1 }));
      r *= 0.84;
      prev = seg;
    }
  }
}

function buildNeck(parent: THREE.Object3D, l: Look, base: V3, evo: number): void {
  const segs = l.neckSegs ?? 1;
  let attach: THREE.Object3D = parent;
  let pos: V3 = base;
  const stepLen = l.neckLen / segs;
  for (let i = 0; i < segs; i++) {
    const n = node(`neck${i}`, attach, pos);
    const kA = 1 - (i / segs) * 0.42;
    const kB = 1 - ((i + 1) / segs) * 0.42;
    const angle = rad(l.neckAngle) * (segs > 1 ? (i === segs - 1 ? 0.05 : 1.12 - i * 0.28) : 1);
    const dz = Math.cos(angle) * stepLen;
    const dy = Math.sin(angle) * stepLen;
    const parts: THREE.BufferGeometry[] = [loft([
      { p: [0, 0, -stepLen * 0.1], r: l.neckR * kA },
      { p: [0, dy * 0.5, dz * 0.5], r: l.neckR * (kA + kB) * 0.5 },
      { p: [0, dy, dz], r: l.neckR * kB },
    ], { top: l.top, bottom: l.bottom, radial: 12, subdiv: 2 })];
    // A ball at each joint keeps a bending neck looking continuous.
    if (segs > 1) parts.push(blob([0, 0, 0], [l.neckR * kA * 1.02, l.neckR * kA * 1.02, l.neckR * kA * 1.02], l.top, l.bottom, 0, 10));
    if (l.backSpikes) {
      const c = 3;
      for (let k = 0; k < c; k++) {
        const t = (k + 0.5) / c;
        const sx = 0;
        const sy = dy * t + l.neckR * (kA + (kB - kA) * t) * 0.9;
        const sz = dz * t;
        parts.push(spike([[sx, sy, sz], [sx, sy + l.neckR * 0.7, sz - l.neckR * 0.3]], l.neckR * 0.22, l.accent, 0, l.glowCol ?? l.accent, 5));
      }
    }
    if (l.mane && i === 0) parts.push(buildMane(l, dy, dz));
    if (l.neckMane) {
      const c = 9;
      for (let k = 0; k < c; k++) {
        const t = (k + 0.5) / c;
        const hx = l.neckR * (kA + (kB - kA) * t);
        const sy = dy * t + hx * 0.85;
        const sz = dz * t - hx * 0.3;
        parts.push(spike([[0, sy, sz], [0, sy + hx * 0.75, sz - hx * 0.65]], hx * 0.4, l.accent, 0, l.accent, 5));
      }
    }
    addMesh(n, merge(parts));
    attach = n;
    pos = [0, dy, dz];
  }
  const anchor = node('headAnchor', attach, pos);
  buildHead(anchor, l, evo);
}

function buildMane(l: Look, dy: number, dz: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    blob([0, dy * 0.62 + l.neckR * 0.1, dz * 0.62], [l.neckR * 1.75, l.neckR * 1.95, l.neckR * 1.85], l.accent, '#3a1d0b', 0, 12),
  ];
  const count = 70;
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < count; i++) {
    const t = rnd();
    const a = rnd() * Math.PI * 2;
    const R = l.neckR * (1.45 + rnd() * 0.35);
    const cx = Math.cos(a) * R;
    const cy = dy * (0.3 + t * 0.6) + Math.sin(a) * R * 1.05 + l.neckR * 0.1;
    const cz = dz * (0.25 + t * 0.8);
    const len = l.neckR * (0.8 + rnd() * 0.7);
    const ox = Math.cos(a) * len;
    const oy = Math.sin(a) * len * 0.8 - len * 0.2;
    const shade = new THREE.Color(l.accent).lerp(new THREE.Color('#2a1508'), rnd() * 0.6).getHex(THREE.SRGBColorSpace);
    parts.push(spike([[cx, cy, cz], [cx + ox * 0.6, cy + oy * 0.6, cz - len * 0.25], [cx + ox, cy + oy - len * 0.25, cz - len * 0.6]], l.neckR * 0.34, shade, 0, l.accent, 5));
  }
  return merge(parts);
}

function buildLeg(body: THREE.Object3D, name: string, l: Look, x: number, y: number, z: number, front: boolean): void {
  if (l.darkLegs) l = { ...l, top: l.bottom };
  const hip = node(`hip${name}`, body, [x, y, z]);
  // Legs always reach the ground exactly, whatever the body proportions are.
  const length = y;
  const up = length * 0.5;
  const lo = length * 0.5;
  const r = l.legR;
  const side = Math.sign(x);
  const sprawl = (l.sprawl ?? 0) * length * side;
  const kneeZ = front ? -0.03 * length : 0.16 * length;
  const footZ = front ? 0.03 * length : -0.14 * length;
  const haunch = r * (front ? 1.65 : 2.05);
  const mix = (a: string, b: string, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex(THREE.SRGBColorSpace);
  const sock = mix(l.top, l.bottom, 0.45);
  addMesh(hip, loft([
    { p: [-side * r * 0.5, r * 2.4, 0], r: haunch * 0.2, top: l.top, bottom: l.top },
    { p: [-side * r * 0.2, r * 1.5, 0], r: haunch * 0.72, top: l.top, bottom: l.top },
    { p: [sprawl * 0.3, -up * 0.2, kneeZ * 0.3], r: [haunch * 0.86, haunch], top: l.top, bottom: l.top },
    { p: [sprawl * 0.75, -up * 0.68, kneeZ * 0.82], r: [r * 1.22, r * 1.38], top: l.top, bottom: mix(l.top, l.bottom, 0.2) },
    { p: [sprawl, -up, kneeZ], r: r * 0.98, top: mix(l.top, l.bottom, 0.2), bottom: mix(l.top, l.bottom, 0.2) },
  ], { radial: 12, subdiv: 3 }));
  const knee = node(`knee${name}`, hip, [sprawl, -up, kneeZ]);
  const footC = l.hoof ? l.dark : sock;
  const foot = -lo + l.pawR * 0.42;
  const parts = [
    loft([
      { p: [0, r * 0.35, 0], r: r * 0.92, top: mix(l.top, l.bottom, 0.2), bottom: mix(l.top, l.bottom, 0.2) },
      { p: [0, -lo * 0.4, footZ * 0.55], r: r * 0.8, top: mix(l.top, l.bottom, 0.3), bottom: mix(l.top, l.bottom, 0.3) },
      { p: [0, -lo * 0.86, footZ], r: r * 0.66, top: sock, bottom: sock },
      { p: [0, foot, footZ + l.pawR * 0.1], r: r * 0.74, top: sock, bottom: sock },
    ], { radial: 10, subdiv: 2 }),
    blob([0, foot, footZ + l.pawR * 0.42], [l.pawR, l.pawR * 0.56, l.pawR * 1.28], footC, l.hoof ? l.dark : mix(l.bottom, l.dark, 0.5), 0, 10),
  ];
  if (!l.hoof && l.pawR > 0.05) {
    for (let c = -1; c <= 1; c++) {
      const cx = c * l.pawR * 0.58;
      const cz = footZ + l.pawR * 1.5;
      parts.push(spike([[cx, foot - l.pawR * 0.18, cz - l.pawR * 0.3], [cx, foot - l.pawR * 0.42, cz + l.pawR * 0.42]], l.pawR * 0.17, '#e7ddc6', 0, '#ffffff', 4));
    }
  }
  addMesh(knee, merge(parts));
}

function buildTail(body: THREE.Object3D, l: Look, base: V3): void {
  const segs = l.tail === 'long' ? 7 : l.tail === 'bob' ? 1 : 5;
  const segLen = l.tailLen / segs;
  let prev: THREE.Object3D = node('tailBase', body, base);
  let r = l.tailR;
  for (let i = 0; i < segs; i++) {
    const seg = node(`tail${i}`, prev, i === 0 ? [0, 0, 0] : [0, 0, -segLen]);
    const kEnd = l.tail === 'bushy' ? (i < 2 ? 1.2 : 0.9) : 0.8;
    const r2 = l.tail === 'long' || l.tail === 'thick' ? r * 0.72 : r * kEnd;
    const parts: THREE.BufferGeometry[] = [loft([
      { p: [0, 0, 0], r },
      { p: [0, 0, -segLen], r: r2 },
    ], { top: l.top, bottom: l.bottom, radial: 8, subdiv: 1 })];
    if (l.backSpikes) {
      parts.push(spike([[0, r * 0.75, -segLen * 0.3], [0, r * 0.75 + Math.max(0.08, r * 0.85), -segLen * 0.55]], Math.max(0.03, r * 0.26), l.accent, 0, l.glowCol ?? l.accent, 5));
    }
    if (l.tail === 'tuft' && i === segs - 1) {
      parts.push(blob([0, 0, -segLen], [l.tailR * 2.6, l.tailR * 2.6, l.tailR * 4], l.accent, l.accent));
    }
    if (i === segs - 1) {
      if (l.tailClub) {
        parts.push(blob([0, 0, -segLen * 1.1], [Math.max(0.1, l.tailR * 1.6), Math.max(0.08, l.tailR * 1.1), Math.max(0.12, l.tailR * 1.7)], l.accent, l.top, 0, 10));
        for (const sx of [-1, 1]) parts.push(spike([[sx * l.tailR * 1.2, 0, -segLen * 1.1], [sx * l.tailR * 2.4, 0, -segLen * 1.1]], l.tailR * 0.5, '#d8cdb0', 0, '#fff8e8', 5));
      }
      if (l.tailSpikes) {
        const sp = Math.max(0.35, l.L * 0.32);
        for (const sx of [-1, 1]) for (const zk of [0.2, 0.9]) {
          parts.push(spike([[sx * r2 * 0.6, r2 * 0.3, -segLen * zk], [sx * sp, sp * 0.7, -segLen * zk - sp * 0.3]], Math.max(0.03, sp * 0.14), '#d8cdb0', 0, '#fff8e8', 6));
        }
      }
    }
    addMesh(seg, merge(parts));
    r = r2;
    prev = seg;
  }
}

function buildWing(body: THREE.Object3D, l: Look, side: number, base: V3, span: number): void {
  const name = side < 0 ? 'L' : 'R';
  const root = node(`wing${name}`, body, base);
  const inner = span * 0.45;
  const outer = span * 0.55;
  const chord = span * (l.wings === 'bat' ? 0.34 : 0.24);
  const glow = l.bodyGlow ? Math.min(0.3, l.bodyGlow * 0.2) : 0;
  const membrane = l.wings === 'bat';
  const c1: Hex = membrane ? l.accent : l.top;
  const c2: Hex = membrane
    ? new THREE.Color(l.accent).lerp(new THREE.Color(l.glowCol ?? l.bottom), 0.3).getHex(THREE.SRGBColorSpace)
    : l.bottom;

  const wingPart = (len: number, ch0: number, ch1: number, flare: boolean) => {
    const parts: THREE.BufferGeometry[] = [];
    // Arm bone.
    parts.push(loft([
      { p: [0, 0, 0], r: l.chest * 0.1 },
      { p: [side * len, 0, 0], r: l.chest * 0.06 },
    ], { top: l.top, bottom: l.bottom, radial: 6, subdiv: 1 }));
    if (membrane) {
      parts.push(sheet(len, ch0, ch1, side, c1, c2, glow));
    } else {
      const feathers = 7;
      for (let i = 0; i < feathers; i++) {
        const t = (i + 0.5) / feathers;
        const fl = (ch0 + (ch1 - ch0) * t) * (flare ? 1.1 : 1);
        const x = side * len * t;
        parts.push(loft([
          { p: [x, 0, 0.02], r: [len / feathers * 0.62, 0.018] },
          { p: [x + side * fl * (flare ? 0.2 : 0.05), -0.01, -fl * 0.55], r: [len / feathers * 0.75, 0.02] },
          { p: [x + side * fl * (flare ? 0.42 : 0.1), -0.03, -fl], r: [len / feathers * 0.3, 0.01] },
        ], {
          top: new THREE.Color(l.top).lerp(new THREE.Color(l.accent), flare ? 0.2 : 0).getHex(THREE.SRGBColorSpace),
          bottom: new THREE.Color(l.bottom).lerp(new THREE.Color(l.dark), flare ? t * 0.8 : 0).getHex(THREE.SRGBColorSpace),
          glow: glow * (flare ? 1 : 0.65), radial: 6, subdiv: 2,
        }));
      }
    }
    return merge(parts);
  };
  addMesh(root, wingPart(inner, chord, chord * 1.1, false));
  const tip = node(`wingTip${name}`, root, [side * inner, 0, 0]);
  addMesh(tip, wingPart(outer, chord * 1.1, chord * 0.5, true));
}

/** Scalloped wing membrane with finger bones, thin enough to read as skin. */
function sheet(len: number, ch0: number, ch1: number, side: number, c1: Hex, c2: Hex, glow: number): THREE.BufferGeometry {
  const steps = 9;
  const secs: Sec[] = [];
  const bones: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ch = ch0 + (ch1 - ch0) * t;
    const scallop = 0.6 + 0.4 * Math.abs(Math.cos(t * Math.PI * 2));
    const c = Math.max(0.02, ch * scallop);
    secs.push({ p: [side * len * t, 0, -c * 0.5], r: [c * 0.5, 0.018] });
  }
  for (const t of [0, 0.5, 1]) {
    const ch = ch0 + (ch1 - ch0) * t;
    bones.push(spike([[side * len * t, 0.01, 0], [side * len * t, 0.01, -ch * 0.98]], 0.045, c1, 0, c2, 5));
  }
  // A tiny glow value marks the membrane as painted so the scale pattern skips it.
  return merge([loft(secs, { top: c1, bottom: c2, glow: Math.max(0.012, glow * 0.25), radial: 8, subdiv: 2 }), ...bones]);
}

// ── Plans ─────────────────────────────────────────────────

const PATTERN_FUR = PATTERN.fur;
const PATTERN_SHAGGY = PATTERN.shaggy;

/** Sails, plates, armour and quills, placed by a function that traces the top of any spine. */
function addDorsal(parts: THREE.BufferGeometry[], l: Look, spine: (t: number) => { y: number; z: number; r: number }): void {
  if (l.sail) {
    const secs: Sec[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = 0.14 + (i / 12) * 0.74;
      const s0 = spine(t);
      const h = s0.r * l.sail * 1.6 * Math.sin(((i + 0.5) / 13) * Math.PI) ** 0.7;
      secs.push({ p: [0, s0.y + h * 0.45, s0.z], r: [Math.max(0.012, s0.r * 0.03), Math.max(0.01, h * 0.55)] });
    }
    parts.push(loft(secs, { top: l.accent, bottom: new THREE.Color(l.accent).multiplyScalar(0.55).getHex(THREE.SRGBColorSpace), glow: 0.012, radial: 6, subdiv: 2 }));
    for (let i = 0; i < 10; i++) {
      const s0 = spine(0.16 + (i / 9) * 0.7);
      const h = s0.r * l.sail * 2.05 * Math.sin(((i + 0.5) / 10) * Math.PI) ** 0.7;
      parts.push(spike([[0, s0.y, s0.z], [0, s0.y + h, s0.z]], s0.r * 0.05, '#e8dcc0', 0, '#ffffff', 5));
    }
  }
  if (l.plates) {
    for (let i = 0; i < l.plates; i++) {
      const t = 0.08 + (i / (l.plates - 1)) * 0.84;
      const s0 = spine(t);
      const h = s0.r * (0.42 + 0.48 * Math.sin(t * Math.PI));
      const side = i % 2 === 0 ? -1 : 1;
      parts.push(blob([side * s0.r * 0.13, s0.y + h * 0.75, s0.z], [s0.r * 0.05, h, h * 0.78], l.accent, new THREE.Color(l.accent).lerp(new THREE.Color('#ffd070'), 0.45).getHex(THREE.SRGBColorSpace), 0.012, 8));
    }
  }
  if (l.armorPlates) {
    for (let i = 0; i < 26; i++) {
      const row = i % 3;
      const t = 0.06 + ((i - row) / 26) * 0.92;
      const s0 = spine(t);
      const x = (row - 1) * s0.r * 0.62;
      const y = s0.y + s0.r * (row === 1 ? 0.12 : -0.06);
      parts.push(spike([[x, y - s0.r * 0.1, s0.z], [x * 1.1, y + s0.r * 0.3, s0.z]], s0.r * 0.2, l.top, 0, '#d8cdb0', 6));
    }
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
      const s0 = spine(0.1 + i * 0.13);
      parts.push(spike([[side * s0.r * 0.9, s0.y - s0.r * 0.45, s0.z], [side * s0.r * 1.45, s0.y - s0.r * 0.45, s0.z - s0.r * 0.1]], s0.r * 0.16, l.accent, 0, '#e8dcc0', 6));
    }
  }
  if (l.quills) {
    let seed = 13;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 70; i++) {
      const s0 = spine(rnd() * 0.92);
      const a = rad(10 + rnd() * 160);
      const x = Math.cos(a) * s0.r * 0.9;
      const y = s0.y - s0.r * 0.88 + Math.sin(a) * s0.r;
      const len = s0.r * (0.8 + rnd() * 0.75);
      parts.push(spike([[x, y, s0.z], [x * 1.25, y + Math.sin(a) * len * 0.6, s0.z - len]], s0.r * 0.05, '#2a2420', 0, '#f6f0e0', 4));
    }
  }
}

function buildQuad(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  const { L, H, rump, waist, chest, sh, top, bottom } = l;
  const rearY = H;
  const frontY = H + sh;
  const secs: Sec[] = [
    { p: [0, rearY + rump * 0.1, -L * 0.62], r: rump * 0.45 },
    { p: [0, rearY + rump * 0.2, -L * 0.42], r: [rump * 0.94, rump] },
    { p: [0, rearY + (frontY - rearY) * 0.45 + waist * 0.26, -L * 0.04], r: [waist * 0.9, waist * 0.92] },
    { p: [0, frontY + chest * 0.02, L * 0.28], r: [chest * 0.86, chest * 1.08] },
    { p: [0, frontY + chest * 0.14, L * 0.48], r: [chest * 0.72, chest * 0.82] },
    { p: [0, frontY + chest * 0.2, L * 0.62], r: chest * 0.34 },
  ];
  const parts: THREE.BufferGeometry[] = [loft(secs, { top, bottom, radial: 14, subdiv: 4 })];

  if (l.stripeBack) {
    parts.push(loft([
      { p: [0, rearY + rump * 1.14, -L * 0.45], r: [rump * 0.45, rump * 0.1] },
      { p: [0, rearY + (frontY - rearY) * 0.45 + waist * 1.16, -L * 0.04], r: [waist * 0.55, waist * 0.1] },
      { p: [0, frontY + chest * 1.06, L * 0.3], r: [chest * 0.45, chest * 0.1] },
    ], { top: '#f3f0e8', bottom: '#f3f0e8', radial: 8 }));
  }
  if (l.silverback) {
    parts.push(loft([
      { p: [0, rearY + rump * 0.65, -L * 0.42], r: [rump * 0.75, rump * 0.45] },
      { p: [0, rearY + (frontY - rearY) * 0.45 + waist * 0.82, -L * 0.05], r: [waist * 0.85, waist * 0.45] },
      { p: [0, frontY + chest * 0.6, L * 0.22], r: [chest * 0.78, chest * 0.5] },
    ], { top: l.accent, bottom: l.top, radial: 10 }));
  }
  addDorsal(parts, l, (t) => {
    const z = -L * 0.5 + L * 0.95 * t;
    const rBody = t < 0.5 ? rump + (waist - rump) * t * 2 : waist + (chest - waist) * (t - 0.5) * 2;
    return { y: rearY + (frontY - rearY) * t + rBody * 0.88, z, r: rBody };
  });
  if (l.shell) {
    parts.push(blob([0, rearY + (frontY - rearY) * 0.5 + waist * 0.18, 0], [Math.max(chest, waist) * 1.14, Math.max(chest, waist) * 1.02, L * 0.58], l.accent, l.top, 0, 16));
  }
  if (!l.shell && !l.backSpikes && !l.plates && !l.armorPlates && (l.pattern === PATTERN_FUR || l.pattern === PATTERN_SHAGGY)) {
    // A broken silhouette along the spine and chest reads as fur where a smooth tube reads as plastic.
    let seed = 7 + Math.round(L * 100);
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const count = l.pattern === PATTERN_SHAGGY ? 34 : 18;
    for (let i = 0; i < count; i++) {
      const t = rnd();
      const z = -L * 0.48 + L * 0.9 * t;
      const rB = t < 0.5 ? rump + (waist - rump) * t * 2 : waist + (chest - waist) * (t - 0.5) * 2;
      const a = rad(35 + rnd() * 110);
      const y0 = rearY + (frontY - rearY) * t + rB * 0.1;
      const cx = Math.cos(a) * rB * 0.9;
      const cy = y0 + Math.sin(a) * rB * 0.92;
      const len = rB * (0.22 + rnd() * 0.2);
      parts.push(spike([[cx, cy, z], [cx * 1.06, cy + len * 0.35, z - len * 0.9]], rB * 0.09, top, 0, top, 4));
    }
  }
  if (l.hump) {
    parts.push(blob([0, frontY + chest * 0.72, L * 0.18], [chest * 0.72, chest * 0.7, chest * 0.85], top, top));
    parts.push(blob([0, frontY + chest * 0.3, L * 0.5], [chest * 0.62, chest * 0.58, chest * 0.5], top, top));
  }
  if (l.backSpikes) {
    const n = l.backSpikes;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = -L * 0.5 + L * 0.95 * t;
      const wt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const baseR = t < 0.5 ? rump + (waist - rump) * wt : waist + (chest - waist) * wt;
      const baseY = rearY + (frontY - rearY) * t + baseR * 0.92;
      const h = baseR * 0.4 * (0.75 + 0.5 * Math.sin(t * Math.PI));
      parts.push(spike([[0, baseY, z], [0, baseY + h, z - h * 0.4]], baseR * 0.14, l.accent, 0, l.glowCol ?? l.accent, 5));
    }
  }
  // Evolution: ridge spines mark an Elite.
  if (evo >= 2 && !l.backSpikes) {
    const n = 7;
    const glowHex = l.glowCol ?? EVOLUTIONS[evo].color;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = -L * 0.4 + L * 0.72 * t;
      const baseR = rump + (chest - rump) * t;
      const baseY = rearY + (frontY - rearY) * t + baseR * 0.88;
      const h = baseR * 0.42 * Math.sin(t * Math.PI) + 0.03;
      parts.push(spike([[0, baseY, z], [0, baseY + h, z - h * 0.3]], baseR * 0.11, l.accent, 0.35, glowHex, 5));
    }
  }
  if (l.shag) {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 70; i++) {
      const t = rnd();
      const z = -L * 0.5 + L * t;
      const r = rump + (chest - rump) * t;
      const a = rad(-30 - rnd() * 120);
      const y = rearY + (frontY - rearY) * t;
      const cx = Math.cos(a) * r * 0.96;
      const cy = y + Math.sin(a) * r * 0.96;
      const len = r * (0.35 + rnd() * 0.3);
      parts.push(spike([[cx, cy, z], [cx * 1.08, cy - len * 0.55, z - 0.05], [cx * 1.1, cy - len, z - 0.1]], r * 0.11, top, 0, bottom, 5));
    }
  }
  addMesh(body, merge(parts));

  buildNeck(body, l, [0, frontY + chest * 0.3, L * 0.52], evo);

  const spread = l.legSpread ?? Math.max(chest, rump) * 0.54;
  const fz = L * 0.34;
  const rz = -L * 0.34;
  buildLeg(body, 'FL', l, -spread, frontY - chest * 0.15, fz, true);
  buildLeg(body, 'FR', l, spread, frontY - chest * 0.15, fz, true);
  buildLeg(body, 'RL', l, -spread * 0.96, rearY - rump * 0.1, rz, false);
  buildLeg(body, 'RR', l, spread * 0.96, rearY - rump * 0.1, rz, false);

  buildTail(body, l, [0, rearY + rump * 0.32, -L * 0.56]);

  if (l.wings) {
    const span = l.wingSpan ?? 4;
    buildWing(body, l, -1, [-chest * 0.5, frontY + chest * 0.65, L * 0.2], span);
    buildWing(body, l, 1, [chest * 0.5, frontY + chest * 0.65, L * 0.2], span);
  }
}

function buildRex(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  const { L, H, chest, waist, top, bottom } = l;
  // Everything was first drawn for a 2.1-tall tyrannosaur, so all fixed offsets scale from there.
  const k = H / 2.1;
  const hipZ = -L * 0.08;
  const legK = l.legR / 0.34;
  // The torso can tip upright on its own joint: penguins, kangaroos, ostriches. Legs stay vertical.
  const hinge = node('torso', body, [0, H, hipZ]);
  hinge.rotation.x = -(l.upright ?? 0);
  const torso = node('torsoInner', hinge, [0, -H, -hipZ]);
  const parts: THREE.BufferGeometry[] = [loft([
    { p: [0, H + 0.15 * k, -L * 0.5], r: chest * 0.55 },
    { p: [0, H + 0.2 * k, -L * 0.2], r: [waist, waist * 1.1] },
    { p: [0, H + 0.34 * k, L * 0.15], r: [chest, chest * 1.15] },
    { p: [0, H + 0.6 * k, L * 0.42], r: [chest * 0.72, chest * 0.85] },
    { p: [0, H + 0.82 * k, L * 0.52], r: chest * 0.52 },
  ], { top, bottom, radial: 14, subdiv: 4 })];
  const spine = (t: number) => {
    const z = -L * 0.45 + L * 0.9 * t;
    return { y: H + (0.2 + 0.5 * t) * k + chest * (0.65 + 0.4 * Math.sin(t * Math.PI)), z, r: chest };
  };
  for (let i = 0; i < (l.backSpikes ?? 0); i++) {
    const t = i / ((l.backSpikes ?? 1) - 1);
    const s0 = spine(t);
    parts.push(spike([[0, s0.y, s0.z], [0, s0.y + 0.24 * k, s0.z - 0.1 * k]], 0.07 * k, l.accent, 0, l.accent, 5));
  }
  addDorsal(parts, l, spine);
  if (l.pattern === PATTERN.feather || l.pattern === PATTERN.fur) {
    // Feather or fur tufts along the back.
    for (let i = 0; i < 14; i++) {
      const s0 = spine(i / 13);
      const off = (i % 3 - 1) * chest * 0.3;
      parts.push(spike([[off, s0.y - chest * 0.1, s0.z], [off, s0.y + chest * 0.22, s0.z - chest * 0.5]], chest * 0.12, l.accent, 0, top, 4));
    }
  }
  addMesh(torso, merge(parts));
  buildNeck(torso, l, [0, H + 0.82 * k, L * 0.48], evo);
  // On a beast that stands tall, the head stays looking ahead rather than tipping back with the body.
  const headAnchor = torso.getObjectByName('headAnchor');
  if (headAnchor) headAnchor.rotation.x = l.upright ?? 0;

  // Arms get their own joints, so they can swing in a fight.
  const armStyle = l.arms ?? 'tiny';
  if (armStyle !== 'none') {
    const len = { tiny: 0.5, claw: 1.0, long: 1.35, scythe: 1.4, flipper: 1.1 }[armStyle] * k * 1.05;
    const r = chest * (armStyle === 'tiny' ? 0.15 : armStyle === 'flipper' ? 0.2 : 0.17);
    for (const [name, side] of [['L', -1], ['R', 1]] as const) {
      const arm = node(`arm${name}`, torso, [side * chest * 0.82, H + 0.14 * k, L * 0.32]);
      const armParts: THREE.BufferGeometry[] = [];
      if (armStyle === 'flipper') {
        armParts.push(loft([
          { p: [0, 0, 0], r: [r * 0.5, r] },
          { p: [side * r * 0.5, -len * 0.5, 0], r: [r * 0.4, r * 1.1] },
          { p: [side * r * 0.9, -len, 0], r: [r * 0.2, r * 0.3] },
        ], { top, bottom: top, radial: 8 }));
      } else {
        armParts.push(loft([
          { p: [0, 0, 0], r },
          { p: [side * r * 0.5, -len * 0.5, len * 0.12], r: r * 0.8 },
          { p: [side * r * 0.3, -len, len * 0.3], r: r * 0.55 },
        ], { top, bottom: top, radial: 8 }));
        const claws = armStyle === 'scythe' ? 3 : 2;
        const clawLen = armStyle === 'scythe' ? len * 0.85 : len * 0.26;
        for (let c = 0; c < claws; c++) {
          const cx = side * r * 0.3 + (c - (claws - 1) / 2) * r * 0.5;
          armParts.push(spike([[cx, -len, len * 0.3], [cx, -len - clawLen * 0.6, len * 0.3 + clawLen * 0.5], [cx, -len - clawLen, len * 0.3 + clawLen * 0.4]], r * 0.34, '#e7ddc6', 0, '#ffffff', 5));
        }
        if (l.thumbSpike) armParts.push(spike([[side * r, -len * 0.85, len * 0.34], [side * r * 2, -len * 0.7, len * 0.6]], r * 0.45, '#e7ddc6', 0, '#ffffff', 5));
      }
      addMesh(arm, merge(armParts));
    }
  }

  for (const [name, side] of [['RL', -1], ['RR', 1]] as const) {
    const hip = node(`hip${name}`, body, [side * Math.max(chest * 0.72, l.legR * 1.2), H, hipZ]);
    const up = H * 0.5;
    const lo = H * 0.5;
    addMesh(hip, loft([
      { p: [0, 0.2 * legK, 0], r: 0.56 * legK },
      { p: [0, -up * 0.5, 0.2 * k], r: 0.48 * legK },
      { p: [0, -up, 0.3 * k], r: 0.26 * legK },
    ], { top, bottom: top, radial: 12, subdiv: 2 }));
    const knee = node(`knee${name}`, hip, [0, -up, 0.3 * k]);
    const footR = Math.max(0.28 * k, l.pawR);
    const foot = [
      loft([
        { p: [0, 0, 0], r: 0.24 * legK },
        { p: [0, -lo * 0.55, -0.26 * k], r: 0.17 * legK },
        { p: [0, -lo, -0.3 * k], r: 0.16 * legK },
      ], { top, bottom: top, radial: 10, subdiv: 2 }),
      blob([0, -lo + 0.07 * k, -0.08 * k], [footR, footR * 0.45, footR * 1.9], l.beak ? (l.dark === '#17120f' ? top : l.dark) : l.dark, l.dark, 0, 9),
    ];
    for (let c = -1; c <= 1; c++) {
      foot.push(spike([[c * footR * 0.6, -lo + 0.04 * k, footR * 1.05], [c * footR * 0.7, -lo - 0.02 * k, footR * 2.2]], footR * 0.28, '#e7ddc6', 0, '#ffffff', 4));
    }
    if (l.sickle) foot.push(spike([[side * footR * 0.6, -lo + footR * 0.5, footR * 0.7], [side * footR * 0.7, -lo + footR * 1.3, footR * 1.5], [side * footR * 0.7, -lo + footR * 0.5, footR * 2.2]], footR * 0.3, '#f0e8d8', 0, '#ffffff', 5));
    addMesh(knee, merge(foot));
  }
  if (l.tail !== 'bob') {
    buildTail(torso, l, [0, H + 0.15 * k, -L * 0.48]);
    const tailBase = torso.getObjectByName('tailBase');
    // Tipping up shouldn't drive the tail into the ground.
    if (tailBase) tailBase.rotation.x = (l.upright ?? 0) * 0.85;
  } else {
    node('tailBase', torso, [0, H, -L * 0.45]);
    if (l.tailR) addMesh(torso, blob([0, H + 0.12 * k, -L * 0.48], [l.tailR, l.tailR * 0.7, l.tailR * 1.2], l.top, l.bottom, 0, 8));
  }
}

function buildSnake(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  // Coil on the ground.
  const coil: Sec[] = [];
  const coilN = 16;
  for (let i = 0; i <= coilN; i++) {
    const t = i / coilN;
    const a = t * Math.PI * 3.6;
    const R = 0.42 - 0.2 * t;
    coil.push({ p: [Math.cos(a) * R, 0.1 + t * 0.2, Math.sin(a) * R - 0.1], r: 0.13 - 0.03 * t * t + (t < 0.15 ? -0.05 * (0.15 - t) / 0.15 : 0) });
  }
  addMesh(body, loft(coil, { top: l.top, bottom: l.bottom, radial: 9, subdiv: 2 }));
  if (l.rattle) {
    const start = coil[0].p;
    addMesh(body, merge([0, 1, 2, 3].map((i) => blob([start[0] + 0.02, start[1] + 0.12 + i * 0.07, start[2]], [0.06 - i * 0.008, 0.045, 0.06 - i * 0.008], '#e8d8b0', '#a89878', 0, 7))));
  }

  // Raised neck as a chain.
  let prev: THREE.Object3D = node('neck0', body, [0.12, 0.25, -0.15]);
  const segs = 5;
  const stepY = 0.2;
  for (let i = 0; i < segs; i++) {
    const n = i === 0 ? (prev as THREE.Group) : node(`neck${i}`, prev, [0, stepY, 0.03]);
    const r0 = 0.12 - i * 0.008;
    addMesh(n, loft([
      { p: [0, 0, 0], r: r0 },
      { p: [0, stepY, 0.03], r: r0 - 0.008 },
    ], { top: l.top, bottom: l.bottom, radial: 8, subdiv: 1 }));
    prev = n;
  }
  // Hood.
  const hood = loft([
    { p: [0, -0.05, -0.02], r: [0.1, 0.03] },
    { p: [0, 0.16, -0.03], r: [0.3, 0.035] },
    { p: [0, 0.34, -0.03], r: [0.27, 0.035] },
    { p: [0, 0.48, -0.01], r: [0.09, 0.03] },
  ], { top: l.top, bottom: l.accent, radial: 10 });
  if (!l.noHood) {
    const hoodNode = node('hood', prev, [0, 0, 0]);
    addMesh(hoodNode, hood);
  }
  const anchor = node('headAnchor', prev, [0, stepY + 0.04, 0.07]);
  buildHead(anchor, l, evo);
  // Tongue hint: small emissive fork.
  const head = anchor.getObjectByName('head')!;
  addMesh(head, spike([[0, -0.03, l.headLen + l.snoutLen], [0, -0.05, l.headLen + l.snoutLen + 0.1]], 0.012, '#ff3050', 0.6, '#ff3050', 4));
}

function buildScorpion(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  const H = l.H;
  const parts: THREE.BufferGeometry[] = l.spider ? [
    blob([0, H + 0.04, 0.2], [0.34, 0.2, 0.38], l.top, l.bottom, 0, 12),
    blob([0, H + 0.2, -0.48], [0.5, 0.42, 0.58], l.top, l.bottom, 0, 14),
    ...[-1, 1].map((sd) => spike([[sd * 0.1, H - 0.02, 0.5], [sd * 0.12, H - 0.16, 0.66], [sd * 0.06, H - 0.26, 0.72]], 0.055, '#2a1a14', 0, l.accent, 6)),
    ...(l.hourglass ? [blob([0, H - 0.2, -0.48], [0.14, 0.16, 0.2], l.accent, l.accent, 0.9, 8)] : []),
  ] : l.crab ? [
    blob([0, H + 0.06, 0], [0.62, 0.26, 0.46], l.top, l.bottom, 0, 14),
  ] : [loft([
    { p: [0, H, -0.52], r: [0.24, 0.14] },
    { p: [0, H + 0.03, -0.22], r: [0.36, 0.2] },
    { p: [0, H + 0.04, 0.12], r: [0.42, 0.22] },
    { p: [0, H + 0.02, 0.4], r: [0.3, 0.16] },
    { p: [0, H, 0.58], r: [0.15, 0.08] },
  ], { top: l.top, bottom: l.bottom, radial: 12, subdiv: 3 })];
  // Armour ridges.
  if (!l.spider && !l.crab) for (let i = 0; i < 5; i++) {
    const z = -0.45 + i * 0.2;
    parts.push(blob([0, H + 0.16 - Math.abs(z) * 0.03, z], [0.3 - Math.abs(z + 0.05) * 0.2, 0.08, 0.1], l.top, l.dark, 0, 8));
  }
  if (l.crab) {
    for (const side of [-1, 1]) {
      parts.push(spike([[side * 0.16, H + 0.26, 0.34], [side * 0.18, H + 0.46, 0.4]], 0.03, l.top, 0, l.top, 5));
      parts.push(blob([side * 0.18, H + 0.48, 0.4], [0.06, 0.06, 0.06], '#ffffff', '#ffffff', EYE, 7));
    }
  } else for (const side of [-1, 1]) {
    parts.push(blob([side * 0.14, H + 0.12, 0.42], [0.04, 0.04, 0.04], '#fff', '#fff', EYE, 7));
    parts.push(blob([side * 0.07, H + 0.13, 0.47], [0.03, 0.03, 0.03], '#fff', '#fff', EYE, 7));
  }
  addMesh(body, merge(parts));

  // Eight articulated legs.
  const legNames = ['FL', 'FR', 'ML', 'MR', 'BL', 'BR', 'RL', 'RR'];
  legNames.forEach((name, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const z = 0.28 - row * 0.2;
    const hip = node(`hip${name}`, body, [side * 0.32, H, z]);
    addMesh(hip, spike([[0, 0, 0], [side * 0.28, 0.1, (row - 1.5) * -0.04], [side * 0.44, 0.08, (row - 1.5) * -0.08]], 0.05, l.top, 0, l.bottom, 6));
    const knee = node(`knee${name}`, hip, [side * 0.44, 0.08, (row - 1.5) * -0.08]);
    addMesh(knee, spike([[0, 0, 0], [side * 0.12, -0.25, 0], [side * 0.14, -H - 0.06, 0]], 0.035, l.top, 0, l.dark, 6));
  });

  // Pincers on jointed arms.
  if (!l.spider) for (const [name, side] of [['L', -1], ['R', 1]] as const) {
    const arm = node(`claw${name}`, body, [side * 0.3, H + 0.02, 0.42]);
    addMesh(arm, loft([
      { p: [0, 0, 0], r: 0.07 },
      { p: [side * 0.26, 0.06, 0.26], r: 0.075 },
      { p: [side * 0.3, 0.04, 0.42], r: 0.07 },
    ], { top: l.top, bottom: l.bottom, radial: 7, subdiv: 2 }));
    const hand = node(`hand${name}`, arm, [side * 0.3, 0.04, 0.44]);
    addMesh(hand, merge([
      blob([0, 0, 0.1], [0.14, 0.1, 0.2], l.top, l.bottom),
      spike([[side * 0.05, 0, 0.22], [side * 0.08, 0, 0.42], [side * -0.03, 0, 0.56]], 0.07, l.top, 0, l.accent, 6),
    ]));
    const pinch = node(`pinch${name}`, hand, [side * -0.06, 0, 0.2]);
    addMesh(pinch, spike([[0, 0, 0], [side * -0.03, 0, 0.18], [side * 0.05, 0, 0.32]], 0.05, l.top, 0, l.accent, 6));
  }

  // Tail arcing overhead.
  if (l.spider || l.crab) return;
  const segs = 7;
  const seg = l.tailLen / segs;
  let prev: THREE.Object3D = node('tailBase', body, [0, H + 0.02, -0.5]);
  prev.rotation.x = 0;
  for (let i = 0; i < segs; i++) {
    const n = node(`tail${i}`, prev, i === 0 ? [0, 0, 0] : [0, 0, -seg]);
    n.rotation.x = i === 0 ? 0.6 : 0.42;
    const r = l.tailR * (1 - i * 0.07);
    addMesh(n, merge([
      blob([0, 0, -seg * 0.5], [r, r, seg * 0.62], l.top, l.bottom, 0, 8),
      ...(i === segs - 1
        ? [
          blob([0, 0, -seg * 1.05], [r * 1.25, r * 1.25, r * 1.5], l.accent, l.accent, 0.8, 9),
          spike([[0, 0, -seg * 1.2], [0, 0.06, -seg * 1.6], [0, 0.22, -seg * 1.95]], r * 0.55, l.accent, 1, '#ffffff', 6),
        ]
        : []),
    ]));
    prev = n;
  }
}

function buildBird(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  const { L, chest, waist, rump, top, bottom } = l;
  const glow = l.bodyGlow ? Math.min(0.3, l.bodyGlow * 0.2) : 0;
  const parts: THREE.BufferGeometry[] = [loft([
    { p: [0, 0, -L * 0.55], r: rump * 0.42 },
    { p: [0, 0, -L * 0.28], r: [rump, rump * 0.95] },
    { p: [0, 0.02, L * 0.05], r: [waist, waist * 1.02] },
    { p: [0, 0.06, L * 0.3], r: [chest, chest * 0.98] },
    { p: [0, 0.12, L * 0.5], r: chest * 0.52 },
  ], { top, bottom, radial: 12, subdiv: 3, glow })];
  addMesh(body, merge(parts));

  // Beak and head built with the shared head, swapped to bird proportions.
  const headL: Look = { ...l, snoutR: l.snoutR, bottom: l.accent, top: l.pattern === 4 ? l.accent : l.top };
  buildNeckBird(body, headL, [0, 0.12, L * 0.42], evo);

  // Talons.
  for (const [name, side] of [['RL', -1], ['RR', 1]] as const) {
    const hip = node(`hip${name}`, body, [side * rump * 0.6, -rump * 0.5, -L * 0.12]);
    addMesh(hip, spike([[0, 0, 0], [0, -l.legRear * 0.5, -0.05]], l.legR * 1.7, l.dark, 0, l.dark, 6));
    const knee = node(`knee${name}`, hip, [0, -l.legRear * 0.5, -0.05]);
    const claws: THREE.BufferGeometry[] = [spike([[0, 0, 0], [0, -l.legRear * 0.3, 0.05]], l.legR * 1.2, l.dark, 0, l.dark, 6)];
    for (const c of [-1, 0, 1]) {
      claws.push(spike([[0, -l.legRear * 0.3, 0.05], [c * l.pawR * 1.2, -l.legRear * 0.38, l.pawR * 1.6], [c * l.pawR * 1.5, -l.legRear * 0.56, l.pawR * 2.1]], l.pawR * 0.3, l.dark, 0, '#2b2622', 5));
    }
    addMesh(knee, merge(claws));
  }

  // Tail fan.
  const fan = node('tailBase', body, [0, 0.02, -L * 0.5]);
  const feathers: THREE.BufferGeometry[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const a = (i / (count - 1) - 0.5) * 1.1;
    const fl = l.tailLen * (l.tail === 'long' ? 1 - Math.abs(a) * 0.3 + (i % 2) * 0.25 : 1);
    feathers.push(loft([
      { p: [0, 0, 0], r: [l.tailR * 0.22, 0.02] },
      { p: [Math.sin(a) * fl * 0.55, -0.02, -Math.cos(a) * fl * 0.55], r: [l.tailR * 0.42, 0.024] },
      { p: [Math.sin(a) * fl, -0.04, -Math.cos(a) * fl], r: [l.tailR * 0.08, 0.01] },
    ], { top: l.top, bottom: l.dark, glow: glow * 1.3, radial: 6, subdiv: 2 }));
  }
  addMesh(fan, merge(feathers));
  // A single articulated tail node keeps the shared animator happy.
  node('tail0', fan);

  const span = l.wingSpan ?? 3;
  buildWing(body, l, -1, [-chest * 0.6, 0.18, L * 0.14], span / 2);
  buildWing(body, l, 1, [chest * 0.6, 0.18, L * 0.14], span / 2);
}

function buildNeckBird(body: THREE.Object3D, l: Look, base: V3, evo: number): void {
  const n = node('neck0', body, base);
  const angle = rad(l.neckAngle);
  const dz = Math.cos(angle) * l.neckLen;
  const dy = Math.sin(angle) * l.neckLen;
  addMesh(n, loft([
    { p: [0, 0, 0], r: l.neckR },
    { p: [0, dy, dz], r: l.neckR * 0.85 },
  ], { top: l.top, bottom: l.bottom, radial: 10, subdiv: 2, glow: l.bodyGlow ? Math.min(0.3, l.bodyGlow * 0.2) : 0 }));
  const anchor = node('headAnchor', n, [0, dy, dz]);
  buildBirdHead(anchor, l, evo);
}

function buildBirdHead(anchor: THREE.Object3D, l: Look, evo: number): void {
  const head = node('head', anchor);
  if (l.headScale) head.scale.setScalar(l.headScale);
  const { headLen: hl, headR: hr, snoutLen: sl, snoutR: sr } = l;
  const glow = l.bodyGlow ? Math.min(0.3, l.bodyGlow * 0.2) : 0;
  const beakCol = l.dark;
  const g: (THREE.BufferGeometry | null)[] = [
    loft([
      { p: [0, 0, -hl * 0.4], r: hr * 0.8 },
      { p: [0, hr * 0.1, hl * 0.3], r: hr },
      { p: [0, 0, hl], r: hr * 0.62 },
    ], { top: l.top, bottom: l.bottom, radial: 10, glow }),
    spike([[0, hr * 0.05, hl * 0.9], [0, hr * 0.02, hl + sl * 0.55], [0, -hr * 0.3, hl + sl]], sr * 1.45, beakCol, 0, '#352a17', 8),
  ];
  const eyeR = hr * (l.bigEyes ? 0.34 : 0.18);
  for (const side of [-1, 1]) eye(g, side * hr * (l.bigEyes ? 0.48 : 0.66), hr * 0.3, hl * 0.42, eyeR);
  if (l.ears === 'pointy') for (const side of [-1, 1]) {
    g.push(spike([[side * hr * 0.5, hr * 0.7, 0], [side * hr * 0.75, hr * 1.6, -hl * 0.2]], hr * 0.26, l.top, 0, l.top, 6));
  }
  if (l.crest) g.push(spike([[0, hr * 0.5, hl * 0.2], [0, hr * 1.2, -hl * 0.8], [0, hr * 1.6, -hl * (1.2 + l.crest * 2.4)]], hr * 0.34, l.accent, 0, '#ffb060', 7));
  if (l.bodyGlow) {
    // Flaming crest.
    for (let i = 0; i < 5; i++) {
      g.push(spike([[0, hr * 0.8, hl * 0.2 - i * 0.07], [0, hr * 1.6 + i * 0.04, -hl * 0.1 - i * 0.14], [0, hr * 1.9 + i * 0.05, -hl * 0.6 - i * 0.24]], hr * 0.2, l.top, 1, l.dark, 5));
    }
  }
  if (evo >= 3) {
    for (let i = -1; i <= 1; i++) {
      g.push(spike([[i * hr * 0.4, hr * 0.8, 0], [i * hr * 0.5, hr * 1.5, 0]], hr * 0.13, EVOLUTIONS[3].color, 0.9, '#fff7cf', 5));
    }
  }
  addMesh(head, merge(g));
  node('jaw', head, [0, 0, 0]);
}

// ── Insects ───────────────────────────────────────────────
function buildInsect(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  const { L, H, chest, waist, rump, top, bottom } = l;
  const tZ = L * 0.12;
  const parts: THREE.BufferGeometry[] = [];
  // Thorax.
  parts.push(blob([0, H, tZ], [chest, chest * 0.9, chest * 1.25], top, bottom, 0, 12));
  // Waist and segmented abdomen.
  const abZ = tZ - chest - rump * 0.9;
  parts.push(loft([
    { p: [0, H, tZ - chest * 0.9], r: waist * 0.8 },
    { p: [0, H - rump * 0.05, abZ + rump * 0.6], r: rump * 0.85 },
    { p: [0, H - rump * 0.08, abZ], r: rump },
    { p: [0, H - rump * 0.1, abZ - rump * 1.0], r: rump * 0.72 },
    { p: [0, H - rump * 0.12, abZ - rump * (l.wingKind === 'long' ? 5 : 1.7)], r: rump * 0.1 },
  ], { top, bottom, radial: 12, subdiv: 3 }));
  if (l.glowTail) parts.push(blob([0, H - rump * 0.1, abZ - rump * 0.95], [rump * 0.75, rump * 0.72, rump * 0.75], l.accent, l.accent, 1, 10));
  if (l.stinger) parts.push(spike([[0, H - rump * 0.12, abZ - rump * 1.6], [0, H - rump * 0.2, abZ - rump * 2.4]], rump * 0.16, '#1a120a', 0, '#000000', 5));
  if (l.shell) {
    // Wing cases: domed with a seam down the middle.
    const shellR = Math.max(rump, chest);
    parts.push(blob([0, H + shellR * 0.08, abZ + rump * 0.1], [shellR * 1.08, shellR * 0.98, rump * 1.65], top, l.accent, 0, 16));
    parts.push(blob([0, H + shellR * 1.03, abZ + rump * 0.1], [shellR * 0.03, shellR * 0.04, rump * 1.5], '#0a0808', '#0a0808', 0, 6));
  }
  addMesh(body, merge(parts));

  // Head.
  const headZ = tZ + chest * 1.2 + l.headR * 0.65;
  const anchor = node('neck0', body, [0, H + (l.raptorial ? chest * 0.5 : 0.02), headZ]);
  const head = node('head', anchor);
  const hr = l.headR;
  const hp: (THREE.BufferGeometry | null)[] = [blob([0, 0, 0], [hr, hr * 0.85, hr * 0.9], top, bottom, 0, 12)];
  for (const side of [-1, 1]) {
    // Compound eyes: large, glossy, and glowing in team colour so sides are easy to read.
    hp.push(blob([side * hr * 0.72, hr * 0.22, hr * 0.32], [hr * 0.4, hr * 0.46, hr * 0.42], '#ffffff', '#ffffff', EYE, 9));
    if (l.antennae) {
      const a = l.antennae * hr * 2.6;
      hp.push(spike([[side * hr * 0.25, hr * 0.7, hr * 0.5], [side * (hr * 0.5 + a * 0.3), hr * 0.8 + a * 0.55, hr * 0.7], [side * (hr * 0.6 + a * 0.75), hr * 0.8 + a * 0.75, hr * 0.9 + a * 0.15]], Math.max(0.012, hr * 0.06), l.dark, 0, l.dark, 4));
    }
  }
  if (l.bugHorn) {
    hp.push(spike([[0, hr * 0.3, hr * 0.8], [0, hr * (0.9 + l.bugHorn), hr * (1.2 + l.bugHorn * 0.7)], [0, hr * (2 + l.bugHorn * 1.3), hr * (0.9 + l.bugHorn * 0.5)]], hr * 0.32, l.accent, 0, '#1a100a', 7));
    hp.push(spike([[0, hr * 0.8, 0], [0, hr * 2, hr * 0.7]], hr * 0.2, l.accent, 0, '#1a100a', 6));
  }
  if (l.crown) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.8;
      hp.push(spike([[Math.sin(a) * hr * 0.6, hr * 0.7, Math.cos(a) * hr * 0.1], [Math.sin(a) * hr * 0.75, hr * 1.45, Math.cos(a) * hr * 0.1]], hr * 0.15, '#ffd860', 0.5, '#fff4b0', 5));
    }
  }
  addMesh(head, merge(hp));
  // Mandibles close on bites using the jaw joint.
  const jaw = node('jaw', head, [0, -hr * 0.3, hr * 0.7]);
  const md = l.mandibles ?? 0.15;
  const mLen = hr * (0.8 + md * 2.2);
  const jp: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    jp.push(spike([[side * hr * 0.32, 0, 0], [side * hr * (0.45 + md * 0.65), 0, mLen * 0.55], [side * hr * 0.1, 0, mLen]], hr * (0.13 + md * 0.09), l.dark, 0, l.accent, 6));
  }
  addMesh(jaw, merge(jp));

  // Six legs.
  const names = ['FL', 'FR', 'ML', 'MR', 'RL', 'RR'];
  names.forEach((name, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    if (l.raptorial && row === 0) return;
    const z = tZ + chest * (0.6 - row * 0.6);
    const hindK = l.hindLong && row === 2 ? 1.75 : 1;
    const reach = l.legFront * 0.62 * hindK;
    const hip = node(`hip${name}`, body, [side * chest * 0.72, H - chest * 0.25, z]);
    const kx = side * reach;
    const ky = H * (l.hindLong && row === 2 ? 1.1 : 0.45);
    const kz = (1 - row) * reach * 0.42 - (hindK > 1 ? reach * 0.45 : 0);
    addMesh(hip, spike([[0, 0, 0], [kx * 0.5, ky * 0.65, kz * 0.5], [kx, ky, kz]], l.legR * (hindK > 1 ? 1.9 : 1.2), top, 0, l.dark, 6));
    const knee = node(`knee${name}`, hip, [kx, ky, kz]);
    const footY = -(H - chest * 0.25) - ky;
    addMesh(knee, spike([[0, 0, 0], [kx * 0.25, footY * 0.55, kz * 0.15 - (hindK > 1 ? reach * 0.3 : 0)], [kx * 0.42, footY, kz * 0.25 - (hindK > 1 ? reach * 0.45 : 0)]], l.legR, l.dark, 0, '#000000', 5));
  });
  if (l.raptorial) {
    for (const [name, side] of [['L', -1], ['R', 1]] as const) {
      const arm = node(`claw${name}`, body, [side * chest * 0.6, H + chest * 0.5, tZ + chest * 0.9]);
      const a = hr * 3.2;
      addMesh(arm, loft([
        { p: [0, 0, 0], r: hr * 0.2 },
        { p: [side * hr * 0.3, a * 0.55, a * 0.25], r: hr * 0.24 },
        { p: [side * hr * 0.3, a * 0.75, a * 0.4], r: hr * 0.14 },
      ], { top, bottom, radial: 8, subdiv: 2 }));
      const hand = node(`hand${name}`, arm, [side * hr * 0.3, a * 0.75, a * 0.4]);
      addMesh(hand, merge([
        spike([[0, 0, 0], [0, -a * 0.25, a * 0.45], [0, -a * 0.65, a * 0.6]], hr * 0.2, top, 0, l.accent, 6),
        ...[0.3, 0.55, 0.8].map((t) => spike([[0, -a * 0.65 * t, a * 0.6 * t], [0, -a * 0.65 * t - a * 0.12, a * 0.6 * t - a * 0.08]], hr * 0.05, l.accent, 0, '#ffffff', 4)),
      ]));
      node(`pinch${name}`, hand, [0, 0, 0]);
    }
  }

  // Wings.
  if (l.wingKind || l.flyingBug) {
    const kind = l.wingKind ?? 'clear';
    const span = kind === 'butterfly' ? L * 1.15 : kind === 'long' ? L * 0.65 : L * 0.72;
    for (const [name, side] of [['L', -1], ['R', 1]] as const) {
      const wing = node(`wing${name}`, body, [side * chest * 0.55, H + chest * 0.6, tZ]);
      const wp: THREE.BufferGeometry[] = [];
      const col1 = kind === 'butterfly' ? l.accent : '#d8ecf0';
      const col2 = kind === 'butterfly' ? '#2a1408' : '#a8c4d0';
      const glow = kind === 'butterfly' ? 0.25 : 0.2;
      if (kind === 'butterfly') {
        wp.push(blob([side * span * 0.55, 0, span * 0.28], [span * 0.55, 0.012, span * 0.5], col1, col1, glow, 14));
        wp.push(blob([side * span * 0.45, 0, -span * 0.38], [span * 0.42, 0.012, span * 0.4], col1, col1, glow, 14));
        wp.push(blob([side * span * 0.7, 0.008, span * 0.35], [span * 0.14, 0.012, span * 0.14], '#2a1408', '#2a1408', 0.02, 10));
        wp.push(blob([side * span * 0.5, 0.008, -span * 0.38], [span * 0.12, 0.012, span * 0.12], '#ffffff', '#ffffff', glow, 10));
      } else {
        wp.push(blob([side * span * 0.5, 0, 0], [span * 0.52, 0.01, span * (kind === 'long' ? 0.13 : 0.24)], col1, col2, glow, 12));
        wp.push(blob([side * span * 0.42, 0, -span * (kind === 'long' ? 0.28 : 0.3)], [span * 0.44, 0.01, span * (kind === 'long' ? 0.12 : 0.18)], col1, col2, glow, 12));
      }
      addMesh(wing, merge(wp));
      node(`wingTip${name}`, wing, [0, 0, 0]);
    }
  }
  void evo;
}

// ── Centipede: a long chain of plated, many-legged segments ──
function buildCentipede(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  void evo;
  const segs = 12;
  const seg = 0.3;
  const r = l.chest;
  const y = r * 1.05;
  // Head at the front, the chain trails back from the base.
  const headParts: (THREE.BufferGeometry | null)[] = [blob([0, y, 0.28], [r * 1.15, r * 0.8, r * 1.2], l.top, l.bottom, 0, 12)];
  for (const side of [-1, 1]) {
    headParts.push(blob([side * r * 0.7, y + r * 0.38, 0.5], [r * 0.22, r * 0.22, r * 0.22], '#fff', '#fff', EYE, 7));
    headParts.push(spike([[side * r * 0.4, y + r * 0.5, 0.5], [side * r * 1.1, y + r * 1.3, 0.85], [side * r * 1.5, y + r * 1.5, 1.25]], r * 0.11, l.accent, 0, l.dark, 5));
  }
  const n0 = node('neck0', body, [0, 0, 0]);
  const head = node('head', n0);
  addMesh(head, merge(headParts));
  const jaw = node('jaw', head, [0, y - r * 0.3, 0.45]);
  addMesh(jaw, merge([-1, 1].map((sd) => spike([[sd * r * 0.4, 0, 0], [sd * r * 0.9, 0, r * 0.75], [sd * r * 0.15, 0, r * 1.3]], r * 0.22, l.accent, 0, '#1a0c08', 6))));
  let prev: THREE.Object3D = node('tailBase', body, [0, 0, 0]);
  for (let i = 0; i < segs; i++) {
    const n = node(`tail${i}`, prev, i === 0 ? [0, 0, 0] : [0, 0, -seg]);
    const k = 1 - (i / segs) * 0.45;
    const parts: THREE.BufferGeometry[] = [
      blob([0, y, -seg * 0.5], [r * k, r * 0.72 * k, seg * 0.72], i % 2 ? l.top : l.dark, l.bottom, 0, 8),
    ];
    for (const side of [-1, 1]) {
      const w = r * k;
      parts.push(spike([[side * w * 0.8, y, -seg * 0.5], [side * w * 1.8, y * 1.15, -seg * 0.3], [side * w * 2.3, 0.02, -seg * 0.65]], 0.032, l.accent, 0, l.dark, 4));
    }
    addMesh(n, merge(parts));
    prev = n;
  }
}

// ── Fish: sky-swimming sharks and friends ──────────────────
function buildFish(root: THREE.Group, l: Look, evo: number): void {
  const pivot = node('pivot', root);
  const body = node('body', pivot);
  void evo;
  const { L, chest, waist, top, bottom } = l;
  const parts: THREE.BufferGeometry[] = [loft([
    { p: [0, 0, -L * 0.45], r: [waist * 0.3, waist * 0.4] },
    { p: [0, 0, -L * 0.15], r: [waist * 0.85, waist] },
    { p: [0, 0, L * 0.18], r: [chest * 0.92, chest] },
    { p: [0, -chest * 0.03, L * 0.4], r: [chest * 0.8, chest * 0.82] },
  ], { top, bottom, radial: 14, subdiv: 4 })];
  // Dorsal and belly fins.
  parts.push(spike([[0, chest * 0.8, L * 0.08], [0, chest * 1.5, -L * 0.03], [0, chest * 2.05, -L * 0.14]], chest * 0.34, top, 0, l.accent, 7));
  parts.push(spike([[0, -chest * 0.85, -L * 0.2], [0, -chest * 1.25, -L * 0.28]], chest * 0.16, top, 0, l.accent, 6));
  if (l.whitePatch) for (const sd of [-1, 1]) parts.push(blob([sd * chest * 0.62, chest * 0.36, L * 0.32], [chest * 0.2, chest * 0.2, chest * 0.42], '#f6f6f0', '#f6f6f0', 0.02, 8));
  addMesh(body, merge(parts));

  // Pectoral fins flap on the wing joints.
  for (const [name, side] of [['L', -1], ['R', 1]] as const) {
    const fin = node(`wing${name}`, body, [side * chest * 0.8, -chest * 0.35, L * 0.2]);
    const span = chest * (l.flippers ? 1.8 : 1.5);
    addMesh(fin, loft([
      { p: [0, 0, 0], r: [chest * 0.34, chest * 0.05] },
      { p: [side * span * 0.55, -span * 0.2, -chest * 0.18], r: [chest * 0.26, chest * 0.04] },
      { p: [side * span, -span * 0.42, -chest * 0.5], r: [chest * 0.05, chest * 0.015] },
    ], { top, bottom: l.accent, radial: 8 }));
    node(`wingTip${name}`, fin, [0, 0, 0]);
  }

  // Tail in two joints with a crescent fin.
  const seg0 = node('tail0', node('tailBase', body, [0, 0, -L * 0.45]));
  addMesh(seg0, loft([
    { p: [0, 0, 0], r: [waist * 0.3, waist * 0.4] },
    { p: [0, 0, -L * 0.12], r: [waist * 0.14, waist * 0.22] },
  ], { top, bottom, radial: 8, subdiv: 1 }));
  const seg1 = node('tail1', seg0, [0, 0, -L * 0.12]);
  const t = l.tailLen;
  addMesh(seg1, merge([
    spike([[0, 0, 0], [0, t * 0.5, -t * 0.32], [0, t * 0.95, -t * 0.62]], l.tailR * 0.42, top, 0, l.accent, 7),
    spike([[0, 0, 0], [0, -t * 0.32, -t * 0.22], [0, -t * 0.6, -t * 0.42]], l.tailR * 0.32, top, 0, l.accent, 7),
  ]));

  // Head, jaw and teeth.
  const anchor = node('neck0', body, [0, -chest * 0.03, L * 0.4]);
  const head = node('head', anchor);
  const hl = l.headLen;
  const hr = l.headR;
  const sl = l.snoutLen;
  const sr = l.snoutR;
  const hp: (THREE.BufferGeometry | null)[] = [loft([
    { p: [0, 0, -hl * 0.1], r: [hr * 1.05, hr] },
    { p: [0, hr * 0.15, hl * 0.6], r: [hr * 0.85, hr * 0.68] },
    { p: [0, hr * 0.1, hl + sl * 0.6], r: [sr, sr * 0.75] },
    { p: [0, hr * 0.05, hl + sl], r: [sr * 0.3, sr * 0.3] },
  ], { top, bottom: top, radial: 12, subdiv: 3 })];
  if (l.tusk) {
    // One long spiral horn, like a sea unicorn.
    hp.push(spike([[0, hr * 0.1, hl + sl * 0.7], [0, hr * 0.32, hl + sl + hr * 1.8], [0, hr * 0.5, hl + sl + hr * 3.8]], sr * 0.34, '#e8f4ff', 0.3, '#ffffff', 7));
  }
  if (l.hammer) {
    hp.push(blob([0, hr * 0.15, hl + sl * 0.6], [hr * 2.1, hr * 0.26, hr * 0.5], top, bottom, 0, 12));
    for (const side of [-1, 1]) eye(hp, side * hr * 2.0, hr * 0.2, hl + sl * 0.65, hr * 0.17);
  } else {
    for (const side of [-1, 1]) eye(hp, side * hr * 0.7, hr * 0.38, hl * 0.72, hr * 0.13);
  }
  for (const zz of [0.25, 0.45, 0.65, 0.85]) for (const side of [-1, 1]) {
    hp.push(spike([[side * sr * (1.2 - zz * 0.7), -hr * 0.1, hl + sl * zz - hl * 0.2], [side * sr * (1.2 - zz * 0.7), -hr * 0.42, hl + sl * zz - hl * 0.2]], sr * 0.18, '#ffffff', 0, '#ffffff', 4));
  }
  addMesh(head, merge(hp));
  const jaw = node('jaw', head, [0, -hr * 0.28, hl * 0.15]);
  const jl = hl * 0.75 + sl * 0.65;
  const jp: THREE.BufferGeometry[] = [loft([
    { p: [0, 0, 0], r: [hr * 0.85, hr * 0.42] },
    { p: [0, -hr * 0.05, jl * 0.6], r: [sr * 1.05, hr * 0.28] },
    { p: [0, 0, jl], r: [sr * 0.45, hr * 0.12] },
  ], { top: '#7a2b2b', bottom, radial: 10 })];
  for (const zz of [0.35, 0.55, 0.75, 0.92]) for (const side of [-1, 1]) {
    jp.push(spike([[side * sr * (1.1 - zz * 0.6), hr * 0.05, jl * zz], [side * sr * (1.1 - zz * 0.6), hr * 0.36, jl * zz]], sr * 0.16, '#ffffff', 0, '#ffffff', 4));
  }
  addMesh(jaw, merge(jp));
}

// ── Templates and instances ───────────────────────────────

const templates = new Map<string, THREE.Group>();

function getTemplate(speciesId: string, evo: number): THREE.Group {
  const key = `${speciesId}:${evo}`;
  let t = templates.get(key);
  if (t) return t;
  const l = LOOKS[speciesId];
  t = new THREE.Group();
  // Fixed-size body plans are drawn at one size and scaled to fit their species here.
  const inner = node('scaler', t);
  if (l.modelScale) inner.scale.setScalar(l.modelScale);
  switch (l.plan) {
    case 'quad': buildQuad(inner, l, evo); break;
    case 'rex': buildRex(inner, l, evo); break;
    case 'snake': buildSnake(inner, l, evo); break;
    case 'scorpion': buildScorpion(inner, l, evo); break;
    case 'bird': buildBird(inner, l, evo); break;
    case 'insect': buildInsect(inner, l, evo); break;
    case 'fish': buildFish(inner, l, evo); break;
    case 'centipede': buildCentipede(inner, l, evo); break;
  }
  templates.set(key, t);
  return t;
}

interface LegRig { hip: THREE.Object3D; knee: THREE.Object3D | null; phase: number; gallop: number; front: boolean; side: number; rest: number; }

export interface PoseInput {
  vx: number; vz: number; mx: number; mz: number; y: number; vy: number;
  action: string; actionT: number; actionDur: number;
  stun: number; frozen: number; dead: boolean; deathT: number; deathSpin: number;
  speed: number; flying: boolean; poison: number; burn: number; rage: number; buff: number; slow: number;
  sp: { ability: string };
  combo?: number; stagger?: number; spinT?: number; heading?: number; x?: number; z?: number;
  cloakT?: number; phaseT?: number; shieldT?: number; goldT?: number;
  target?: { x: number; z: number; dead: boolean } | null;
}

export class BeastRig {
  readonly root: THREE.Group;
  readonly pivot: THREE.Object3D;
  readonly body: THREE.Object3D;
  readonly head: THREE.Object3D | null;
  readonly jaw: THREE.Object3D | null;
  readonly look: Look;
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: BeastUniforms;
  private necks: THREE.Object3D[] = [];
  private tails: THREE.Object3D[] = [];
  private trunks: THREE.Object3D[] = [];
  private legs: LegRig[] = [];
  private wingL: THREE.Object3D | null = null;
  private wingR: THREE.Object3D | null = null;
  private tipL: THREE.Object3D | null = null;
  private tipR: THREE.Object3D | null = null;
  private earL: THREE.Object3D | null = null;
  private earR: THREE.Object3D | null = null;
  private hood: THREE.Object3D | null = null;
  private clawL: THREE.Object3D | null = null;
  private clawR: THREE.Object3D | null = null;
  private pinchL: THREE.Object3D | null = null;
  private pinchR: THREE.Object3D | null = null;
  private armL: THREE.Object3D | null = null;
  private armR: THREE.Object3D | null = null;
  private sq = 0;
  private sqVel = 0;
  private recoilZ = 0;
  private recoilZVel = 0;
  private lean = 0;
  private lastHeading = 0;
  private headYaw = 0;
  private simDt = 0;
  /** Tails run on their own phase, so changing speed changes their rhythm without a sudden jump. */
  private tailPhase = Math.random() * 10;
  private tailBaseNode: THREE.Object3D | null = null;

  private phase = Math.random() * 10;
  private time = Math.random() * 100;
  private recoilVel = 0;
  private recoil = 0;
  private airX = 0;
  private airZ = 0;
  private airVx = 0;
  private airVz = 0;
  private deadPose = 0;
  private flash = 0;
  private flap = Math.random() * 6;
  readonly limp = Math.random() * 2 - 1;
  /** Local head height for floating UI and effects, in unscaled units. */
  readonly height: number;

  constructor(readonly speciesId: string, evo: number, teamColor: string) {
    this.look = LOOKS[speciesId];
    const glowFromEvo = EVOLUTIONS[evo]?.color ?? '#ffffff';
    const { material, uniforms } = makeBeastMaterial({
      team: teamColor,
      pattern: this.look.pattern,
      patternCol: this.look.patternCol,
      glowCol: evo >= 2 && !this.look.glowCol ? glowFromEvo : (this.look.glowCol ?? glowFromEvo),
      bodyGlow: this.look.bodyGlow,
      patternAll: this.look.stripesAll,
      rainbow: this.look.rainbow,
      size: this.look.L / 1.8,
      mark: evo >= 2 ? (evo === 3 ? 0.8 : 0.45) : 0,
    });
    this.material = material;
    this.uniforms = uniforms;
    this.root = getTemplate(speciesId, evo).clone(true);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
    });

    const find = (n: string) => this.root.getObjectByName(n) ?? null;
    this.pivot = find('pivot')!;
    this.body = find('body')!;
    this.head = find('head');
    this.jaw = find('jaw');
    for (let i = 0; i < 8; i++) { const n = find(`neck${i}`); if (n) this.necks.push(n); }
    for (let i = 0; i < 14; i++) { const n = find(`tail${i}`); if (n) this.tails.push(n); }
    for (let i = 0; i < 8; i++) { const n = find(`trunk${i}`); if (n) this.trunks.push(n); }
    this.wingL = find('wingL'); this.wingR = find('wingR'); this.tipL = find('wingTipL'); this.tipR = find('wingTipR');
    this.earL = find('earL'); this.earR = find('earR'); this.hood = find('hood');
    this.tailBaseNode = find('tailBase');
    this.armL = find('armL'); this.armR = find('armR');
    this.clawL = find('clawL'); this.clawR = find('clawR'); this.pinchL = find('pinchL'); this.pinchR = find('pinchR');
    const gait: Record<string, number> = {
      FL: 0, RR: 0.15, FR: Math.PI, RL: Math.PI + 0.15, ML: Math.PI, MR: 0, BL: 0, BR: Math.PI,
    };
    // Galloping pairs the front legs and the back legs, half a stride apart.
    const gallop: Record<string, number> = { FL: 0, FR: 0.7, RL: Math.PI, RR: Math.PI + 0.7, ML: 0, MR: Math.PI, BL: 0, BR: Math.PI };
    for (const name of ['FL', 'FR', 'ML', 'MR', 'BL', 'BR', 'RL', 'RR']) {
      const hip = find(`hip${name}`);
      if (!hip) continue;
      this.legs.push({
        hip, knee: find(`knee${name}`), phase: gait[name], gallop: gallop[name], front: name[0] === 'F', side: name[1] === 'L' ? -1 : 1, rest: 0,
      });
    }
    const box = new THREE.Box3().setFromObject(this.root);
    this.height = Math.max(0.6, box.max.y) * VISUAL_SCALE;
    if (this.look.plan === 'snake') this.necks[0].rotation.x = 0.05;
  }

  setScale(s: number): void {
    this.root.scale.setScalar(s * VISUAL_SCALE);
  }

  /** World position of the mouth, for breath and spit effects. */
  mouthWorld(out: THREE.Vector3): THREE.Vector3 {
    if (!this.head) return this.root.getWorldPosition(out);
    out.set(0, 0, this.look.headLen + this.look.snoutLen);
    return this.head.localToWorld(out);
  }

  /** Flinches away from a blow. `localX` and `localZ` give the blow's direction in this beast's own frame. */
  hit(strength = 1, localX = 0, localZ = -1): void {
    this.flash = Math.min(0.7, this.flash + 0.42 * strength);
    this.recoilVel += -localZ * -11 * strength;
    this.recoilZVel += -localX * 11 * strength;
    this.sqVel -= 3.2 * strength;
  }

  /** Squash and stretch: positive stretches tall, negative squashes flat. */
  kick(amount: number): void {
    this.sqVel += amount;
  }

  update(u: PoseInput, dt: number, simDt: number): void {
    const frozen = u.frozen > 0;
    const t = simDt * (frozen ? 0 : 1);
    this.time += t;
    const un = this.uniforms;
    un.uTime.value = this.time;
    this.flash = Math.max(0, this.flash - dt * 6);
    un.uFlash.value = this.flash;

    const speed = Math.sqrt(u.mx * u.mx + u.mz * u.mz);
    const rel = Math.min(1.6, speed / Math.max(1, u.speed));
    const stride = Math.max(0.4, this.look.legRear * 0.9 + this.look.L * 0.18);
    this.phase += t * (1.3 + speed / stride) * (speed > 0.15 ? 1 : 0.0);

    const sd = Math.min(simDt, 1 / 30);
    this.recoilVel += (-this.recoil * 90 - this.recoilVel * 11) * sd;
    this.recoil += this.recoilVel * sd;
    this.recoilZVel += (-this.recoilZ * 90 - this.recoilZVel * 11) * sd;
    this.recoilZ += this.recoilZVel * sd;
    this.sqVel += (-this.sq * 170 - this.sqVel * 13) * sd;
    this.sq += this.sqVel * sd;

    // Lean into turns like a running animal, and keep eyes on the opponent.
    if (u.heading !== undefined && simDt > 0) {
      const dh = angleDelta(this.lastHeading, u.heading);
      this.lastHeading = u.heading;
      const wanted = THREE.MathUtils.clamp((dh / simDt) * 0.09, -0.32, 0.32) * Math.min(1, rel * 1.5);
      this.lean += (wanted - this.lean) * Math.min(1, simDt * 8);
      let look = 0;
      if (u.target && !u.target.dead && u.x !== undefined && u.z !== undefined) {
        look = THREE.MathUtils.clamp(angleDelta(u.heading, Math.atan2(u.target.x - u.x, u.target.z - u.z)), -0.9, 0.9);
      }
      this.headYaw += (look - this.headYaw) * Math.min(1, simDt * 7);
    }

    // Not every pose sets roll, and the lean below adds to it, so it starts clean each frame.
    this.pivot.rotation.z = 0;
    this.simDt = t;
    switch (this.look.plan) {
      case 'quad': case 'rex': this.poseLegged(u, rel, t); break;
      case 'bird': this.poseBird(u, rel, t); break;
      // A knocked-out beast lies still: these bodies hold whatever pose they fell in.
      case 'snake': if (!u.dead) this.poseSnake(u, t); break;
      case 'scorpion': if (!u.dead) this.poseScorpion(u, rel, t); break;
      case 'insect': if (!u.dead) this.poseInsect(u, rel); break;
      case 'fish': if (!u.dead) this.poseFish(u); break;
      case 'centipede': if (!u.dead) this.poseCentipede(u); break;
    }

    // Layered on every body plan: squash and stretch, tail-whip spin, flinch and lean.
    const stretch = this.sq;
    this.pivot.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5 + (u.action === 'attack' ? this.attackCurve(u).strike * 0.12 : 0));
    if (u.spinT && u.spinT > 0) this.pivot.rotation.y = (1 - u.spinT / 0.55) * Math.PI * 2;
    else this.pivot.rotation.y = 0;
    this.pivot.rotation.z += this.lean + this.recoilZ * 0.16;

    this.applyAirTumble(u, simDt);
    this.applyDeath(u, simDt);

    // Status tint, picked by what most matters visually.
    let amt = 0;
    if ((u.goldT ?? 0) > 0) { un.uTint.value.set('#ffc53d'); amt = 1; }
    else if (u.frozen > 0) { un.uTint.value.set('#a8e8ff'); amt = 0.85; }
    else if (u.burn > 0) { un.uTint.value.set('#ff6a20'); amt = 0.4 + 0.15 * Math.sin(this.time * 18); }
    else if (u.poison > 0) { un.uTint.value.set('#5dff5a'); amt = 0.3 + 0.1 * Math.sin(this.time * 6); }
    else if (u.rage > 0) { un.uTint.value.set('#ff2a2a'); amt = 0.38; }
    else if (u.slow > 0) { un.uTint.value.set('#9ad8ff'); amt = 0.2; }
    else if ((u.shieldT ?? 0) > 0) { un.uTint.value.set('#70ffd0'); amt = 0.28 + 0.1 * Math.sin(this.time * 5); }
    un.uTintAmt.value = u.dead ? 0 : amt;
  }

  private attackCurve(u: PoseInput): { windup: number; strike: number; p: number } {
    if (u.action !== 'attack' || u.actionDur <= 0) return { windup: 0, strike: 0, p: -1 };
    const p = Math.min(1, u.actionT / u.actionDur);
    const windup = p < 0.42 ? (p / 0.42) ** 1.5 : Math.max(0, 1 - (p - 0.42) / 0.08);
    const strike = p < 0.42 ? 0 : p < 0.52 ? (p - 0.42) / 0.1 : Math.max(0, 1 - (p - 0.52) / 0.48);
    return { windup, strike, p };
  }

  private poseLegged(u: PoseInput, rel: number, _t: number): void {
    const l = this.look;
    const size = Math.max(0.5, l.H + l.L * 0.25);
    const run = THREE.MathUtils.smoothstep(rel, 0.1, 0.9);
    const gal = l.plan === 'quad' && !u.flying ? THREE.MathUtils.smoothstep(rel, 0.6, 1.05) : 0;
    const bob = Math.abs(Math.sin(this.phase)) * (0.06 + 0.07 * gal) * size * run;
    const idle = Math.sin(this.time * 1.9) * 0.018 * size;
    const { windup, strike } = this.attackCurve(u);
    const combo = u.combo ?? 0;
    const finisher = combo === 2;
    const swipeSide = combo === 0 ? 1 : -1;

    let pitch = -0.02 * run + Math.sin(this.phase) * 0.13 * gal + Math.min(0.3, run * 0.08);
    let bodyY = bob + idle;
    let bodyZ = 0;
    let headPitch = 0;
    let neckPitch = 0;
    let jawOpen = 0.04 + Math.max(0, Math.sin(this.time * 0.8)) * 0.03;
    let rearUp = 0;
    let shake = 0;
    const flying = u.flying;
    const ability = u.sp.ability;
    const windupP = u.action === 'ability' ? Math.min(1, u.actionT / Math.max(0.01, u.actionDur)) : 0;

    // Basic attacks.
    let headShake = 0;
    if (l.attack === 'bite' || l.attack === 'spit') {
      // Rear the head back, then snap forward. The finisher clamps on and shakes.
      bodyZ += strike * 0.42 * size - windup * 0.28 * size;
      pitch += windup * -0.2 + strike * 0.22;
      headPitch += windup * -0.85 + strike * 0.75;
      neckPitch += windup * -0.3 + strike * 0.4;
      jawOpen += windup * 1.1 * (1 - strike) + strike * 0.1;
      if (finisher) headShake = Math.sin(this.time * 46) * 0.42 * strike;
    } else if (l.attack === 'swipe') {
      // Left, right, then rear up for a two-pawed smash.
      bodyZ += strike * 0.44 * size - windup * 0.2 * size;
      if (finisher) {
        rearUp = Math.max(rearUp, windup * 0.5);
        pitch += strike * 0.26;
      } else {
        pitch += windup * -0.3 + strike * 0.2;
      }
      jawOpen += windup * 0.9;
      headPitch += windup * -0.3 + strike * 0.35;
    } else if (l.attack === 'gore') {
      // Head down, then hook upward. The finisher tosses.
      bodyZ += strike * 0.55 * size - windup * 0.3 * size;
      const toss = finisher ? 1.5 : 1;
      headPitch += windup * 0.7 - strike * 0.95 * toss;
      neckPitch += windup * 0.3 - strike * 0.45 * toss;
      pitch += windup * 0.12 - strike * 0.14 * toss;
    } else {
      rearUp = Math.max(rearUp, windup * (finisher ? 0.65 : 0.38));
      bodyZ += strike * 0.32 * size;
      jawOpen += windup * 0.7;
    }
    // Reeling from a heavy blow.
    if ((u.stagger ?? 0) > 0) {
      headPitch -= 0.35;
      neckPitch -= 0.15;
      jawOpen += 0.5;
    }

    // Ability wind-ups each get a readable tell.
    if (u.action === 'ability') {
      switch (ability) {
        case 'quake': case 'frostQuake': case 'slam':
          rearUp = Math.max(rearUp, Math.sin(Math.min(1, windupP * 1.15) * Math.PI * 0.5) * (ability === 'slam' ? 0.75 : 0.62));
          jawOpen += 0.7;
          break;
        case 'roar': case 'howl':
          headPitch -= 0.7 * Math.min(1, windupP * 2);
          neckPitch -= 0.25 * Math.min(1, windupP * 2);
          jawOpen += 1 * Math.min(1, windupP * 2);
          shake = 0.01 * Math.min(1, windupP * 2);
          break;
        case 'charge':
          headPitch += 0.35;
          pitch += 0.1;
          bodyZ -= 0.25 * size * windupP;
          break;
        case 'pounce':
          bodyY -= 0.2 * size * windupP;
          pitch += -0.12;
          break;
        case 'rage':
          jawOpen += 0.9;
          headPitch -= 0.4;
          shake = 0.015;
          break;
        case 'heal':
          headPitch -= 0.45;
          break;
        case 'fireBreath': case 'frostBreath':
          headPitch -= 0.5 * windupP;
          jawOpen += 0.6 * windupP;
          break;
        case 'deathRoll':
          bodyZ += 0.3 * size;
          jawOpen += 0.9;
          break;
      }
    }
    if (u.action === 'charge') { headPitch += 0.45; pitch += 0.1; neckPitch += 0.2; }
    if (u.action === 'leap') { pitch += -0.22; jawOpen += 0.8; }
    if (u.action === 'breath') { headPitch += 0.08; jawOpen += 0.9; shake = 0.006; }

    // Pitch accumulates from rearing and hit recoil.
    pitch += -rearUp + this.recoil * 0.14;
    bodyY += rearUp * l.L * 0.32;

    this.pivot.position.set(
      shake ? Math.sin(this.time * 90) * shake * size : 0,
      bodyY,
      bodyZ,
    );
    this.pivot.rotation.set(pitch, 0, 0);

    // Legs.
    const amp = (0.28 + 0.62 * run + 0.25 * gal) * (flying ? 0.12 : 1);
    const stunSag = u.stun > 0 ? 0.08 : 0;
    this.legs.forEach((leg) => {
      const ph = this.phase + leg.phase * (1 - gal) + leg.gallop * gal;
      let hipX = Math.sin(ph) * amp * (rel > 0.05 ? 1 : 0);
      let kneeX = Math.max(0, Math.cos(ph)) * (0.4 + 0.75 * run) * (rel > 0.05 ? 1 : 0);
      if (flying) {
        // Tucked under the body while airborne.
        hipX = (leg.front ? 0.8 : 1) * 0.9 + Math.sin(this.time * 1.5 + leg.phase) * 0.06;
        kneeX = 0.9;
      }
      if (rearUp > 0.01 && leg.front) { hipX -= rearUp * 1.4; kneeX += rearUp * 0.9; }
      if (rearUp > 0.01 && !leg.front) { hipX += rearUp * 0.9; }
      // Strike-swipe with one forepaw.
      if (leg.front && l.attack === 'swipe' && (finisher || leg.side === swipeSide)) {
        hipX += windup * -1.5 + strike * 0.7;
        kneeX += windup * 0.65;
      }
      if (u.action === 'leap' && !flying) {
        hipX = leg.front ? -1.0 : 0.9;
        kneeX = 0.25;
      }
      if (u.action === 'charge') hipX *= 1.3;
      leg.hip.rotation.x = hipX + stunSag;
      if (leg.knee) leg.knee.rotation.x = kneeX;
    });

    // Neck and head follow with a little lag and idle life.
    const idleLook = Math.sin(this.time * 0.7) * 0.1;
    const neckN = this.necks.length;
    const stunWobble = u.stun > 0 ? Math.sin(this.time * 8) * 0.22 : 0;
    this.necks.forEach((n, i) => {
      n.rotation.x = neckPitch / Math.max(1, neckN) - bob * 0.7 * (i === 0 ? 1 : 0) + (flying ? Math.sin(this.time * 1.8 + i) * 0.05 : 0);
      n.rotation.y = (idleLook * 0.3 + this.headYaw * 0.55) / Math.max(1, neckN) + stunWobble * 0.5 + headShake * 0.4;
      n.rotation.z = stunWobble * 0.3;
    });
    if (this.head) {
      this.head.rotation.x = headPitch + Math.sin(this.time * 1.3) * 0.02 + pitch * -0.5;
      this.head.rotation.y = idleLook * 0.3 + this.headYaw * 0.45 + headShake;
    }
    // Arms on two-legged beasts windmill as they run and rake on the strike.
    if (this.armL && this.armR) {
      const swing = Math.sin(this.phase) * 0.35 * run;
      // Arms hang straight down, even on a body that's tipped upright.
      const rest = l.upright ?? 0;
      this.armL.rotation.x = rest + swing - windup * 1.25 + strike * 0.9;
      this.armR.rotation.x = rest - swing - windup * 1.25 + strike * 0.9;
    }
    if (this.jaw) this.jaw.rotation.x = Math.min(1.05, jawOpen) * (l.snoutLen < 0.2 ? 0.7 : 0.72);

    // Tail: travelling sine with more swing at speed.
    this.tailPhase += this.simDt * (2.2 + run * 5);
    const tailSwing = 0.09 + 0.14 * run;
    this.tails.forEach((seg, i) => {
      const lag = i * 0.55;
      seg.rotation.y = Math.sin(this.tailPhase - lag) * tailSwing;
      const droop = l.tailUp ? -0.35 : l.tail === 'long' ? 0.02 : l.tail === 'bushy' ? 0.17 : l.tail === 'tuft' ? 0.18 : 0.25;
      seg.rotation.x = -droop + Math.sin(this.time * 1.6 - lag) * 0.03 + (i === 0 && l.tail === 'bushy' ? -0.1 : 0);
    });
    this.trunks.forEach((seg, i) => {
      const curl = u.action === 'attack' ? windup * 0.55 : u.action === 'ability' ? 0.5 : 0;
      seg.rotation.x = -0.1 - (i / this.trunks.length) * 0.24 - curl * (0.4 + i * 0.18);
      seg.rotation.z = Math.sin(this.time * 1.8 - i * 0.6) * 0.07;
    });
    if (this.earL && this.earR) {
      const flapE = Math.sin(this.time * 2.1) * 0.13;
      this.earL.rotation.y = -0.2 + flapE;
      this.earR.rotation.y = 0.2 - flapE;
    }
    if (this.wingL && this.wingR) this.poseWings(u, flying, 1.0);

    if (flying) {
      this.pivot.position.y += Math.sin(this.time * 2.2) * 0.14;
      this.pivot.rotation.x += 0.05 + (u.action === 'breath' ? 0.14 : 0);
    }
  }

  private poseWings(u: PoseInput, flying: boolean, speedK: number): void {
    const rate = (u.action === 'breath' ? 4.5 : u.action === 'leap' ? 1 : 7.5) * speedK;
    this.flap += rate * this.simDt;
    const dead = u.dead;
    const flap = dead ? 0 : Math.sin(this.flap * 1.0);
    const follow = dead ? 0 : Math.sin(this.flap - 0.9);
    const base = flying ? (u.action === 'leap' ? 0.65 : 0.2) : 0.9;
    const amp = flying ? (u.action === 'leap' ? 0.05 : 0.62) : 0;
    this.wingL!.rotation.z = -(base + flap * amp);
    this.wingR!.rotation.z = base + flap * amp;
    this.tipL!.rotation.z = -(0.15 + Math.min(0, follow) * 0.75);
    this.tipR!.rotation.z = 0.15 + Math.min(0, follow) * 0.75;
    if (dead) {
      this.wingL!.rotation.z = 0.5;
      this.wingR!.rotation.z = -0.5;
    }
  }

  private poseBird(u: PoseInput, _rel: number, _t: number): void {
    const { windup, strike } = this.attackCurve(u);
    const bodyPitch = u.action === 'leap' ? 0.6 : 0.08 + windup * -0.3 + strike * 0.3;
    this.pivot.position.y = Math.sin(this.flap) * -0.14 * this.look.L * 0.5;
    this.pivot.rotation.x = bodyPitch + this.recoil * 0.2;
    this.pivot.rotation.z = Math.sin(this.time * 0.9) * 0.05;
    this.poseWings(u, !u.dead, 0.9);
    if (this.necks[0]) this.necks[0].rotation.x = Math.sin(this.time * 2.0) * 0.05 + strike * 0.3 - windup * 0.25;
    if (this.head) this.head.rotation.y = Math.sin(this.time * 0.8) * 0.2;
    this.legs.forEach((leg) => {
      const reach = u.action === 'leap' ? -0.9 : u.action === 'attack' ? -0.7 * strike : 0.85;
      leg.hip.rotation.x = reach;
      if (leg.knee) leg.knee.rotation.x = u.action === 'leap' ? 0.1 : 0.7;
    });
    const fan = this.tailBaseNode;
    if (fan) fan.rotation.x = Math.sin(this.time * 2.3) * 0.08 + 0.05;
  }

  private poseSnake(u: PoseInput, _t: number): void {
    const { windup, strike } = this.attackCurve(u);
    const ability = u.action === 'ability' ? Math.min(1, u.actionT / Math.max(0.01, u.actionDur)) : 0;
    const speed = Math.sqrt(u.mx * u.mx + u.mz * u.mz);
    const slither = Math.min(1, speed / 2);
    this.body.rotation.z = Math.sin(this.time * 6) * 0.035 * slither;
    this.body.rotation.y = Math.sin(this.time * 7) * 0.2 * slither;
    this.pivot.rotation.x = this.recoil * 0.2;
    let bend = 0;
    this.necks.forEach((n, i) => {
      const sway = Math.sin(this.time * 2.0 - i * 0.7) * 0.07;
      n.rotation.z = sway;
      n.rotation.x = (i === 0 ? 0.08 : 0.1) - windup * 0.18 + strike * 0.3 - ability * 0.15;
      bend += n.rotation.x;
    });
    if (this.hood) {
      const flare = 1 + 0.2 * Math.max(windup, ability);
      this.hood.scale.set(flare, flare, 1);
    }
    // However the neck bends, the head stays level and aimed at its prey.
    if (this.head) this.head.rotation.x = -bend + 0.15 - windup * 0.3 + strike * 0.2;
    if (this.jaw) this.jaw.rotation.x = 0.1 + Math.max(windup, ability) * 0.7 + strike * 0.5;
  }

  private poseScorpion(u: PoseInput, rel: number, _t: number): void {
    const { windup, strike } = this.attackCurve(u);
    const ability = u.action === 'ability' ? Math.min(1, u.actionT / Math.max(0.01, u.actionDur)) : 0;
    this.pivot.position.y = Math.sin(this.time * 2) * 0.01 + Math.abs(Math.sin(this.phase * 2)) * 0.03 * rel;
    this.pivot.rotation.x = this.recoil * 0.12;
    this.legs.forEach((leg, i) => {
      const ph = this.phase * 2 + leg.phase + i * 0.4;
      leg.hip.rotation.y = Math.sin(ph) * 0.35 * Math.min(1, rel * 2);
      leg.hip.rotation.z = Math.max(0, Math.cos(ph)) * 0.2 * Math.min(1, rel * 2) * -leg.side;
    });
    this.tails.forEach((seg, i) => {
      const base = i === 0 ? 0.6 : 0.42;
      // Draws back on the wind-up, then curls forward over the body to sting.
      const whip = (windup * -0.1 + strike * 0.28 + ability * -0.08) * (i > 1 ? 1 : 0.4);
      seg.rotation.x = base + whip + Math.sin(this.time * 2.2 - i * 0.5) * 0.03;
      seg.rotation.y = Math.sin(this.time * 1.2 - i * 0.4) * 0.02;
    });
    for (const [claw, pinch, side] of [[this.clawL, this.pinchL, -1], [this.clawR, this.pinchR, 1]] as const) {
      if (!claw || !pinch) continue;
      claw.rotation.y = Math.sin(this.time * 1.3 + side) * 0.06 + side * -0.12 * windup;
      claw.rotation.x = -0.1 * windup;
      pinch.rotation.y = side * (0.2 + 0.25 * Math.sin(this.time * 2.7 + side)) * (u.action === 'attack' ? 1.6 : 1);
    }
  }

  private poseInsect(u: PoseInput, rel: number): void {
    const { windup, strike } = this.attackCurve(u);
    const size = Math.max(0.4, this.look.L * 0.5);
    const flying = !!this.look.flyingBug;
    this.pivot.position.set(0, (flying ? Math.sin(this.time * 3) * 0.1 : Math.abs(Math.sin(this.phase * 2)) * 0.03 * rel), strike * 0.42 * size - windup * 0.26 * size);
    this.pivot.rotation.x = this.recoil * 0.2 + (flying ? 0.14 : 0) + windup * -0.34 + strike * 0.3;
    this.legs.forEach((leg, i) => {
      const ph = this.phase * 2.6 + (i % 2 === 0 ? 0 : Math.PI) + (i % 4 < 2 ? 0 : Math.PI);
      leg.hip.rotation.y = flying ? leg.side * 0.5 : Math.sin(ph) * 0.42 * Math.min(1, rel * 2);
      leg.hip.rotation.z = flying ? -leg.side * 0.4 : Math.max(0, Math.cos(ph)) * 0.26 * Math.min(1, rel * 2) * -leg.side;
    });
    if (this.jaw) this.jaw.scale.x = 1 + (windup * 0.8 - strike * 0.45 + Math.sin(this.time * 7) * 0.08);
    if (this.head) {
      this.head.rotation.y = this.headYaw * 0.5;
      this.head.rotation.x = Math.sin(this.time * 2) * 0.04 + strike * 0.3 - windup * 0.3;
    }
    for (const [claw, side] of [[this.clawL, -1], [this.clawR, 1]] as const) {
      if (!claw) continue;
      claw.rotation.x = windup * -0.7 + strike * 1.4 + Math.sin(this.time * 1.4 + side) * 0.05;
    }
    if (this.wingL && this.wingR) {
      const butter = this.look.wingKind === 'butterfly';
      const rate = butter ? 9 : 52;
      const flap = Math.sin(this.time * rate) * (butter ? 0.7 : 0.42);
      this.wingL.rotation.z = u.dead ? 0.5 : -(0.25 + flap);
      this.wingR.rotation.z = u.dead ? -0.5 : 0.25 + flap;
    }
  }

  private poseFish(u: PoseInput): void {
    const { windup, strike } = this.attackCurve(u);
    const speed = Math.sqrt(u.mx * u.mx + u.mz * u.mz);
    this.tailPhase += this.simDt * (3 + speed * 0.9);
    const beat = this.tailPhase;
    const L = this.look.L;
    this.pivot.position.set(0, Math.sin(this.time * 1.4) * 0.12, strike * 0.36 * L * 0.5 - windup * 0.2 * L * 0.5);
    this.pivot.rotation.x = this.recoil * 0.15 + windup * -0.22 + strike * 0.22;
    this.body.rotation.y = Math.sin(beat) * 0.07;
    this.tails.forEach((seg, i) => { seg.rotation.y = Math.sin(beat - 0.9 - i * 0.8) * (0.3 + i * 0.25); });
    if (this.head) this.head.rotation.y = this.headYaw * 0.3 - Math.sin(beat) * 0.07;
    if (this.jaw) this.jaw.rotation.x = 0.08 + windup * 0.95 * (1 - strike) + strike * 0.06;
    if (this.wingL && this.wingR) {
      const f = Math.sin(this.time * 2.4) * 0.14;
      this.wingL.rotation.z = -f;
      this.wingR.rotation.z = f;
    }
  }

  private poseCentipede(u: PoseInput): void {
    const { windup, strike } = this.attackCurve(u);
    const speed = Math.sqrt(u.mx * u.mx + u.mz * u.mz);
    this.tailPhase += this.simDt * (3 + speed * 2.1);
    const beat = this.tailPhase;
    this.pivot.position.z = strike * 0.45 - windup * 0.25;
    this.pivot.rotation.x = this.recoil * 0.1;
    this.tails.forEach((seg, i) => { seg.rotation.y = Math.sin(beat - i * 0.55) * 0.2; });
    if (this.head) {
      this.head.rotation.x = windup * -0.45 + strike * 0.35;
      this.head.rotation.y = this.headYaw * 0.5 + Math.sin(beat) * 0.12;
    }
    if (this.jaw) this.jaw.scale.x = 1 + windup * 0.7 - strike * 0.4;
  }

  private applyAirTumble(u: PoseInput, dt: number): void {
    if (u.flying || u.dead && u.y <= 0.01) return;
    const air = !u.flying && u.y > 0.25 && u.action !== 'leap';
    if (air) {
      this.airVx += (Math.abs(u.vy) * 0.4 + 2) * dt * (this.limp > 0 ? 1 : -1);
      this.airVz += 2.4 * dt * this.limp;
    } else {
      this.airVx = 0;
      this.airVz = 0;
      this.airX *= Math.exp(-dt * 12);
      this.airZ *= Math.exp(-dt * 12);
    }
    this.airX += this.airVx * dt;
    this.airZ += this.airVz * dt;
    this.pivot.rotation.x += this.airX;
    this.pivot.rotation.z += this.airZ;
  }

  private applyDeath(u: PoseInput, dt: number): void {
    if (!u.dead) {
      if (this.deadPose > 0) {
        this.deadPose = 0;
        this.pivot.rotation.z = 0;
      }
      // Cloaked and ghostly beasts shimmer through full of holes, with a cool glowing edge.
      const fading = (u.cloakT ?? 0) > 0 || (u.phaseT ?? 0) > 0;
      this.uniforms.uDissolve.value = fading ? 0.42 + Math.sin(this.time * 9) * 0.04 : 0;
      this.uniforms.uEdge.value.set(fading ? '#60d8ff' : '#ff7320');
      return;
    }
    this.uniforms.uEdge.value.set('#ff7320');
    this.deadPose = Math.min(1, this.deadPose + dt * 2.6);
    const k = this.deadPose * this.deadPose * (3 - 2 * this.deadPose);
    const side = u.deathSpin >= 0 ? 1 : -1;
    this.pivot.rotation.z = (this.airZ + side * (Math.PI / 2) * k);
    this.pivot.rotation.x = this.airX * (1 - k);
    const l = this.look;
    // Rolling onto its side brings the spine down to ground level, so lift by the body's thickness to rest on top.
    const modelK = l.modelScale ?? 1;
    const thickness = l.plan === 'snake' ? 0.45 : Math.max(l.chest, l.rump, l.waist);
    this.pivot.position.y = thickness * modelK * 0.9 * k;
    this.headYaw = 0;
    if (this.head) this.head.rotation.y = 0;
    if (l.plan === 'quad' || l.plan === 'rex') {
      this.legs.forEach((leg, i) => {
        leg.hip.rotation.x = (this.limp * 0.6 + (i % 2 === 0 ? 0.3 : -0.4)) * k;
        if (leg.knee) leg.knee.rotation.x = 0.5 * k;
      });
      this.necks.forEach((n) => { n.rotation.x = 0.28 * k; n.rotation.y = 0; n.rotation.z = 0; });
      if (this.head) this.head.rotation.x = 0.55 * k;
      if (this.jaw) this.jaw.rotation.x = 0.5 * k;
      this.tails.forEach((s) => { s.rotation.y *= 0.9; s.rotation.x = -0.02; });
    }
    this.uniforms.uDissolve.value = u.deathT > 1.1 ? Math.min(1, (u.deathT - 1.1) / 1.3) : 0;
  }

  dispose(): void {
    this.material.dispose();
  }
}

/** Static pose used for portraits and pedestals. */
export const IDLE_POSE: PoseInput = {
  vx: 0, vz: 0, mx: 0, mz: 0, y: 0, vy: 0, action: 'ready', actionT: 0, actionDur: 0,
  stun: 0, frozen: 0, dead: false, deathT: 0, deathSpin: 1, speed: 5, flying: false,
  poison: 0, burn: 0, rage: 0, buff: 0, slow: 0, sp: { ability: 'none' },
};
