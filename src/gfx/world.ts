// Biome environments: terrain, sky, lighting, foliage, liquid and ambient atmosphere.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BiomeId } from '../sim/stages';
import { ARENA_RADIUS } from '../sim/battle';

export type Quality = 'high' | 'medium' | 'low';

interface BiomeDef {
  skyTop: string; skyHorizon: string; sunColor: string; sunIntensity: number; sunDir: [number, number, number];
  hemiSky: string; hemiGround: string; hemiIntensity: number; fog: string; fogDensity: number;
  ground1: string; ground2: string; ground3: string; rock: string; high: string;
  grass?: [string, string]; grassDensity: number;
  liquid?: { color: string; glow: string; emissive: number; level: number };
  clouds: number; stars: number; aurora: number; moon?: boolean;
  ambient: 'dust' | 'fireflies' | 'snow' | 'ash' | 'motes';
  props: ('acacia' | 'palm' | 'canopy' | 'pine' | 'dead' | 'rock' | 'crystal' | 'pillar' | 'lavarock' | 'icespike' | 'cycad' | 'conifer')[];
  /** Low plants scattered right up to the arena's edge. */
  flora?: ('fern' | 'flower' | 'bush')[];
  shafts?: string; exposure: number; bloom: number; grade: { lift: [number, number, number]; sat: number };
  groundGlow?: string;
}

const BIOMES: Record<BiomeId, BiomeDef> = {
  savanna: {
    skyTop: '#3a78c2', skyHorizon: '#ffd9ae', sunColor: '#fff0d2', sunIntensity: 4.0, sunDir: [-0.55, 0.55, -0.42],
    hemiSky: '#cfe2ff', hemiGround: '#8a7a5a', hemiIntensity: 1.2, fog: '#e3c8a4', fogDensity: 0.0031,
    ground1: '#a18a58', ground2: '#7d7144', ground3: '#bda67a', rock: '#8a7458', high: '#79705a',
    grass: ['#9a9a42', '#e4cf78'], grassDensity: 1, clouds: 0.5, stars: 0, aurora: 0, ambient: 'dust',
    props: ['acacia', 'acacia', 'rock', 'dead'], flora: ['bush', 'flower'], exposure: 0.82, bloom: 0.3,
    grade: { lift: [1.0, 1.0, 0.98], sat: 1.12 },
  },
  jungle: {
    skyTop: '#2f6c6a', skyHorizon: '#c7e8a6', sunColor: '#fff0c0', sunIntensity: 3.0, sunDir: [0.35, 0.7, -0.4],
    hemiSky: '#c7f0c2', hemiGround: '#20391e', hemiIntensity: 1.25, fog: '#7fae7c', fogDensity: 0.0085,
    ground1: '#42602c', ground2: '#2f4722', ground3: '#5d7a35', rock: '#4e5a48', high: '#2b4628',
    grass: ['#2f7a2f', '#88d65a'], grassDensity: 1, clouds: 0.25, stars: 0, aurora: 0, ambient: 'fireflies',
    liquid: { color: '#1d5a58', glow: '#39c4b0', emissive: 0.1, level: -0.9 },
    props: ['canopy', 'canopy', 'palm', 'rock'], flora: ['fern', 'fern', 'flower', 'bush'], shafts: '#fff6b8', exposure: 0.95, bloom: 0.4,
    grade: { lift: [0.98, 1.03, 0.98], sat: 1.15 },
  },
  tundra: {
    skyTop: '#0b1a3a', skyHorizon: '#5b86a8', sunColor: '#fff4e4', sunIntensity: 3.0, sunDir: [0.5, 0.5, 0.55],
    hemiSky: '#dbe8ff', hemiGround: '#8c9db8', hemiIntensity: 1.25, fog: '#7fa2c0', fogDensity: 0.0052,
    ground1: '#e2ebf2', ground2: '#bccfdf', ground3: '#f4f8fb', rock: '#6f8296', high: '#f4f9fd',
    grassDensity: 0, clouds: 0.1, stars: 0.8, aurora: 1, ambient: 'snow',
    liquid: { color: '#5fa8d6', glow: '#a4e6ff', emissive: 0.18, level: -0.6 },
    props: ['pine', 'pine', 'icespike', 'rock'], exposure: 0.8, bloom: 0.34,
    grade: { lift: [0.98, 1.0, 1.03], sat: 1.08 },
  },
  primeval: {
    skyTop: '#3d7fa0', skyHorizon: '#f0d8a0', sunColor: '#fff2d0', sunIntensity: 3.8, sunDir: [0.5, 0.58, -0.45],
    hemiSky: '#cfe8d8', hemiGround: '#5a5a30', hemiIntensity: 1.25, fog: '#b8c8a0', fogDensity: 0.0048,
    ground1: '#6a6a34', ground2: '#4e5428', ground3: '#8a7e48', rock: '#6a5a48', high: '#54503c',
    grass: ['#4a8a2a', '#b0d050'], grassDensity: 1, clouds: 0.55, stars: 0, aurora: 0, ambient: 'dust',
    liquid: { color: '#2a6a60', glow: '#50c0a0', emissive: 0.1, level: -0.8 },
    props: ['cycad', 'cycad', 'conifer', 'conifer', 'rock'], flora: ['fern', 'fern', 'flower'], shafts: '#fff0c0', exposure: 0.86, bloom: 0.32,
    grade: { lift: [1.0, 1.01, 0.97], sat: 1.14 },
  },
  caldera: {
    skyTop: '#1a0c10', skyHorizon: '#e0542a', sunColor: '#ffd8b8', sunIntensity: 3.2, sunDir: [-0.45, 0.55, 0.6],
    hemiSky: '#e8d2c4', hemiGround: '#6a3a28', hemiIntensity: 1.2, fog: '#7a2f1c', fogDensity: 0.0066,
    ground1: '#3a2c29', ground2: '#241b1b', ground3: '#584035', rock: '#2a2020', high: '#191212',
    grassDensity: 0, clouds: 0.75, stars: 0, aurora: 0, ambient: 'ash',
    liquid: { color: '#ff4a08', glow: '#ff9a20', emissive: 1.9, level: -0.55 }, groundGlow: '#ff4a10',
    props: ['lavarock', 'lavarock', 'dead'], exposure: 0.92, bloom: 0.32,
    grade: { lift: [1.03, 0.99, 0.96], sat: 1.08 },
  },
  starfall: {
    skyTop: '#07061c', skyHorizon: '#3a2a78', sunColor: '#ece6ff', sunIntensity: 2.8, sunDir: [0.4, 0.62, 0.5],
    hemiSky: '#cfc9f2', hemiGround: '#433b70', hemiIntensity: 1.25, fog: '#2c2360', fogDensity: 0.006,
    ground1: '#433a68', ground2: '#2c2650', ground3: '#5e4f86', rock: '#3a3360', high: '#241f44',
    grass: ['#35a0a8', '#a9f4e8'], grassDensity: 0.45, clouds: 0.3, stars: 1, aurora: 0.25, moon: true, ambient: 'motes',
    props: ['crystal', 'crystal', 'pillar', 'rock'], flora: ['flower'], shafts: '#b9a4ff', exposure: 0.95, bloom: 0.36,
    grade: { lift: [1.0, 0.99, 1.03], sat: 1.1 },
  },
};

