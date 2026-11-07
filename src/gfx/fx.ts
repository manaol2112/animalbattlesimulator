// Spectacle kit: rings, arcs, lightning, decals, flash lights, telegraphs and particle recipes.
import * as THREE from 'three';
import { Particles } from './particles';
import type { CameraRig } from './camera';
import type { PostFX } from './post';
import type { HitKind } from '../sim/battle';

type Rgb = [number, number, number];
const rgb = (hex: string, boost = 1): Rgb => {
  const c = new THREE.Color(hex);
  return [c.r * boost, c.g * boost, c.b * boost];
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const PALETTE = {
  fire: rgb('#ff6a14', 3.2), fireHot: rgb('#ffcf6a', 4), ember: rgb('#ff4a10', 3),
  ice: rgb('#7fe0ff', 2.8), iceHot: rgb('#e8fbff', 3.4),
  venom: rgb('#65ff3f', 2.4), shock: rgb('#7fc8ff', 4), shockHot: rgb('#f3f8ff', 5),
  gold: rgb('#ffc53d', 3.4), goldHot: rgb('#fff0b0', 4.2), heal: rgb('#59ff9b', 3),
  white: rgb('#ffffff', 2.6), rage: rgb('#ff2a2a', 3), spark: rgb('#ffcf8f', 3.6),
};

const IMPACT: Record<HitKind, { spark: Rgb; hot: Rgb; ringCol: string }> = {
  bite: { spark: PALETTE.spark, hot: PALETTE.white, ringCol: '#ffd9a8' },
  claw: { spark: PALETTE.spark, hot: PALETTE.white, ringCol: '#ffe4bc' },
  horn: { spark: rgb('#ffb066', 3), hot: PALETTE.white, ringCol: '#ffc48a' },
  venom: { spark: PALETTE.venom, hot: rgb('#d6ffb0', 3), ringCol: '#73ff4a' },
  fire: { spark: PALETTE.fire, hot: PALETTE.fireHot, ringCol: '#ff8a2a' },
  ice: { spark: PALETTE.ice, hot: PALETTE.iceHot, ringCol: '#9ae8ff' },
  shock: { spark: PALETTE.shock, hot: PALETTE.shockHot, ringCol: '#9fd4ff' },
  earth: { spark: rgb('#d2a06a', 2), hot: rgb('#fff0d0', 2.4), ringCol: '#e2bc8a' },
  dot: { spark: rgb('#ffffff', 0.6), hot: rgb('#ffffff', 0.6), ringCol: '#ffffff' },
};

// ── Pools of short-lived meshes ───────────────────────────
interface Timed { mesh: THREE.Mesh; t: number; dur: number; active: boolean; uniforms: Record<string, THREE.IUniform>; update?: (k: number, it: Timed) => void; }

function pool(count: number, make: () => Timed): Timed[] {
  return Array.from({ length: count }, make);
}

export class FX {
  readonly particles: Particles;
  private rings: Timed[];
  private arcs: Timed[];
  private decals: Timed[];
  private teles: Timed[];
  private beams: Timed[];
  private stars: Timed[];
  private bolts: { mesh: THREE.Mesh; geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial; t: number; dur: number; active: boolean }[] = [];
  private lights: { l: THREE.PointLight; t: number; dur: number; power: number }[] = [];
  private meteors: { mesh: THREE.Mesh; t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; active: boolean }[] = [];
  private dustCol: Rgb = [0.6, 0.5, 0.35];
  private tmp = new THREE.Vector3();
  private time = 0;

  constructor(private scene: THREE.Scene, private cam: CameraRig, private post: PostFX, capacity: number) {
    this.particles = new Particles(scene, capacity);

    const ringGeo = new THREE.PlaneGeometry(2, 2);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = pool(28, () => this.makeShaderItem(ringGeo, {
      uK: { value: 0 }, uCol: { value: new THREE.Color() }, uWidth: { value: 0.1 }, uGain: { value: 2 },
    }, /* glsl */`
      varying vec2 vU; uniform float uK,uWidth,uGain; uniform vec3 uCol;
      void main(){
        float d = length(vU-0.5)*2.0;
        float r = uK;
        float w = uWidth*(1.0-uK*0.5);
        float band = smoothstep(r-w,r,d)*smoothstep(r+w*0.35,r,d);
        float fill = smoothstep(r,0.0,d)*0.1;
        float a = (band+fill)*(1.0-uK)*(1.0-uK*0.4);
        gl_FragColor = vec4(uCol*uGain,a);
      }`, THREE.AdditiveBlending));

    const arcGeo = new THREE.RingGeometry(0.62, 1, 28, 1, -1.25, 2.5);
    arcGeo.rotateX(-Math.PI / 2);
    this.arcs = pool(18, () => this.makeShaderItem(arcGeo, {
      uK: { value: 0 }, uCol: { value: new THREE.Color() },
    }, /* glsl */`
      varying vec2 vU; uniform float uK; uniform vec3 uCol; varying vec3 vPos;
      void main(){
        float ang = atan(vPos.z,vPos.x);
        float t = ang/2.5+0.5;
        float head = smoothstep(uK-0.55,uK,t)*smoothstep(uK+0.08,uK,t);
        float rad = length(vPos.xz);
        float edge = smoothstep(0.62,0.95,rad)*smoothstep(1.0,0.97,rad);
        float a = head*edge*(1.0-uK*uK);
        gl_FragColor = vec4(uCol*3.2,a);
      }`, THREE.AdditiveBlending));

    const decalGeo = new THREE.PlaneGeometry(2, 2);
    decalGeo.rotateX(-Math.PI / 2);
    this.decals = pool(26, () => this.makeShaderItem(decalGeo, {
      uK: { value: 0 }, uSeed: { value: Math.random() * 100 }, uHot: { value: new THREE.Color('#ff6a14') }, uCrack: { value: 0 },
    }, /* glsl */`
      varying vec2 vU; uniform float uK,uSeed,uCrack; uniform vec3 uHot;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<4;i++){v+=a*n(p);p=p*2.1+1.3;a*=.5;} return v; }
      void main(){
        vec2 p = (vU-0.5)*2.0;
        float r = length(p);
        float ang = atan(p.y,p.x);
        float wob = fbm(p*2.7+uSeed);
        float mask = smoothstep(0.98,0.45,r+wob*0.32-0.08);
        float cracks = 0.0;
        if(uCrack>0.5){
          float ray = abs(sin(ang*6.0+uSeed+wob*3.0));
          cracks = (1.0-smoothstep(0.0,0.09,ray))*smoothstep(1.0,0.2,r);
        }
        float fadeOut = 1.0-smoothstep(0.65,1.0,uK);
        float a = (mask*0.72+cracks*0.8)*fadeOut;
        float hot = pow(1.0-smoothstep(0.0,0.18,uK),2.0);
        vec3 col = vec3(0.025,0.02,0.018) + uHot*hot*(0.8+cracks*5.0+smoothstep(0.55,0.0,r)*2.2);
        gl_FragColor = vec4(col,a);
      }`, THREE.NormalBlending));
    this.decals.forEach((d) => { d.mesh.renderOrder = 1; });

    const teleGeo = new THREE.PlaneGeometry(2, 2);
    teleGeo.rotateX(-Math.PI / 2);
    this.teles = pool(14, () => this.makeShaderItem(teleGeo, {
      uK: { value: 0 }, uCol: { value: new THREE.Color() }, uTime: { value: 0 },
    }, /* glsl */`
      varying vec2 vU; uniform float uK,uTime; uniform vec3 uCol;
      void main(){
        vec2 p=(vU-0.5)*2.0; float r=length(p);
        float ang = atan(p.y,p.x);
        float rim = smoothstep(0.91,0.97,r)*smoothstep(1.0,0.97,r);
        float dash = step(0.0,sin(ang*14.0+uTime*7.0));
        float fill = smoothstep(uK+0.02,uK,r)*0.2;
        float closing = smoothstep(0.05,0.0,abs(r-uK))*0.8;
        float a = (rim*dash*0.9 + fill + closing)*step(r,1.0);
        gl_FragColor = vec4(uCol*2.6,a*0.85);
      }`, THREE.AdditiveBlending));

    // Comic-book impact bursts, always facing the camera.
    const starGeo = new THREE.PlaneGeometry(2, 2);
    this.stars = pool(22, () => this.makeShaderItem(starGeo, {
      uK: { value: 0 }, uCol: { value: new THREE.Color() }, uSeed: { value: Math.random() * 10 }, uSpikes: { value: 9 },
    }, /* glsl */`
      varying vec2 vU; uniform float uK,uSeed,uSpikes; uniform vec3 uCol;
      void main(){
        vec2 p=(vU-0.5)*2.0; float r=length(p); float a=atan(p.y,p.x)+uSeed;
        float jag=0.5+0.5*abs(sin(a*uSpikes*0.5))+0.13*sin(a*23.0+uSeed);
        float size=(0.3+pow(uK,0.4)*0.7);
        float edge=jag*size;
        float body=smoothstep(edge,edge-0.14,r);
        float hollow=smoothstep(uK*0.82-0.1,uK*0.82+0.06,r/edge*1.0);
        float core=smoothstep(0.5*size,0.0,r)*(1.0-uK);
        // Mostly a hollow outline that races outward, so the beasts stay visible through it.
        float a2=body*hollow*(1.0-uK)*(1.0-uK);
        vec3 col=mix(uCol*1.3,vec3(1.7,1.6,1.4),core);
        gl_FragColor=vec4(col,clamp(a2*0.7+core*0.45,0.0,1.0));
      }`, THREE.AdditiveBlending, true));
    this.stars.forEach((st) => { st.mesh.renderOrder = 8; (st.mesh.material as THREE.ShaderMaterial).depthTest = false; });

    // Vertical light beams: heals, level-ups, lightning glow, phoenix rebirth.
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    beamGeo.translate(0, 0.5, 0);
    this.beams = pool(16, () => this.makeShaderItem(beamGeo, {
      uK: { value: 0 }, uCol: { value: new THREE.Color() }, uTime: { value: 0 }, uGain: { value: 2.4 },
    }, /* glsl */`
      varying vec2 vU; uniform float uK,uTime,uGain; uniform vec3 uCol;
      void main(){
        float fall = pow(1.0-vU.y,1.9);
        float stripes = 0.72+0.28*sin(vU.x*50.0+uTime*7.0+vU.y*5.0);
        float env = smoothstep(0.0,0.1,uK)*smoothstep(1.0,0.4,uK);
        gl_FragColor = vec4(uCol*uGain,fall*stripes*env*0.42);
      }`, THREE.AdditiveBlending, true));

    // Lightning ribbons.
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 2 * 3 * 2), 3));
      const idx: number[] = [];
      for (let c = 0; c < 2; c++) {
        const o = c * 64;
        for (let s = 0; s < 31; s++) {
          const a = o + s * 2;
          idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(4, 6, 10), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, geo, mat, t: 0, dur: 0.1, active: false });
    }

    // Reusable flash lights: count is fixed so shaders never recompile mid-fight.
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 30, 1.8);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 0, power: 0 });
    }

    const meteorGeo = new THREE.IcosahedronGeometry(1.5, 2);
    const meteorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.6, 0.9), toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(meteorGeo, meteorMat);
      mesh.visible = false;
      scene.add(mesh);
      this.meteors.push({ mesh, t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), active: false });
    }
  }

  private makeShaderItem(geo: THREE.BufferGeometry, uniforms: Record<string, THREE.IUniform>, fragment: string, blending: THREE.Blending, doubleSided = false): Timed {
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending, fog: false,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      vertexShader: `varying vec2 vU; varying vec3 vPos; void main(){ vU=uv; vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: fragment,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    return { mesh, t: 0, dur: 1, active: false, uniforms };
  }

  setDustColor(hex: string): void { this.dustCol = rgb(hex); }

  private claim(list: Timed[]): Timed {
    let best = list[0];
    for (const it of list) {
      if (!it.active) { best = it; break; }
      if (it.t / it.dur > best.t / best.dur) best = it;
    }
    best.active = true;
    best.t = 0;
    best.mesh.visible = true;
    return best;
  }

  // ── Primitives ──────────────────────────────────────────
  ring(x: number, z: number, radius: number, color: string, dur = 0.55, width = 0.14, y = 0.14, gain = 2): void {
    const r = this.claim(this.rings);
    r.dur = dur;
    r.mesh.position.set(x, y, z);
    r.mesh.scale.setScalar(radius);
    r.uniforms.uCol.value.set(color);
    r.uniforms.uWidth.value = width;
    r.uniforms.uGain.value = gain;
  }

  arc(x: number, y: number, z: number, heading: number, size: number, color: string, tilt = 0): void {
    const a = this.claim(this.arcs);
    a.dur = 0.24;
    a.mesh.position.set(x, y, z);
    a.mesh.rotation.set(tilt, heading - Math.PI / 2, 0, 'YXZ');
    a.mesh.scale.setScalar(size);
    a.uniforms.uCol.value.set(color);
  }

  decal(x: number, z: number, r: number, hot = '#ff6a14', crack = false, dur = 14): void {
    const d = this.claim(this.decals);
    d.dur = dur;
    d.mesh.position.set(x, 0.09 + Math.random() * 0.02, z);
    d.mesh.scale.setScalar(r);
    d.mesh.rotation.y = Math.random() * 6.28;
    d.uniforms.uHot.value.set(hot);
    d.uniforms.uCrack.value = crack ? 1 : 0;
    d.uniforms.uSeed.value = Math.random() * 100;
  }

  telegraph(x: number, z: number, r: number, delay: number, color: string): void {
    const t = this.claim(this.teles);
    t.dur = delay;
    t.mesh.position.set(x, 0.17, z);
    t.mesh.scale.setScalar(r);
    t.uniforms.uCol.value.set(color);
  }

  beam(x: number, y: number, z: number, radius: number, height: number, color: string, dur = 1.4, gain = 2.4): void {
    const b = this.claim(this.beams);
    b.dur = dur;
    b.mesh.position.set(x, y, z);
    b.mesh.scale.set(radius, height, radius);
    b.uniforms.uCol.value.set(color);
    b.uniforms.uGain.value = gain;
  }

  star(x: number, y: number, z: number, size: number, color: string, dur = 0.26): void {
    const st = this.claim(this.stars);
    st.dur = dur;
    st.mesh.position.set(x, y, z);
    st.mesh.scale.setScalar(size);
    st.mesh.quaternion.copy(this.cam.camera.quaternion);
    st.uniforms.uCol.value.set(color);
    st.uniforms.uSeed.value = Math.random() * 10;
    st.uniforms.uSpikes.value = 7 + Math.floor(Math.random() * 5);
  }

  /** Bits of the victim's coat (fur, feathers or chitin) knocked loose on a hit. */
  tufts(x: number, y: number, z: number, n: number, hex: string, size: number): void {
    const c = rgb(hex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 6.5);
      this.particles.puff({
        x, y, z, vx: Math.cos(a) * s, vy: rand(1.5, 6), vz: Math.sin(a) * s, life: rand(0.5, 1), size: size * rand(0.5, 1), endSize: size * 0.3,
        r: c[0], g: c[1], b: c[2], a: 1, gravity: 11, drag: 2.4,
      });
    }
  }

  /** Light streaks along a line of travel, so fast moves read as fast. */
  streaks(x: number, y: number, z: number, dirX: number, dirZ: number, size: number, color: string): void {
    const c = rgb(color, 2.6);
    for (let i = 0; i < 12; i++) {
      const off = rand(-1, 1) * size;
      const back = rand(0, 1.6) * size;
      this.particles.add({
        x: x - dirX * back - dirZ * off, y: y + rand(-0.6, 0.6) * size, z: z - dirZ * back + dirX * off,
        vx: -dirX * rand(4, 11), vz: -dirZ * rand(4, 11), life: rand(0.14, 0.3), size: rand(0.1, 0.24), endSize: 0.02, r: c[0], g: c[1], b: c[2], drag: 3,
      });
    }
  }

  flash(x: number, y: number, z: number, color: string, power: number, dur = 0.3, dist = 30): void {
    let best = this.lights[0];
    for (const l of this.lights) if (l.t / (l.dur || 1) > best.t / (best.dur || 1) || l.dur === 0) { best = l; if (l.dur === 0) break; }
    best.t = 0;
    best.dur = dur;
    best.power = power;
    best.l.position.set(x, y, z);
    best.l.color.set(color);
    best.l.distance = dist;
  }

  /** Forked ribbon between two points, drawn as two crossed strips so it reads from any angle. */
  bolt(a: [number, number, number], b: [number, number, number], width = 0.2, dur = 0.16, color?: [number, number, number]): void {
    let item = this.bolts.find((x) => !x.active);
    if (!item) item = this.bolts[0];
    item.active = true;
    item.t = 0;
    item.dur = dur;
    item.mesh.visible = true;
    item.mat.color.setRGB(...(color ?? ([4, 6, 10] as const)));
    item.mat.opacity = 1;
    const pos = item.geo.attributes.position as THREE.BufferAttribute;
    const n = 32;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let dx = 0; let dy = 0; let dz = 0;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const env = Math.sin(k * Math.PI);
      if (i % 3 === 0) {
        dx = rand(-1, 1) * len * 0.06 * env;
        dy = rand(-1, 1) * len * 0.06 * env;
        dz = rand(-1, 1) * len * 0.06 * env;
      }
      const x = a[0] + (b[0] - a[0]) * k + dx;
      const y = a[1] + (b[1] - a[1]) * k + dy;
      const z = a[2] + (b[2] - a[2]) * k + dz;
      const w = width * (0.5 + 0.5 * env);
      pos.setXYZ(i * 2, x - w, y, z);
      pos.setXYZ(i * 2 + 1, x + w, y, z);
      pos.setXYZ(64 + i * 2, x, y, z - w);
      pos.setXYZ(64 + i * 2 + 1, x, y, z + w);
    }
    pos.needsUpdate = true;
  }

  meteor(x: number, z: number, delay: number): void {
    const m = this.meteors.find((q) => !q.active) ?? this.meteors[0];
    m.active = true;
    m.t = 0;
    m.dur = delay;
    m.from.set(x + 22, 75, z - 24);
    m.to.set(x, 0, z);
    m.mesh.visible = true;
    m.mesh.position.copy(m.from);
  }

  /** Projects a world point into screen space for the distortion pass. */
  private shockAt(x: number, y: number, z: number, strength: number, dur = 0.6, reach = 0.5): void {
    this.tmp.set(x, y, z).project(this.cam.camera);
    if (this.tmp.z > 1) return;
    this.post.shock(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5, strength, dur, reach);
  }

  // ── Recipes ─────────────────────────────────────────────
  sparks(x: number, y: number, z: number, n: number, col: Rgb, speed = 8, life = 0.5, size = 0.16, gravity = 18): void {
    const p = this.particles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(-0.2, 1);
      const s = speed * rand(0.35, 1);
      p.add({
        x, y, z, vx: Math.cos(a) * s * Math.cos(e), vy: Math.sin(e) * s, vz: Math.sin(a) * s * Math.cos(e),
        life: life * rand(0.55, 1.1), size: size * rand(0.6, 1.2), endSize: size * 0.2, r: col[0], g: col[1], b: col[2], gravity, drag: 2.2,
      });
    }
  }

  dust(x: number, z: number, n: number, spread: number, size: number, life = 0.9, col?: Rgb): void {
    const c = col ?? this.dustCol;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * spread;
      this.particles.puff({
        x: x + Math.cos(a) * s * 0.4, y: 0.2 + Math.random() * 0.3, z: z + Math.sin(a) * s * 0.4,
        vx: Math.cos(a) * s * 1.6, vy: rand(0.4, 1.6), vz: Math.sin(a) * s * 1.6,
        life: life * rand(0.7, 1.2), size: size * rand(0.5, 0.85), endSize: size * rand(1.4, 2), r: c[0], g: c[1], b: c[2], a: 0.5, drag: 2.5,
      });
    }
  }

  smoke(x: number, y: number, z: number, n: number, size: number, life = 1.8, shade = 0.08): void {
    for (let i = 0; i < n; i++) {
      this.particles.puff({
        x: x + rand(-0.4, 0.4) * size, y: y + rand(0, 0.4) * size, z: z + rand(-0.4, 0.4) * size,
        vx: rand(-1, 1), vy: rand(1, 3.4), vz: rand(-1, 1), life: life * rand(0.7, 1.2),
        size: size * rand(0.4, 0.7), endSize: size * rand(1.3, 2.1), r: shade, g: shade, b: shade, a: 0.55, drag: 1.2,
      });
    }
  }

  impact(x: number, y: number, z: number, kind: HitKind, strength: number, crit: boolean): void {
    if (kind === 'dot') return;
    const def = IMPACT[kind];
    const n = Math.round((crit ? 16 : 7) * strength);
    this.sparks(x, y, z, n, def.spark, 7 + strength * 3, 0.42, 0.14 + 0.06 * strength);
    this.particles.add({ x, y, z, life: 0.09, size: 0.35 + strength * 0.42, endSize: 0.5 + strength * 0.7, r: def.hot[0] * 0.5, g: def.hot[1] * 0.5, b: def.hot[2] * 0.5 });
    if (kind === 'fire') this.smoke(x, y, z, 2, 1, 1);
    if (kind === 'ice') this.sparks(x, y, z, 6, PALETTE.iceHot, 5, 0.8, 0.14, 12);
    if (kind === 'earth') this.dust(x, z, 5, 1.4, 1);
    if (crit) {
      this.flash(x, y + 0.4, z, def.ringCol, 26, 0.16, 12);
      this.ring(x, z, 2.2 + strength * 1.8, def.ringCol, 0.3, 0.2, y * 0.2 + 0.15);
    }
  }

  slam(x: number, z: number, r: number, color: string, hotCol: string): void {
    this.ring(x, z, r, color, 0.7, 0.14, 0.15, 2.4);
    this.ring(x, z, r * 0.62, '#ffffff', 0.45, 0.2, 0.16, 1.6);
    this.decal(x, z, r * 0.72, hotCol, true, 16);
    this.dust(x, z, 28, r * 0.9, 2.2 + r * 0.14, 1.6);
    this.flash(x, 1.2, z, color, 50, 0.32, r * 3);
    this.shockAt(x, 0.5, z, 1.0, 0.7, 0.6);
    this.cam.shake(0.5, true);
    this.post.kickAberration(0.5);
    // Chunks thrown skyward.
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.28;
      const d = rand(0.1, 1) * r * 0.55;
      this.particles.puff({
        x: x + Math.cos(a) * d, y: 0.2, z: z + Math.sin(a) * d,
        vx: Math.cos(a) * rand(1, 5), vy: rand(6, 15), vz: Math.sin(a) * rand(1, 5),
        life: rand(0.8, 1.3), size: rand(0.16, 0.42), endSize: 0.1, r: this.dustCol[0] * 0.5, g: this.dustCol[1] * 0.5, b: this.dustCol[2] * 0.5, a: 1, gravity: 26,
      });
    }
  }

  explosion(x: number, z: number, r: number, big: boolean): void {
    const y = 0.8;
    this.particles.add({ x, y: y + r * 0.4, z, life: 0.16, size: r * 1.8, endSize: r * 3, r: 2.2, g: 1.3, b: 0.6, a: 0.8 });
    const n = big ? 70 : 26;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const e = rand(0.1, 1.2);
      const s = rand(4, big ? 24 : 12);
      const hot = Math.random() < 0.4 ? PALETTE.fireHot : PALETTE.fire;
      this.particles.add({
        x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s,
        life: rand(0.4, big ? 1.5 : 0.9), size: rand(0.5, big ? 2.2 : 1.1), endSize: rand(0.3, big ? 1.4 : 0.7),
        r: hot[0], g: hot[1], b: hot[2], a: 0.42, gravity: 7, drag: 2,
      });
    }
    this.sparks(x, y, z, big ? 70 : 20, PALETTE.fireHot, big ? 28 : 14, big ? 1.6 : 0.9, 0.2, 16);
    this.smoke(x, 1, z, big ? 22 : 6, big ? 5 : 2.2, big ? 3 : 1.6, 0.05);
    this.dust(x, z, big ? 22 : 7, r * 1.1, big ? 3.6 : 1.5, 1.6);
    this.ring(x, z, r * (big ? 1.7 : 1.2), '#ffb066', big ? 0.9 : 0.5, 0.12, 0.2, 3);
    this.decal(x, z, r * 0.92, '#ff5a14', big, 18);
    this.flash(x, 3, z, '#ff9040', big ? 70 : 24, big ? 0.55 : 0.22, r * (big ? 7 : 4));
    this.shockAt(x, 1, z, big ? 1.05 : 0.4, big ? 0.8 : 0.45, big ? 0.8 : 0.36);
    this.cam.shake(big ? 0.7 : 0.2, big);
    this.post.kickAberration(big ? 0.7 : 0.15);
    if (big) this.post.flashScreen(0.18, '#ffd6a0');
  }

  lightning(x: number, z: number, heavy = false): void {
    const top: [number, number, number] = [x + rand(-5, 5), 42, z + rand(-5, 5)];
    this.bolt(top, [x, 0.2, z], heavy ? 0.42 : 0.28, 0.22);
    this.bolt(top, [x + rand(-2, 2), 0.2, z + rand(-2, 2)], 0.1, 0.12);
    this.sparks(x, 0.5, z, 24, PALETTE.shockHot, 14, 0.5, 0.15);
    this.ring(x, z, 3, '#a8d8ff', 0.35, 0.2, 0.17, 3);
    this.beam(x, 0, z, 0.8, 20, '#b6dcff', 0.3, 3);
    this.decal(x, z, 1.6, '#7fc8ff', false, 8);
    this.flash(x, 3, z, '#a8d0ff', 80, 0.2, 26);
    this.post.flashScreen(0.1, '#cfe4ff');
    this.cam.shake(0.2);
    this.post.kickAberration(0.15);
  }

  healBurst(x: number, y: number, z: number, h: number): void {
    const p = this.particles;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.28;
      const r = 0.6 + h * 0.3;
      p.add({
        x: x + Math.cos(a) * r, y: y + Math.random() * 0.4, z: z + Math.sin(a) * r,
        vx: -Math.sin(a) * 1.3, vy: rand(2.4, 4.8), vz: Math.cos(a) * 1.3,
        life: rand(0.7, 1.15), size: rand(0.15, 0.3), endSize: 0.03,
        r: PALETTE.heal[0], g: PALETTE.heal[1], b: PALETTE.heal[2], drag: 1,
      });
    }
  }

  /** Big gold moment when a beast levels up. */
  levelUpBurst(x: number, z: number, h: number, evolved: boolean): void {
    const color = evolved ? '#c58bff' : '#ffd25a';
    const col = evolved ? rgb('#d6a8ff', 3.6) : PALETTE.gold;
    this.beam(x, 0, z, (evolved ? 1.7 : 1.1) + h * 0.15, 24, color, evolved ? 2.6 : 1.8, 1.7);
    this.ring(x, z, 5 + h, color, 0.95, 0.12, 0.2, 3);
    this.ring(x, z, 3 + h * 0.6, '#ffffff', 0.6, 0.18, 0.2, 2);
    this.flash(x, 2, z, color, 40, 0.8, 16);
    for (let i = 0; i < (evolved ? 130 : 70); i++) {
      const a = Math.random() * 6.28;
      const r = rand(0.2, 1.6 + h * 0.2);
      this.particles.add({
        x: x + Math.cos(a) * r, y: rand(0.1, 1), z: z + Math.sin(a) * r,
        vx: Math.cos(a) * rand(0.2, 2.5), vy: rand(4, evolved ? 18 : 12), vz: Math.sin(a) * rand(0.2, 2.5),
        life: rand(0.8, 2), size: rand(0.1, 0.3), endSize: 0.03, r: col[0], g: col[1], b: col[2], drag: 0.9,
      });
    }
    if (evolved) {
      this.shockAt(x, 1, z, 0.9, 0.85, 0.6);
      this.cam.shake(0.45);
    }
  }

  /** A shower of gold coins that rain back to earth. */
  coinBurst(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const s = rand(1.5, 7);
      const hot = Math.random() < 0.35;
      const c = hot ? PALETTE.goldHot : PALETTE.gold;
      this.particles.add({
        x, y, z, vx: Math.cos(a) * s, vy: rand(6, 14), vz: Math.sin(a) * s,
        life: rand(0.9, 1.6), size: rand(0.16, 0.34), endSize: rand(0.12, 0.24), r: c[0], g: c[1], b: c[2], gravity: 21, drag: 0.4,
      });
    }
  }

  deathBurst(x: number, y: number, z: number, size: number, teamColor: string): void {
    const c = rgb(teamColor, 2.6);
    this.sparks(x, y, z, Math.round(16 + size * 10), c, 7 + size * 2.5, 0.8, 0.17 + size * 0.04, 8);
    this.smoke(x, 0.6, z, Math.round(3 + size * 2), 1 + size, 1.4, 0.3);
    this.ring(x, z, 2 + size * 1.8, teamColor, 0.5, 0.17, 0.15, 2.2);
    if (size > 1.2) this.shockAt(x, y, z, 0.45, 0.5, 0.4);
    this.flash(x, y, z, teamColor, 20 + size * 16, 0.28, 10 + size * 6);
  }

  emberRise(x: number, y: number, z: number, spread: number): void {
    this.particles.add({
      x: x + rand(-spread, spread), y: y + rand(-0.3, 0.5), z: z + rand(-spread, spread),
      vx: rand(-0.4, 0.4), vy: rand(1.2, 3.2), vz: rand(-0.4, 0.4), life: rand(0.5, 1.2),
      size: rand(0.08, 0.2), endSize: 0.02, r: PALETTE.ember[0], g: PALETTE.ember[1], b: PALETTE.ember[2],
    });
  }

  // ── Update loop ─────────────────────────────────────────
  update(gameDt: number, realDt: number): void {
    this.time += gameDt;
    this.particles.time += gameDt;

    const tick = (list: Timed[], dt: number, apply?: (it: Timed, k: number) => void) => {
      for (const it of list) {
        if (!it.active) continue;
        it.t += dt;
        const k = it.t / it.dur;
        if (k >= 1) {
          it.active = false;
          it.mesh.visible = false;
          continue;
        }
        it.uniforms.uK.value = k;
        apply?.(it, k);
      }
    };
    tick(this.rings, gameDt);
    tick(this.arcs, gameDt);
    tick(this.decals, gameDt);
    tick(this.teles, gameDt, (it) => { it.uniforms.uTime.value = this.time; });
    tick(this.beams, gameDt, (it) => { it.uniforms.uTime.value = this.time; });
    tick(this.stars, Math.max(gameDt, realDt * 0.45), (it) => { it.mesh.quaternion.copy(this.cam.camera.quaternion); });

    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += realDt;
      const k = b.t / b.dur;
      if (k >= 1) { b.active = false; b.mesh.visible = false; continue; }
      b.mat.opacity = (1 - k) * (Math.random() < 0.8 ? 1 : 0.35);
    }
    for (const l of this.lights) {
      if (l.dur <= 0) continue;
      l.t += realDt;
      const k = l.t / l.dur;
      if (k >= 1) { l.dur = 0; l.l.intensity = 0; continue; }
      l.l.intensity = l.power * (1 - k) * (1 - k);
    }
    for (const m of this.meteors) {
      if (!m.active) continue;
      m.t += gameDt;
      const k = Math.min(1, m.t / m.dur);
      const e = k * k * 0.6 + k * 0.4;
      m.mesh.position.lerpVectors(m.from, m.to, e);
      const p = m.mesh.position;
      m.mesh.scale.setScalar(1 + k * 1.2);
      for (let i = 0; i < 7; i++) {
        const c = Math.random() < 0.5 ? PALETTE.fire : PALETTE.fireHot;
        this.particles.add({
          x: p.x + rand(-0.7, 0.7), y: p.y + rand(-0.7, 0.7), z: p.z + rand(-0.7, 0.7), vy: rand(0, 2),
          life: rand(0.25, 0.65), size: rand(0.8, 2.2), endSize: 0.2, r: c[0], g: c[1], b: c[2],
        });
      }
      if (Math.random() < 0.6) this.smoke(p.x, p.y, p.z, 1, 2.4, 1.2, 0.06);
      if (k >= 1) { m.active = false; m.mesh.visible = false; }
    }

    this.particles.flush();
  }

  setParticleScale(px: number): void { this.particles.setScale(px); }

  /** Wipes every live effect, so scorch marks can't leak from one screen into the next. */
  clear(): void {
    const off = (list: Timed[]) => list.forEach((it) => { it.active = false; it.mesh.visible = false; });
    off(this.rings); off(this.arcs); off(this.decals); off(this.teles); off(this.beams); off(this.stars);
    this.bolts.forEach((b) => { b.active = false; b.mesh.visible = false; });
    this.lights.forEach((l) => { l.dur = 0; l.l.intensity = 0; });
    this.meteors.forEach((m) => { m.active = false; m.mesh.visible = false; });
    this.particles.clear();
  }

  dispose(): void {
    this.particles.dispose(this.scene);
    const drop = (list: Timed[]) => list.forEach((it) => { this.scene.remove(it.mesh); (it.mesh.material as THREE.Material).dispose(); });
    drop(this.rings); drop(this.arcs); drop(this.decals); drop(this.teles); drop(this.beams); drop(this.stars);
    this.bolts.forEach((b) => { this.scene.remove(b.mesh); b.geo.dispose(); b.mat.dispose(); });
    this.lights.forEach((l) => this.scene.remove(l.l));
    this.meteors.forEach((m) => this.scene.remove(m.mesh));
  }
}
