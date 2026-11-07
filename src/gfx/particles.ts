// GPU particle pools. Motion is solved in the vertex shader against game time, so slow-mo slows everything.
import * as THREE from 'three';

export interface ParticleOpts {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; life?: number;
  size?: number; endSize?: number; r?: number; g?: number; b?: number; a?: number; gravity?: number; drag?: number; shape?: number;
}

class Pool {
  readonly points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private vel: THREE.BufferAttribute;
  private data: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private data2: THREE.BufferAttribute;
  private head = 0;
  private dirtyFrom = -1;
  private dirtyTo = -1;
  private wrapped = false;
  readonly material: THREE.ShaderMaterial;

  constructor(private capacity: number, blending: THREE.Blending) {
    const geo = new THREE.BufferGeometry();
    const mk = (n: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3); this.vel = mk(3); this.data = mk(4); this.col = mk(4); this.data2 = mk(2);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aVel', this.vel);
    geo.setAttribute('aData', this.data); // birth, life, size, endSize
    geo.setAttribute('aCol', this.col);
    geo.setAttribute('aData2', this.data2); // gravity, drag
    // Dead by default: born far in the future so nothing draws until written.
    this.data.array.fill(-1000);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
      vertexShader: `
        attribute vec3 aVel; attribute vec4 aData; attribute vec4 aCol; attribute vec2 aData2;
        uniform float uTime, uScale; varying vec4 vCol; varying float vAge;
        void main(){
          float age = uTime - aData.x;
          float k = age / aData.y;
          if (k < 0.0 || k >= 1.0 || aData.y <= 0.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vAge = 0.0; return; }
          float drag = aData2.y;
          float dd = drag > 0.001 ? (1.0-exp(-drag*age))/drag : age;
          vec3 p = position + aVel*dd;
          p.y -= 0.5*aData2.x*age*age;
          p.y = max(p.y, 0.03);
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_Position = projectionMatrix*mv;
          float s = mix(aData.z,aData.w,k);
          gl_PointSize = s*uScale/max(0.2,-mv.z);
          vCol = aCol; vAge = k;
        }`,
      fragmentShader: `
        varying vec4 vCol; varying float vAge;
        void main(){
          vec2 c = gl_PointCoord-0.5;
          float d = length(c)*2.0;
          float soft = smoothstep(1.0,0.0,d);
          float fade = (1.0-vAge)*(1.0-vAge)*smoothstep(0.0,0.06,vAge);
          float a = soft*soft*fade*vCol.a;
          if(a<0.003) discard;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  emit(o: ParticleOpts, time: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.head === 0) this.wrapped = true;
    const pos = this.pos.array as Float32Array;
    pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
    const vel = this.vel.array as Float32Array;
    vel[i * 3] = o.vx ?? 0; vel[i * 3 + 1] = o.vy ?? 0; vel[i * 3 + 2] = o.vz ?? 0;
    const d = this.data.array as Float32Array;
    d[i * 4] = time; d[i * 4 + 1] = o.life ?? 1; d[i * 4 + 2] = o.size ?? 0.4; d[i * 4 + 3] = o.endSize ?? o.size ?? 0.4;
    const c = this.col.array as Float32Array;
    c[i * 4] = o.r ?? 1; c[i * 4 + 1] = o.g ?? 1; c[i * 4 + 2] = o.b ?? 1; c[i * 4 + 3] = o.a ?? 1;
    const d2 = this.data2.array as Float32Array;
    d2[i * 2] = o.gravity ?? 0; d2[i * 2 + 1] = o.drag ?? 0;
    if (this.dirtyFrom < 0) this.dirtyFrom = i;
    this.dirtyTo = i;
  }

  flush(time: number, scale: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScale.value = scale;
    if (this.dirtyFrom < 0) return;
    const attrs: [THREE.BufferAttribute, number][] = [[this.pos, 3], [this.vel, 3], [this.data, 4], [this.col, 4], [this.data2, 2]];
    for (const [a, n] of attrs) {
      a.clearUpdateRanges();
      if (this.wrapped || this.dirtyTo < this.dirtyFrom) {
        a.addUpdateRange(0, this.capacity * n);
      } else {
        a.addUpdateRange(this.dirtyFrom * n, (this.dirtyTo - this.dirtyFrom + 1) * n);
      }
      a.needsUpdate = true;
    }
    this.dirtyFrom = -1;
    this.dirtyTo = -1;
    this.wrapped = false;
  }

  /** Retires every particle at once. */
  clear(): void {
    (this.data.array as Float32Array).fill(-1000);
    this.data.clearUpdateRanges();
    this.data.needsUpdate = true;
    this.head = 0;
    this.dirtyFrom = -1;
    this.dirtyTo = -1;
    this.wrapped = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

export class Particles {
  readonly glow: Pool;
  readonly smoke: Pool;
  time = 0;
  private scale = 800;

  constructor(scene: THREE.Scene, capacity: number) {
    this.glow = new Pool(capacity, THREE.AdditiveBlending);
    this.smoke = new Pool(Math.round(capacity * 0.5), THREE.NormalBlending);
    this.smoke.points.renderOrder = 4;
    this.glow.points.renderOrder = 5;
    scene.add(this.smoke.points, this.glow.points);
  }

  add(o: ParticleOpts): void { this.glow.emit(o, this.time); }
  puff(o: ParticleOpts): void { this.smoke.emit(o, this.time); }

  setScale(scale: number): void { this.scale = scale; }

  /** Retires everything and rewinds the clock, so it can't drift into low float precision over a long session. */
  clear(): void {
    this.glow.clear();
    this.smoke.clear();
    this.time = 0;
  }

  flush(): void {
    this.glow.flush(this.time, this.scale);
    this.smoke.flush(this.time, this.scale);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.glow.points, this.smoke.points);
    this.glow.dispose();
    this.smoke.dispose();
  }
}