// ── Noise used for terrain, mirrored from a tiny value noise ─────────
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm2(x: number, y: number, oct = 5): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

const FLAT_R = ARENA_RADIUS + 4;

export function terrainHeight(x: number, z: number, def: BiomeDef): number {
  const r = Math.sqrt(x * x + z * z);
  const small = (fbm2(x * 0.09 + 7, z * 0.09 + 3, 3) - 0.5) * 0.35;
  if (r < FLAT_R) return small * THREE.MathUtils.smoothstep(r, FLAT_R - 16, FLAT_R) * 1.2;
  const k = THREE.MathUtils.smoothstep(r, FLAT_R, FLAT_R + 95);
  const hills = fbm2(x * 0.018 + 11, z * 0.018 + 5, 5);
  const ridge = 1 - Math.abs(fbm2(x * 0.011 + 21, z * 0.011 + 9, 4) * 2 - 1);
  let h = small + k * k * (hills * 34 + ridge * ridge * 46) * (def.liquid?.emissive && def.liquid.emissive > 1 ? 1.05 : 1);
  // Moat for lava and water biomes: the arena reads as an island.
  if (def.liquid) {
    const m = THREE.MathUtils.smoothstep(r, FLAT_R, FLAT_R + 5) * (1 - THREE.MathUtils.smoothstep(r, FLAT_R + 15, FLAT_R + 26));
    const wob = fbm2(x * 0.05 + 40, z * 0.05 + 18, 3);
    h -= m * (1.7 + wob * 1.1);
  }
  return h;
}

// ── Sky ───────────────────────────────────────────────────
function makeSky(def: BiomeDef): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(def.skyTop) },
      uHorizon: { value: new THREE.Color(def.skyHorizon) },
      uSun: { value: new THREE.Vector3(...def.sunDir).normalize() },
      uSunCol: { value: new THREE.Color(def.sunColor) },
      uClouds: { value: def.clouds },
      uStars: { value: def.stars },
      uAurora: { value: def.aurora },
      uMoon: { value: def.moon ? 1 : 0 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uTop,uHorizon,uSun,uSunCol; uniform float uClouds,uStars,uAurora,uMoon,uTime;
      float h(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p=p*2.03+7.1; a*=.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uTop, pow(y, 0.55));
        float below = smoothstep(0.0,-0.08,d.y);
        col = mix(col, uHorizon*0.75, below);
        float sd = max(dot(d,uSun),0.0);
        col += uSunCol * (pow(sd,700.0)*(uMoon>0.5?0.0:7.0) + pow(sd,40.0)*0.35 + pow(sd,6.0)*0.18);
        if(uMoon>0.5){
          float m = smoothstep(0.9975,0.9985,sd);
          float crater = fbm(d.xz*42.0);
          col += vec3(0.86,0.84,1.0)*m*(1.3+crater*1.1);
          col += vec3(0.55,0.5,1.0)*pow(sd,160.0)*0.6;
        }
        if(uStars>0.0){
          vec2 sp = d.xz/(abs(d.y)+0.35)*180.0;
          float s = h(floor(sp));
          float tw = 0.65+0.35*sin(uTime*2.0+s*50.0);
          float star = step(0.992,s)*smoothstep(0.5,0.0,length(fract(sp)-0.5))*tw;
          col += vec3(0.9,0.95,1.0)*star*uStars*3.0*smoothstep(0.02,0.25,d.y);
          float neb = fbm(d.xz*2.6+3.0);
          col += vec3(0.25,0.16,0.5)*smoothstep(0.5,0.85,neb)*uStars*0.65*smoothstep(0.0,0.4,d.y);
        }
        if(uAurora>0.0){
          vec2 ap = vec2(d.x/(d.y+0.4), d.z/(d.y+0.4));
          float band = 0.0;
          for(int i=0;i<3;i++){
            float fi=float(i);
            float w = fbm(vec2(ap.x*1.1+uTime*0.05+fi*3.0, fi*5.0));
            float dist = abs(ap.y - (w*2.2-1.1) + fi*0.3);
            band += smoothstep(0.42,0.0,dist)*(0.6+0.4*sin(ap.x*14.0+uTime*0.7+fi));
          }
          vec3 ac = mix(vec3(0.15,1.0,0.6),vec3(0.55,0.25,1.0),smoothstep(0.1,0.7,d.y));
          col += ac*band*uAurora*0.85*smoothstep(0.03,0.28,d.y);
        }
        if(uClouds>0.0 && d.y>0.0){
          vec2 cp = d.xz/(d.y+0.18)*1.5 + uTime*0.012;
          float c = fbm(cp);
          float cover = smoothstep(1.0-uClouds*0.82,1.05,c+0.15);
          float lit = fbm(cp+uSun.xz*0.3);
          vec3 cc = mix(uHorizon*0.9, mix(vec3(1.0),uSunCol,0.45), lit);
          cc = mix(cc,uTop*0.55,smoothstep(0.55,0.15,lit));
          col = mix(col,cc,cover*smoothstep(0.0,0.14,d.y)*0.85);
        }
        gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 40, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, material };
}

