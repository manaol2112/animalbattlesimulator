// Procedural geometry kit: lofted organic shapes with vertex colour and glow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export type Hex = string | number;

export interface Sec {
  p: V3;
  r: number | [number, number];
  top?: Hex;
  bottom?: Hex;
  glow?: number;
}

export interface LoftOpts {
  top?: Hex; bottom?: Hex; glow?: number; radial?: number; subdiv?: number;
}

const color = (h: Hex) => new THREE.Color(h);

function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
}

interface Ring { p: THREE.Vector3; rx: number; ry: number; top: THREE.Color; bottom: THREE.Color; glow: number; }

function expand(secs: Sec[], o: LoftOpts): Ring[] {
  const subdiv = o.subdiv ?? 3;
  const rings: Ring[] = [];
  const rx = (s: Sec) => (Array.isArray(s.r) ? s.r[0] : s.r);
  const ry = (s: Sec) => (Array.isArray(s.r) ? s.r[1] : s.r);
  const baseTop = o.top ?? '#888888';
  const baseBottom = o.bottom ?? baseTop;
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[Math.max(0, i - 1)];
    const b = secs[i];
    const c = secs[i + 1];
    const d = secs[Math.min(secs.length - 1, i + 2)];
    const steps = i === secs.length - 2 ? subdiv + 1 : subdiv;
    for (let s = 0; s < steps; s++) {
      const t = s / subdiv;
      rings.push({
        p: new THREE.Vector3(
          catmull(a.p[0], b.p[0], c.p[0], d.p[0], t),
          catmull(a.p[1], b.p[1], c.p[1], d.p[1], t),
          catmull(a.p[2], b.p[2], c.p[2], d.p[2], t),
        ),
        rx: Math.max(0.0005, catmull(rx(a), rx(b), rx(c), rx(d), t)),
        ry: Math.max(0.0005, catmull(ry(a), ry(b), ry(c), ry(d), t)),
        top: color(b.top ?? baseTop).lerp(color(c.top ?? baseTop), t),
        bottom: color(b.bottom ?? baseBottom).lerp(color(c.bottom ?? baseBottom), t),
        glow: (b.glow ?? o.glow ?? 0) * (1 - t) + (c.glow ?? o.glow ?? 0) * t,
      });
    }
  }
  return rings;
}

/** Sweeps ellipses along a spine into a closed, smooth-shaded tube. */
export function loft(secs: Sec[], o: LoftOpts = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 10;
  const rings = expand(secs, o);
  const n = rings.length;
  const pos: number[] = [];
  const col: number[] = [];
  const glow: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const R = new THREE.Vector3();
  const U = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const prev = rings[Math.max(0, i - 1)].p;
    const next = rings[Math.min(n - 1, i + 1)].p;
    T.subVectors(next, prev).normalize();
    if (i === 0) {
      ref.set(0, 1, 0);
      if (Math.abs(T.y) > 0.92) ref.set(0, 0, 1);
      R.crossVectors(T, ref).normalize();
    } else {
      // Carry the previous ring's frame forward, so a bending neck or leg can't suddenly twist.
      R.addScaledVector(T, -R.dot(T));
      if (R.lengthSq() < 1e-8) {
        ref.set(0, 1, 0);
        if (Math.abs(T.y) > 0.92) ref.set(0, 0, 1);
        R.crossVectors(T, ref);
      }
      R.normalize();
    }
    U.crossVectors(R, T).normalize();
    const ring = rings[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      pos.push(
        ring.p.x + R.x * cos * ring.rx + U.x * sin * ring.ry,
        ring.p.y + R.y * cos * ring.rx + U.y * sin * ring.ry,
        ring.p.z + R.z * cos * ring.rx + U.z * sin * ring.ry,
      );
      const k = THREE.MathUtils.smoothstep(sin, -0.55, 0.35);
      c.copy(ring.bottom).lerp(ring.top, k);
      col.push(c.r, c.g, c.b);
      glow.push(ring.glow);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const c2 = (i + 1) * radial + ((j + 1) % radial);
      const d = i * radial + ((j + 1) % radial);
      idx.push(a, b, c2, a, c2, d);
    }
  }
  // Caps.
  const addCap = (ringIdx: number, flip: boolean) => {
    const ring = rings[ringIdx];
    const center = pos.length / 3;
    pos.push(ring.p.x, ring.p.y, ring.p.z);
    c.copy(ring.bottom).lerp(ring.top, 0.5);
    col.push(c.r, c.g, c.b);
    glow.push(ring.glow);
    for (let j = 0; j < radial; j++) {
      const a = ringIdx * radial + j;
      const b = ringIdx * radial + ((j + 1) % radial);
      if (flip) idx.push(center, a, b);
      else idx.push(center, b, a);
    }
  };
  addCap(0, true);
  addCap(n - 1, false);

  return finish(pos, col, glow, idx);
}

function finish(pos: number[], col: number[], glow: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** An ellipsoid, lit top-to-bottom with vertex colour. */
export function blob(c: V3, r: V3, top: Hex, bottom: Hex = top, glowAmt = 0, seg = 10): THREE.BufferGeometry {
  const s = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2));
  s.scale(r[0], r[1], r[2]);
  s.translate(c[0], c[1], c[2]);
  const count = s.attributes.position.count;
  const col = new Float32Array(count * 3);
  const glow = new Float32Array(count).fill(glowAmt);
  const t = color(top);
  const b = color(bottom);
  const m = new THREE.Color();
  const nrm = s.attributes.normal;
  for (let i = 0; i < count; i++) {
    m.copy(b).lerp(t, THREE.MathUtils.smoothstep(nrm.getY(i), -0.6, 0.3));
    col[i * 3] = m.r;
    col[i * 3 + 1] = m.g;
    col[i * 3 + 2] = m.b;
  }
  s.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  s.deleteAttribute('uv');
  return s;
}

/** A tapered curved spike through a list of points. Horns, claws, tusks, spines. */
export function spike(pts: V3[], r0: number, hex: Hex, glowAmt = 0, tipHex: Hex = hex, radial = 7): THREE.BufferGeometry {
  const n = pts.length;
  const secs: Sec[] = pts.map((p, i) => {
    const k = i / (n - 1);
    return {
      p,
      r: Math.max(0.002, r0 * (1 - k * k * 0.98)),
      top: new THREE.Color(hex).lerp(new THREE.Color(tipHex), k).getHex(THREE.SRGBColorSpace),
      glow: glowAmt,
    };
  });
  secs.forEach((s) => { s.bottom = s.top; });
  return loft(secs, { radial, subdiv: n > 2 ? 3 : 1 });
}

export function merge(parts: (THREE.BufferGeometry | null | undefined)[]): THREE.BufferGeometry {
  const list = parts.filter(Boolean) as THREE.BufferGeometry[];
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('merge failed');
  return g;
}