// ── Prop geometry ─────────────────────────────────────────
function vcol(g: THREE.BufferGeometry, top: string, bottom: string, glow = 0, yMin?: number, yMax?: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  ng.deleteAttribute('uv');
  const p = ng.attributes.position;
  ng.computeBoundingBox();
  const a = yMin ?? ng.boundingBox!.min.y;
  const b = yMax ?? ng.boundingBox!.max.y;
  const col = new Float32Array(p.count * 3);
  const t = new THREE.Color(top);
  const bo = new THREE.Color(bottom);
  const m = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    m.copy(bo).lerp(t, THREE.MathUtils.clamp((p.getY(i) - a) / (b - a || 1), 0, 1));
    col[i * 3] = m.r; col[i * 3 + 1] = m.g; col[i * 3 + 2] = m.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(p.count).fill(glow), 1));
  return ng;
}

function jitter(g: THREE.BufferGeometry, amt: number, seed = 1): THREE.BufferGeometry {
  const p = g.attributes.position;
  // Offset by position so split vertices stay welded.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const n = (a: number, b: number, c: number) => Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + seed) * 43758.5453 % 1;
    p.setXYZ(i, x + n(x, y, z) * amt, y + n(y, z, x) * amt, z + n(z, x, y) * amt);
  }
  return g;
}

function propGeometry(kind: BiomeDef['props'][number] | 'fern' | 'flower' | 'bush', def: BiomeDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); parts.push(g);
  };
  switch (kind) {
    case 'acacia': {
      add(vcol(new THREE.CylinderGeometry(0.3, 0.5, 5, 7), '#6a4f33', '#4f3a26'), 0, 2.5, 0, 0, 0.08);
      for (const [x, z, a] of [[1.8, 0.4, -0.7], [-1.7, -0.5, 0.7], [0.3, 1.8, 0.1], [-0.2, -1.7, 0.15]] as const) {
        const b = vcol(new THREE.CylinderGeometry(0.1, 0.22, 3.2, 6), '#6a4f33', '#4f3a26');
        add(b, x * 0.5, 6, z * 0.5, z * 0.3, a);
      }
      for (const [x, y, z, r] of [[0, 7.7, 0, 4.3], [2.5, 7.4, 1, 2.6], [-2.6, 7.4, -0.8, 2.8], [0.8, 7.5, -2.6, 2.3], [-0.8, 7.4, 2.6, 2.3]] as const) {
        const c = new THREE.SphereGeometry(r, 9, 6);
        c.scale(1, 0.22, 1);
        add(vcol(jitter(c, 0.3), '#8d9a3c', '#4e5f22'), x, y, z);
      }
      break;
    }
    case 'palm': {
      add(vcol(new THREE.CylinderGeometry(0.22, 0.42, 11, 7), '#6b5a3a', '#463a26'), 0, 5.5, 0, 0, 0.05);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const leaf = new THREE.ConeGeometry(0.7, 5.4, 4);
        leaf.scale(1, 1, 0.14);
        leaf.translate(0, 2.7, 0);
        const m = new THREE.Matrix4().makeRotationZ(1.75).premultiply(new THREE.Matrix4().makeRotationY(a));
        leaf.applyMatrix4(m);
        add(vcol(leaf, '#3f8c3a', '#2a6a2c', 0), 0, 11, 0);
      }
      break;
    }
    case 'canopy': {
      add(vcol(new THREE.CylinderGeometry(0.7, 1.4, 18, 8), '#4f4230', '#2f2a20'), 0, 9, 0);
      for (const [x, y, z, r] of [[0, 19, 0, 7.5], [4.4, 17, 2.2, 5], [-4.6, 17.6, -1.6, 5.2], [1.5, 16.4, -4.6, 4.6], [-1.6, 16.6, 4.6, 4.5], [0, 23, 0, 4.8]] as const) {
        const c = new THREE.IcosahedronGeometry(r, 1);
        c.scale(1, 0.7, 1);
        add(vcol(jitter(c, 0.6), '#5da53f', '#1f4a24'), x, y, z);
      }
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.4;
        const root = new THREE.ConeGeometry(0.75, 3.4, 5);
        add(vcol(root, '#3e3424', '#3e3424'), Math.cos(a) * 1.2, 1.1, Math.sin(a) * 1.2, Math.sin(a) * 0.4, -Math.cos(a) * 0.4);
      }
      break;
    }
    case 'pine': {
      add(vcol(new THREE.CylinderGeometry(0.28, 0.5, 4, 7), '#54473d', '#3e3430'), 0, 2, 0);
      for (let i = 0; i < 5; i++) {
        const r = 4.1 - i * 0.74;
        const h = 4.0 - i * 0.38;
        const c = new THREE.ConeGeometry(r, h, 8);
        add(vcol(jitter(c, 0.1), '#f4fafe', '#23423e', 0), 0, 3.6 + i * 2.4, 0);
      }
      break;
    }
    case 'dead': {
      add(vcol(new THREE.CylinderGeometry(0.22, 0.55, 6, 6), '#2b2522', '#1b1716'), 0, 3, 0, 0, 0.1);
      for (const [y, a, l] of [[3.5, 1.0, 3], [4.5, -0.9, 2.4], [5.4, 0.6, 2], [2.6, -1.1, 2]] as const) {
        const b = new THREE.CylinderGeometry(0.04, 0.16, l, 5);
        b.translate(0, l / 2, 0);
        const m = new THREE.Matrix4().makeRotationZ(a).premultiply(new THREE.Matrix4().makeRotationY(y * 2.1));
        b.applyMatrix4(m);
        add(vcol(b, '#2b2522', '#1b1716'), 0, y, 0);
      }
      break;
    }
    case 'cycad': {
      add(vcol(new THREE.CylinderGeometry(0.55, 0.75, 4.5, 8), '#6a5a38', '#4a3e28'), 0, 2.25, 0);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const leaf = new THREE.ConeGeometry(0.75, 6.2, 4);
        leaf.scale(1, 1, 0.1);
        leaf.translate(0, 3.1, 0);
        leaf.applyMatrix4(new THREE.Matrix4().makeRotationZ(1.05 + (i % 2) * 0.45).premultiply(new THREE.Matrix4().makeRotationY(a)));
        add(vcol(leaf, '#5f9a3a', '#2a5a24'), 0, 4.4, 0);
      }
      break;
    }
    case 'conifer': {
      add(vcol(new THREE.CylinderGeometry(0.4, 0.85, 20, 8), '#5a4430', '#3a2c20'), 0, 10, 0);
      for (let i = 0; i < 6; i++) {
        const c = new THREE.ConeGeometry(5.2 - i * 0.72, 4.4, 8);
        add(vcol(jitter(c, 0.14), '#3f7a3e', '#1c3f24'), 0, 11 + i * 2.7, 0);
      }
      break;
    }
    case 'fern': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const f = new THREE.ConeGeometry(0.32, 2.2, 4);
        f.scale(1, 1, 0.1);
        f.translate(0, 1.1, 0);
        f.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.75 + (i % 3) * 0.2).premultiply(new THREE.Matrix4().makeRotationY(a)));
        add(vcol(f, '#7ac04a', '#2a6a2a'));
      }
      break;
    }
    case 'bush': {
      for (const [x, y, z, r] of [[0, 0.55, 0, 0.95], [0.72, 0.42, 0.2, 0.62], [-0.65, 0.42, -0.2, 0.7]] as const) {
        add(vcol(jitter(new THREE.IcosahedronGeometry(r, 1), 0.1), '#8a9a40', '#46582a'), x, y, z);
      }
      break;
    }
    case 'flower': {
      const palette = def.ambient === 'motes' ? ['#b0f0ff', '#d8b0ff', '#8ff0d0'] : ['#ff6a8a', '#ffd040', '#f4f0ff'];
      palette.forEach((col, i) => {
        const a = i * 2.2;
        const x = Math.cos(a) * 0.32;
        const z = Math.sin(a) * 0.32;
        add(vcol(new THREE.CylinderGeometry(0.018, 0.03, 0.62, 4), '#4a8a3a', '#3a6a2a'), x, 0.31, z);
        const petal = new THREE.IcosahedronGeometry(0.15, 0);
        petal.scale(1, 0.5, 1);
        add(vcol(petal, col, col, def.ambient === 'motes' ? 0.5 : 0.04), x, 0.64, z);
      });
      break;
    }
    case 'rock': {
      const c = new THREE.IcosahedronGeometry(2.1, 1);
      c.scale(1.2, 0.8, 1);
      add(vcol(jitter(c, 0.32), def.rock, '#252321'), 0, 0.8, 0);
      const c2 = new THREE.IcosahedronGeometry(1.1, 1);
      add(vcol(jitter(c2, 0.2, 5), def.rock, '#2a2826'), 1.9, 0.4, 0.7);
      break;
    }
    case 'lavarock': {
      const c = new THREE.DodecahedronGeometry(2.7, 1);
      c.scale(1, 1.25, 1);
      add(vcol(jitter(c, 0.45), '#2b2322', '#a03810', 0.1, 0, 1.1), 0, 1.5, 0);
      const c2 = new THREE.ConeGeometry(1.2, 5.5, 6);
      add(vcol(jitter(c2, 0.2), '#1f1919', '#a03810', 0.08, 0, 1.5), 2.2, 2.4, -0.3);
      break;
    }
    case 'icespike': {
      for (const [x, z, h, r, tilt] of [[0, 0, 8.5, 1.1, 0.1], [1.4, 0.6, 5, 0.75, -0.3], [-1.3, 0.4, 4.2, 0.65, 0.35], [0.1, -1.4, 3.6, 0.6, -0.2]] as const) {
        const c = new THREE.ConeGeometry(r, h, 5);
        add(vcol(c, '#e4faff', '#5bb0dc', 0.16), x, h / 2 - 0.2, z, tilt, tilt * 0.6);
      }
      break;
    }
    case 'crystal': {
      for (const [x, z, h, r, tilt] of [[0, 0, 9.5, 0.95, 0.06], [1.3, 0.5, 5.5, 0.65, -0.32], [-1.1, 0.6, 4.6, 0.6, 0.35], [0.1, -1.3, 3.8, 0.5, -0.24]] as const) {
        const c = new THREE.OctahedronGeometry(r, 0);
        c.scale(1, h / (2 * r), 1);
        add(vcol(c, '#c4b0ff', '#5a38e8', 0.34), x, h * 0.42, z, tilt, tilt);
      }
      break;
    }
    case 'pillar': {
      add(vcol(new THREE.CylinderGeometry(0.95, 1.2, 10, 8), '#68608c', '#2f2950'), 0, 5, 0, 0, 0.04);
      add(vcol(new THREE.BoxGeometry(3, 0.7, 3), '#7c74a2', '#54497c'), 0, 10.2, 0, 0, 0.04);
      add(vcol(new THREE.BoxGeometry(3.4, 0.7, 3.4), '#524b76', '#3b3560'), 0, 0.3, 0);
      add(vcol(new THREE.TorusGeometry(1.15, 0.06, 6, 22), '#b2e8ff', '#b2e8ff', 1), 0, 5.2, 0, Math.PI / 2);
      break;
    }
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!merged) throw new Error('prop merge failed');
  return merged;
}

function propMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vPGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPGlow = aGlow;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vPGlow * 3.2;');
  };
  return m;
}

export class World {
  readonly group = new THREE.Group();
  readonly def: BiomeDef;
  private sky: { mesh: THREE.Mesh; material: THREE.ShaderMaterial };
  private timeUniforms: { value: number }[] = [];
  private disposables: { dispose(): void }[] = [];
  readonly sun: THREE.DirectionalLight;
  readonly exposure: number;
  readonly bloom: number;
  readonly grade: BiomeDef['grade'];
  private ambientPts: THREE.Points | null = null;
  private grassClear = { value: 0 };
  private envRT: THREE.WebGLRenderTarget | null = null;

  constructor(readonly biome: BiomeId, private scene: THREE.Scene, renderer: THREE.WebGLRenderer, private quality: Quality) {
    const def = BIOMES[biome];
    this.def = def;
    this.exposure = def.exposure;
    this.bloom = def.bloom;
    this.grade = def.grade;

    scene.fog = new THREE.FogExp2(new THREE.Color(def.fog).getHex(), def.fogDensity);
    this.sky = makeSky(def);
    this.group.add(this.sky.mesh);

    // Image-based lighting captured from the sky itself grounds everything in the biome.
    const envScene = new THREE.Scene();
    const envSky = makeSky(def);
    envScene.add(envSky.mesh);
    const pm = new THREE.PMREMGenerator(renderer);
    this.envRT = pm.fromScene(envScene, 0.04);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.42;
    pm.dispose();
    envSky.mesh.geometry.dispose();
    envSky.material.dispose();

    const hemi = new THREE.HemisphereLight(def.hemiSky, def.hemiGround, def.hemiIntensity);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(def.sunColor, def.sunIntensity);
    const sd = new THREE.Vector3(...def.sunDir).normalize();
    sun.position.copy(sd).multiplyScalar(90);
    sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -56; cam.right = 56; cam.top = 56; cam.bottom = -56; cam.near = 5; cam.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.group.add(sun, sun.target);

    this.buildTerrain();
    this.buildArenaRing();
    if (def.liquid) this.buildLiquid(def.liquid);
    this.buildProps();
    if (def.grassDensity > 0 && def.grass) this.buildGrass();
    if (def.shafts) this.buildShafts(def.shafts);
    this.buildAmbient();
    scene.add(this.group);
  }

  private buildTerrain(): void {
    const def = this.def;
    const seg = this.quality === 'high' ? 320 : this.quality === 'medium' ? 220 : 140;
    const size = 560;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c1 = new THREE.Color(def.ground1);
    const c2 = new THREE.Color(def.ground2);
    const c3 = new THREE.Color(def.ground3);
    const rock = new THREE.Color(def.rock);
    const high = new THREE.Color(def.high);
    const m = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      p.setY(i, terrainHeight(p.getX(i), p.getZ(i), def));
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      const n = fbm2(x * 0.06, z * 0.06, 4);
      const n2 = fbm2(x * 0.2 + 9, z * 0.2 + 2, 3);
      m.copy(c1).lerp(c2, THREE.MathUtils.smoothstep(n, 0.32, 0.62)).lerp(c3, THREE.MathUtils.smoothstep(n2, 0.5, 0.78) * 0.65);
      const slope = 1 - nrm.getY(i);
      m.lerp(rock, THREE.MathUtils.smoothstep(slope, 0.13, 0.32));
      m.lerp(high, THREE.MathUtils.smoothstep(y, 26, 52));
      col[i * 3] = m.r; col[i * 3 + 1] = m.g; col[i * 3 + 2] = m.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const glowCol = new THREE.Color(def.groundGlow ?? '#000000');
    const time = { value: 0 };
    this.timeUniforms.push(time);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uGlow = { value: glowCol };
      s.uniforms.uHasGlow = { value: def.groundGlow ? 1 : 0 };
      s.uniforms.uTime = time;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = position;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW; uniform vec3 uGlow; uniform float uHasGlow, uTime;
          float th(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
          float tn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(th(i),th(i+vec2(1,0)),f.x),mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x),f.y); }
          float tf(vec2 p){ float v=0.,a=.5; for(int i=0;i<4;i++){v+=a*tn(p);p=p*2.1+3.3;a*=.5;} return v; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float d1 = tf(vW.xz*1.7);
          float d2 = tn(vW.xz*9.0);
          float d3 = tn(vW.xz*33.0);
          diffuseColor.rgb *= 0.62 + 0.62*d1 + 0.22*(d2-0.5) + 0.16*(d3-0.5);
          // Slow cloud shadows drift across the land.
          float cloudS = tf(vW.xz*0.014 + uTime*vec2(0.014,0.008));
          diffuseColor.rgb *= mix(0.68, 1.0, smoothstep(0.34, 0.58, cloudS));
          float tH = d1*0.7 + d2*0.22 + d3*0.08;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // Ground relief from the same noise as its colour, so it catches low sunlight.
          float tK = 0.16 * (1.0 - smoothstep(30.0, 110.0, length(vViewPosition)));
          if (tK > 0.001) {
            vec3 tP = -vViewPosition;
            vec3 tDx = dFdx(tP);
            vec3 tDy = dFdy(tP);
            vec3 tR1 = cross(tDy, normal);
            vec3 tR2 = cross(normal, tDx);
            float tDet = dot(tDx, tR1);
            vec3 tG = sign(tDet) * (dFdx(tH) * tK * tR1 + dFdy(tH) * tK * tR2);
            normal = normalize(abs(tDet) * normal - tG);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if(uHasGlow>0.5){
            float cr = abs(tf(vW.xz*0.34+vec2(4.0,8.0))-0.5);
            float line = 1.0-smoothstep(0.0,0.012,cr);
            float dist = length(vW.xz);
            // Cracks spread from the moat into the arena and die away up the slopes.
            float near = smoothstep(10.0,36.0,dist)*(1.0-smoothstep(52.0,84.0,dist));
            float pulse = 0.72+0.28*sin(uTime*1.3+vW.x*0.2);
            totalEmissiveRadiance += uGlow*line*(0.12+near*1.5)*pulse;
          }`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  /** A ring of faintly glowing runes marks where the fight can reach. */
  private buildArenaRing(): void {
    const geo = new THREE.RingGeometry(ARENA_RADIUS + 0.4, ARENA_RADIUS + 1.2, 128, 1);
    geo.rotateX(-Math.PI / 2);
    const time = { value: 0 };
    this.timeUniforms.push(time);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: time, uCol: { value: new THREE.Color(this.def.sunColor) } },
      vertexShader: `varying vec2 vP; varying vec3 vW; void main(){ vP = position.xz; vW = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vP; uniform float uTime; uniform vec3 uCol;
        void main(){
          float a = atan(vP.y,vP.x);
          float r = length(vP);
          float band = smoothstep(0.0,0.2,fract(r)) * smoothstep(1.0,0.8,fract(r));
          float ticks = smoothstep(0.75,0.95,sin(a*72.0));
          float sweep = 0.4+0.6*pow(0.5+0.5*sin(a*3.0-uTime*0.6),6.0);
          gl_FragColor = vec4(uCol*1.3,(0.1+ticks*0.45)*band*sweep);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.12;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildLiquid(l: NonNullable<BiomeDef['liquid']>): void {
    const geo = new THREE.PlaneGeometry(560, 560, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const time = { value: 0 };
    this.timeUniforms.push(time);
    const lava = l.emissive > 1;
    const mat = new THREE.ShaderMaterial({
      transparent: !lava,
      uniforms: {
        uTime: time, uCol: { value: new THREE.Color(l.color) }, uGlow: { value: new THREE.Color(l.glow) },
        uEm: { value: l.emissive }, uFogCol: { value: new THREE.Color(this.def.fog) }, uFogD: { value: this.def.fogDensity },
        uSky: { value: new THREE.Color(this.def.skyHorizon) },
      },
      vertexShader: `varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vD = -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vW; varying float vD; uniform float uTime,uEm,uFogD; uniform vec3 uCol,uGlow,uFogCol,uSky;
        float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<4;i++){v+=a*n(p);p=p*2.05+1.7;a*=.5;} return v; }
        void main(){
          vec2 p = vW.xz*0.16;
          float a = fbm(p + uTime*vec2(0.05,0.03));
          float b = fbm(p*2.0 - uTime*vec2(0.04,0.06) + a*2.0);
          vec3 col;
          float alpha = 1.0;
          ${lava ? `
            float crust = smoothstep(0.42,0.58,b);
            vec3 hot = mix(uCol,uGlow,smoothstep(0.1,0.6,a));
            col = mix(hot*uEm, vec3(0.06,0.03,0.03), crust);
          ` : `
            vec3 V = normalize(cameraPosition-vW);
            vec3 N = normalize(vec3((a-0.5)*0.35,1.0,(b-0.5)*0.35));
            float fr = pow(1.0-max(dot(N,V),0.0),3.0);
            col = mix(uCol, uSky*0.75, fr*0.55) + uGlow*smoothstep(0.62,0.75,b)*uEm*3.0;
            alpha = 0.82 + fr*0.18;
          `}
          float f = 1.0-exp(-uFogD*uFogD*vD*vD);
          gl_FragColor = vec4(mix(col,uFogCol,f),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = l.level;
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    if (lava) {
      // Fake bounce light from the moat: warm rim on everything standing near it.
      const glow = new THREE.HemisphereLight('#000000', '#ff4a10', 0.28);
      this.group.add(glow);
    }
  }

  private buildProps(): void {
    const def = this.def;
    const mat = propMaterial();
    this.disposables.push(mat);
    const counts = this.quality === 'low' ? 34 : this.quality === 'medium' ? 56 : 80;
    const kinds = [...new Set(def.props)];
    const dummy = new THREE.Object3D();
    let seed = this.biome.length * 137 + 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const kind of kinds) {
      const n = Math.round((counts * def.props.filter((k) => k === kind).length) / def.props.length);
      const geo = propGeometry(kind, def);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      inst.castShadow = this.quality !== 'low';
      inst.receiveShadow = true;
      for (let i = 0; i < n; i++) {
        let x = 0; let z = 0; let h = 0; let tries = 0;
        do {
          const a = rnd() * Math.PI * 2;
          const r = ARENA_RADIUS + 3 + rnd() * rnd() * 130;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          h = terrainHeight(x, z, def);
          tries++;
        } while (def.liquid && h < def.liquid.level + 0.2 && tries < 20);
        const s = (kind === 'rock' || kind === 'lavarock' ? 0.7 : 0.8) + rnd() * 0.9;
        dummy.position.set(x, h - 0.15, z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
      this.disposables.push(geo, inst);
    }
    // Small plants fill the gap between the arena and the forest edge.
    const flora = def.flora ?? [];
    const budget = this.quality === 'low' ? 60 : this.quality === 'medium' ? 180 : 420;
    for (const kind of [...new Set(flora)]) {
      const n = Math.round((budget * flora.filter((k) => k === kind).length) / flora.length);
      const geo = propGeometry(kind, def);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      inst.receiveShadow = true;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        // Most sit outside the fighting zone; a sprinkle inside keeps the arena from looking swept.
        const inner = rnd() < 0.3;
        const r = inner ? 8 + rnd() * (ARENA_RADIUS - 8) : ARENA_RADIUS + 1 + rnd() * 40;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const h = terrainHeight(x, z, def);
        const s0 = (0.6 + rnd() * 0.8) * (inner ? 0.7 : 1);
        const under = def.liquid && h < def.liquid.level + 0.1;
        dummy.position.set(x, under ? -50 : h - 0.03, z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.setScalar(s0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
      this.disposables.push(geo, inst);
    }
  }

  private buildGrass(): void {
    const def = this.def;
    const base = this.quality === 'high' ? 34000 : this.quality === 'medium' ? 9000 : 0;
    const count = Math.round(base * def.grassDensity);
    if (!count) return;
    // Each instance is a tuft of curved blades, which reads as grass rather than spikes.
    const pos: number[] = [];
    const uv: number[] = [];
    const nrm: number[] = [];
    const idx: number[] = [];
    let seedB = 77;
    const rb = () => { seedB = (seedB * 16807) % 2147483647; return seedB / 2147483647; };
    const BLADES = 5;
    for (let b = 0; b < BLADES; b++) {
      const ox = (rb() - 0.5) * 0.34;
      const oz = (rb() - 0.5) * 0.34;
      const ang = rb() * Math.PI;
      const W = 0.022 + rb() * 0.014;
      const H = 0.42 + rb() * 0.34;
      const lean = 0.08 + rb() * 0.16;
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      const start = pos.length / 3;
      const rows: [number, number, number][] = [[0, 0, 1], [0.5, 0.42, 0.8], [1, 0.82, 0.42]];
      for (const [v, yK, wK] of rows) {
        const bend = lean * v * v;
        for (const side of [-1, 1]) {
          pos.push(ox + cx * W * wK * side - sz * bend, H * yK, oz + sz * W * wK * side + cx * bend);
          uv.push(side * 0.5 + 0.5, v);
          nrm.push(0, 1, 0);
        }
      }
      pos.push(ox - sz * lean, H, oz + cx * lean);
      uv.push(0.5, 1);
      nrm.push(0, 1, 0);
      idx.push(start, start + 1, start + 2, start + 2, start + 1, start + 3, start + 2, start + 3, start + 4, start + 4, start + 3, start + 5, start + 4, start + 5, start + 6);
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    blade.setIndex(idx);
    const time = { value: 0 };
    this.timeUniforms.push(time);
    const c1 = new THREE.Color(def.grass![0]);
    const c2 = new THREE.Color(def.grass![1]);
    const root = new THREE.Color(def.ground2);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = time;
      s.uniforms.uClear = this.grassClear;
      s.uniforms.uC1 = { value: c1 };
      s.uniforms.uC2 = { value: c2 };
      s.uniforms.uRoot = { value: root };
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uClear; varying float vH; varying float vTone; attribute float aTone;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vH = uv.y; vTone = aTone;
          vec4 iw = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float wind = sin(uTime*1.6 + iw.x*0.25 + iw.z*0.18) + 0.5*sin(uTime*3.4 + iw.x*0.8 - iw.z*0.5);
          float gust = pow(0.5+0.5*sin(uTime*0.35 + iw.x*0.05 + iw.z*0.04), 3.0)*1.8;
          transformed.x += wind*(0.05+gust*0.08)*uv.y*uv.y;
          transformed.z += wind*0.03*uv.y*uv.y;
          if(uClear>0.0) transformed.y *= smoothstep(uClear*0.65,uClear,length(iw.xz));`);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uC1,uC2,uRoot; varying float vH; varying float vTone;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(uRoot, mix(uC1,uC2,vTone), smoothstep(0.0,0.75,vH));`);
    };
    const tones = new Float32Array(count);
    const inst = new THREE.InstancedMesh(blade, mat, count);
    inst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let seed = 991;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i++) {
      let x = 0; let z = 0; let r = 0; let keep = false; let clump = 0;
      for (let t = 0; t < 14 && !keep; t++) {
        const a = rnd() * Math.PI * 2;
        r = Math.pow(rnd(), 0.62) * 92;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        clump = fbm2(x * 0.11 + 3, z * 0.11 + 1, 3);
        keep = clump > (r < 30 ? 0.47 : 0.38);
        if (def.liquid && terrainHeight(x, z, def) < def.liquid.level + 0.12) keep = false;
      }
      const size = (0.75 + rnd() * 0.6) * (r < 34 ? 0.82 + (clump - 0.45) * 1.6 : 1.5);
      dummy.position.set(x, terrainHeight(x, z, def) - 0.02, z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.set(size, size * (0.9 + rnd() * 0.5), size);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      tones[i] = rnd();
    }
    blade.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    this.group.add(inst);
    this.disposables.push(blade, mat, inst);
  }

  /** Soft additive beams slanting down from the canopy. */
  private buildShafts(color: string): void {
    const n = this.quality === 'low' ? 0 : 14;
    if (!n) return;
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, -0.5, 0);
    const time = { value: 0 };
    this.timeUniforms.push(time);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uCol: { value: new THREE.Color(color) }, uTime: time },
      vertexShader: `varying vec2 vU; varying float vSeed; void main(){ vU = uv; vSeed = instanceMatrix[3][0]; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU; varying float vSeed; uniform vec3 uCol; uniform float uTime;
        void main(){
          float e = smoothstep(0.0,0.45,vU.x)*smoothstep(1.0,0.55,vU.x);
          float v = smoothstep(0.0,0.5,vU.y)*smoothstep(1.0,0.75,vU.y);
          float f = 0.7+0.3*sin(uTime*0.6+vSeed);
          gl_FragColor = vec4(uCol, e*v*0.085*f);
        }`,
    });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const dummy = new THREE.Object3D();
    let seed = 41;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const sd = new THREE.Vector3(...this.def.sunDir).normalize();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 6 + rnd() * 42;
      dummy.position.set(Math.cos(a) * r + sd.x * 20, 42, Math.sin(a) * r + sd.z * 20);
      dummy.lookAt(dummy.position.x - sd.x * 10, dummy.position.y - sd.y * 10, dummy.position.z - sd.z * 10);
      dummy.rotateX(-Math.PI / 2);
      dummy.rotateY(rnd() * Math.PI);
      dummy.scale.set(4 + rnd() * 9, 60, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.frustumCulled = false;
    this.group.add(inst);
    this.disposables.push(geo, mat, inst);
  }

  private buildAmbient(): void {
    const kind = this.def.ambient;
    const count = this.quality === 'high' ? 2600 : this.quality === 'medium' ? 1300 : 500;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 130;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 130;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const time = { value: 0 };
    this.timeUniforms.push(time);
    const styles = {
      dust: { col: '#ffe2b0', size: 0.11, fall: -0.15, drift: 0.8, alpha: 0.38, add: true, twinkle: 0.4 },
      fireflies: { col: '#d4ff6a', size: 0.17, fall: -0.1, drift: 1.3, alpha: 0.95, add: true, twinkle: 1 },
      snow: { col: '#ffffff', size: 0.17, fall: 2.3, drift: 1.2, alpha: 0.85, add: false, twinkle: 0 },
      ash: { col: '#ff8a3a', size: 0.14, fall: -0.75, drift: 1.2, alpha: 0.95, add: true, twinkle: 0.7 },
      motes: { col: '#b6a6ff', size: 0.17, fall: -0.32, drift: 0.9, alpha: 0.85, add: true, twinkle: 0.9 },
    }[kind];
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: styles.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      uniforms: {
        uTime: time, uCol: { value: new THREE.Color(styles.col) }, uSize: { value: styles.size }, uFall: { value: styles.fall },
        uDrift: { value: styles.drift }, uAlpha: { value: styles.alpha }, uTw: { value: styles.twinkle },
        uScale: { value: 1 },
      },
      vertexShader: `attribute float aSeed; uniform float uTime,uSize,uFall,uDrift,uScale,uTw; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - uTime*uFall*(0.6+aSeed), 40.0);
          p.x += sin(uTime*0.5*(0.5+aSeed)+aSeed*40.0)*uDrift*2.0;
          p.z += cos(uTime*0.4*(0.5+aSeed)+aSeed*20.0)*uDrift*2.0;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_Position = projectionMatrix*mv;
          float tw = mix(1.0, 0.5+0.5*sin(uTime*2.4+aSeed*90.0), uTw);
          vA = tw;
          gl_PointSize = uSize*(0.6+aSeed)*uScale/max(0.1,-mv.z);
        }`,
      fragmentShader: `uniform vec3 uCol; uniform float uAlpha; varying float vA;
        void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(uCol*${styles.add ? '1.9' : '1.0'}, a*a*uAlpha*vA); }`,
    });
    this.ambientPts = new THREE.Points(geo, mat);
    this.ambientPts.frustumCulled = false;
    this.group.add(this.ambientPts);
    this.disposables.push(geo, mat);
  }

  /** Flattens grass around the origin, so a showcased beast isn't hidden behind it. */
  setGrassClearing(radius: number): void { this.grassClear.value = radius; }

  setPixelScale(scale: number): void {
    if (this.ambientPts) (this.ambientPts.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
  }

  update(time: number): void {
    this.sky.material.uniforms.uTime.value = time;
    for (const t of this.timeUniforms) t.value = time;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.sky.mesh.geometry.dispose();
    this.sky.material.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.envRT?.dispose();
    this.sun.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}
