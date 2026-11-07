// Turns a running Battle into what the player sees: rigs, effects, hit-stop, slow-mo, numbers.
import * as THREE from 'three';
import { Battle, type BattleEvent, type Unit } from '../sim/battle';
import { audio } from '../audio';
import { BeastRig } from './beast';
import { PALETTE } from './fx';
import { ALL_LOOKS } from './looks2';
import type { Stage } from './stage';

export const TEAM_COLOR = ['#38b6ff', '#ff4a3d'] as const;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const ABILITY_COLOR: Record<string, string> = {
  charge: '#ffb066', howl: '#9fd4ff', spit: '#73ff4a', rage: '#ff3a3a', roar: '#ffd28a', deathRoll: '#ffb066', dive: '#ffe08a', sting: '#c88bff',
  slam: '#e2bc8a', pounce: '#ffcf8f', heal: '#59ff9b', quake: '#e2bc8a', frostQuake: '#9ae8ff', chain: '#a8d8ff', fireRain: '#ff8a2a',
  fireBreath: '#ff8a2a', frostBreath: '#9ae8ff', tailWhip: '#ffd28a', swarm: '#ffe08a',
  cloak: '#b8f0ff', midas: '#ffc53d', brood: '#ff70d0', chainDash: '#8fd8ff', shield: '#70ffd0', lance: '#a8ecff', phase: '#80e0ff', meteorStomp: '#ff8a2a', cosmicSong: '#c0a8ff',
};

interface UnitView {
  u: Unit;
  rig: BeastRig;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  aura: THREE.Mesh | null;
  gone: boolean;
  dustT: number;
  fxT: number;
  lastHp: number;
  trailT: number;
}

interface ProjView { kind: string; mesh: THREE.Mesh; tail: number; }

/** Instanced, camera-facing health bars: one draw call however many beasts are fighting. */
class HpBars {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: THREE.InstancedBufferAttribute;
  private info: THREE.InstancedBufferAttribute;

  constructor(private capacity: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.info.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.pos);
    this.geo.setAttribute('aInfo', this.info);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, fog: false,
      vertexShader: `
        attribute vec3 aPos; attribute vec4 aInfo; varying vec2 vU; varying vec4 vI;
        void main(){
          vU = uv; vI = aInfo;
          vec4 mv = modelViewMatrix*vec4(aPos,1.0);
          float d = max(1.0,-mv.z);
          float zoomK = clamp(d/34.0,0.55,1.5);
          float w = aInfo.z*zoomK; float h = 0.19*zoomK;
          mv.xy += position.xy*vec2(w,h);
          gl_Position = projectionMatrix*mv;
          if(aInfo.w<0.5) gl_Position = vec4(2.0,2.0,2.0,1.0);
        }`,
      fragmentShader: `
        varying vec2 vU; varying vec4 vI;
        void main(){
          vec3 team = vI.y<0.5 ? vec3(0.02,0.5,1.0) : vec3(1.0,0.07,0.03);
          vec2 e = abs(vU-0.5)*2.0;
          float border = step(0.965,e.x)+step(0.7,e.y);
          vec3 col = vU.x<vI.x ? team*1.7 : vec3(0.02,0.02,0.03);
          if(vU.x<vI.x) col *= 0.75+0.5*vU.y;
          if(border>0.0) col = vec3(0.0);
          gl_FragColor = vec4(col,0.92);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  write(i: number, x: number, y: number, z: number, hp: number, team: number, width: number): void {
    if (i >= this.capacity) return;
    this.pos.setXYZ(i, x, y, z);
    this.info.setXYZW(i, hp, team, width, 1);
  }

  commit(n: number): void {
    this.geo.instanceCount = Math.min(n, this.capacity);
    this.pos.needsUpdate = true;
    this.info.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Crisp floating combat text. */
class FloatText {
  private pool: { el: HTMLDivElement; x: number; y: number; z: number; t: number; dur: number; vy: number; drift: number; active: boolean }[] = [];
  private v = new THREE.Vector3();

  constructor(private layer: HTMLElement, count: number) {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'float';
      el.style.display = 'none';
      layer.appendChild(el);
      this.pool.push({ el, x: 0, y: 0, z: 0, t: 0, dur: 1, vy: 2, drift: 0, active: false });
    }
  }

  spawn(x: number, y: number, z: number, text: string, cls: string, dur = 0.9, vy = 2.6): void {
    const it = this.pool.find((p) => !p.active);
    if (!it) return;
    it.active = true;
    it.x = x; it.y = y; it.z = z; it.t = 0; it.dur = dur; it.vy = vy; it.drift = rand(-0.6, 0.6);
    it.el.textContent = text;
    it.el.className = `float ${cls}`;
    it.el.style.display = 'block';
  }

  update(dt: number, camera: THREE.Camera): void {
    const W = innerWidth;
    const H = innerHeight;
    for (const it of this.pool) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) { it.active = false; it.el.style.display = 'none'; continue; }
      it.y += it.vy * dt * (1 - k * 0.7);
      it.x += it.drift * dt;
      this.v.set(it.x, it.y, it.z).project(camera);
      if (this.v.z > 1) { it.el.style.opacity = '0'; continue; }
      const sx = (this.v.x * 0.5 + 0.5) * W;
      const sy = (-this.v.y * 0.5 + 0.5) * H;
      const pop = k < 0.16 ? 0.6 + (k / 0.16) * 0.75 : 1.35 - Math.min(0.35, (k - 0.16) * 1.6);
      it.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${pop.toFixed(3)})`;
      it.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
  }

  clear(): void {
    for (const it of this.pool) { it.active = false; it.el.style.display = 'none'; }
  }

  dispose(): void {
    this.layer.innerHTML = '';
  }
}

export class BattleView {
  readonly units = new Map<number, UnitView>();
  private projs = new Map<number, ProjView>();
  private bars = new HpBars(128);
  private ringGeo = new THREE.RingGeometry(0.82, 1, 32);
  private ringMats: THREE.MeshBasicMaterial[];
  private auraGeo = new THREE.PlaneGeometry(2, 2);
  private auraMats = new Map<string, THREE.ShaderMaterial>();
  private projGeo = new THREE.SphereGeometry(0.2, 10, 8);
  private shadowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vU; void main(){ float r=length(vU-0.5)*2.0; gl_FragColor=vec4(0.02,0.015,0.01,smoothstep(1.0,0.15,r)*0.62); }`,
  });
  private killTimes: number[] = [];
  private lastHitStop = 0;
  private lastCallout = 0;
  private firstBlood = false;
  private cinematicT = 0;
  /** Big announcements for the HUD: the first knockout and knockout streaks. */
  onShout: ((text: string, tier: number) => void) | null = null;
  private projMats: Record<string, THREE.MeshBasicMaterial>;
  private text: FloatText;
  private tmp = new THREE.Vector3();
  private lastHitNumber = 0;
  private cellT = 0;
  speed = 1;
  paused = false;
  running = false;
  private hitStop = 0;
  private slowT = 0;
  private slowDur = 0;
  private slowFactor = 1;
  onKill: ((victim: Unit, by: Unit | null) => void) | null = null;
  /** Called on a beast's death so UI can react; final kill triggers the finish. */
  finishT = -1;

  constructor(readonly battle: Battle, readonly stage: Stage, textLayer: HTMLElement) {
    this.text = new FloatText(textLayer, 56);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.auraGeo.rotateX(-Math.PI / 2);
    this.ringMats = TEAM_COLOR.map((c) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(c).multiplyScalar(1.3), transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    }));
    const pm = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false, fog: false });
    this.projMats = { venom: pm(1.2, 5, 0.9), bolt: pm(3.2, 5.5, 9), flame: pm(9, 3.8, 0.8), ice: pm(2.8, 6.4, 8) };
    stage.scene.add(this.bars.mesh);
    for (const u of battle.units) this.addUnit(u);
  }

  private auraMaterial(color: string): THREE.ShaderMaterial {
    let m = this.auraMats.get(color);
    if (m) return m;
    m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uCol: { value: new THREE.Color(color) }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU; uniform vec3 uCol; uniform float uTime;
        void main(){
          vec2 p=(vU-0.5)*2.0; float r=length(p); float a=atan(p.y,p.x);
          float rim=smoothstep(0.86,0.94,r)*smoothstep(1.0,0.95,r);
          float rays=0.55+0.45*sin(a*9.0+uTime*2.4);
          float rune=smoothstep(0.7,0.95,sin(a*18.0-uTime*1.3))*smoothstep(0.72,0.75,r)*smoothstep(0.83,0.8,r);
          gl_FragColor=vec4(uCol*1.3,(rim*rays*0.6+rune*0.6));
        }`,
    });
    this.auraMats.set(color, m);
    return m;
  }

  private addUnit(u: Unit): UnitView {
    const rig = new BeastRig(u.sp.id, u.evo, TEAM_COLOR[u.team]);
    rig.setScale(u.scale);
    rig.root.position.set(u.x, u.y, u.z);
    rig.root.rotation.y = u.heading;
    this.stage.scene.add(rig.root);
    const shadow = new THREE.Mesh(this.auraGeo, this.shadowMat);
    shadow.scale.setScalar(u.radius * 1.5);
    shadow.position.set(u.x, 0.1, u.z);
    shadow.renderOrder = 1;
    this.stage.scene.add(shadow);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMats[u.team]);
    ring.scale.setScalar(u.radius * 1.2);
    ring.position.set(u.x, 0.11, u.z);
    ring.renderOrder = 2;
    this.stage.scene.add(ring);
    let aura: THREE.Mesh | null = null;
    const colors = ['', '', '#c58bff', '#ffc94d'];
    if (u.evo >= 2 || u.boss) {
      aura = new THREE.Mesh(this.auraGeo, this.auraMaterial(u.boss ? '#ff3a3a' : colors[u.evo]));
      aura.scale.setScalar(u.radius * (u.boss ? 1.95 : 1.6));
      aura.position.set(u.x, 0.13, u.z);
      aura.renderOrder = 2;
      this.stage.scene.add(aura);
    }
    const v: UnitView = { u, rig, ring, shadow, aura, gone: false, dustT: 0, fxT: Math.random(), lastHp: u.hp, trailT: 0 };
    this.units.set(u.id, v);
    return v;
  }

  rigOf(id: number): BeastRig | undefined { return this.units.get(id)?.rig; }

  /** Sets the camera to frame the entire field. */
  actionPoint(out: THREE.Vector3): { spread: number } {
    let n = 0;
    let size = 0;
    out.set(0, 0, 0);
    for (const v of this.units.values()) {
      if (v.u.dead) continue;
      out.x += v.u.x;
      out.z += v.u.z;
      size += v.u.radius;
      n++;
    }
    this.stage.cam.crowd = n;
    if (n) {
      out.x /= n;
      out.z /= n;
      this.stage.cam.subjectSize = size / n;
    }
    out.y = 1.2;
    let spread = 0;
    for (const v of this.units.values()) {
      if (v.u.dead) continue;
      spread = Math.max(spread, Math.hypot(v.u.x - out.x, v.u.z - out.z));
    }
    return { spread };
  }

  /** Nearest beast to a screen position, or null. */
  pick(screenX: number, screenY: number): Unit | null {
    const cam = this.stage.cam.camera;
    let best: Unit | null = null;
    let bestD = 62;
    for (const v of this.units.values()) {
      if (v.u.dead) continue;
      this.tmp.set(v.u.x, v.u.y + v.rig.height * v.u.scale * 0.5, v.u.z).project(cam);
      if (this.tmp.z > 1) continue;
      const sx = (this.tmp.x * 0.5 + 0.5) * innerWidth;
      const sy = (-this.tmp.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - screenX, sy - screenY);
      if (d < bestD) { bestD = d; best = v.u; }
    }
    return best;
  }

  private triggerSlow(factor: number, dur: number): void {
    this.slowFactor = factor;
    this.slowDur = dur;
    this.slowT = dur;
  }

  /** A frozen beat sells a heavy hit, but in a big brawl they'd stack into slow motion, so they're rationed. */
  private addHitStop(t: number): void {
    const now = performance.now();
    if (now - this.lastHitStop < 550) return;
    this.lastHitStop = now;
    this.hitStop = Math.max(this.hitStop, t);
  }

  update(realDt: number): void {
    const { stage, battle } = this;
    let k = this.paused ? 0 : this.speed;
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      k *= 0.05;
    }
    if (this.slowT > 0) {
      this.slowT -= realDt;
      const p = this.slowT / this.slowDur;
      const ease = p > 0.15 ? 1 : p / 0.15;
      k *= this.slowFactor + (1 - this.slowFactor) * (1 - ease);
    }
    const dt = Math.min(realDt, 1 / 24) * k;

    if (this.running && dt > 0) {
      const steps = Math.ceil(dt / (1 / 60));
      for (let i = 0; i < steps; i++) battle.step(dt / steps);
    }
    for (const e of battle.drainEvents()) this.handle(e);

    let barCount = 0;
    const fx = stage.fx;
    for (const v of this.units.values()) {
      const { u, rig } = v;
      if (v.gone) continue;

      rig.root.position.set(u.x, u.y, u.z);
      if (!u.dead) rig.root.rotation.y = u.heading;
      rig.update(u, realDt, dt);
      v.ring.position.set(u.x, 0.11, u.z);
      // The contact shadow shrinks and fades as a beast leaves the ground.
      const lift = 1 / (1 + u.y * 0.45);
      v.shadow.position.set(u.x, 0.1, u.z);
      v.shadow.scale.setScalar(u.radius * 1.5 * (0.45 + lift * 0.55));
      if (u.dead && u.deathT > 1.2) v.shadow.visible = false;
      if (v.aura) {
        v.aura.position.set(u.x, 0.13, u.z);
        v.aura.visible = !u.dead;
      }
      v.ring.visible = !u.dead;

      if (!u.dead) {
        const top = u.y + rig.height * u.scale + 0.45;
        const width = Math.min(3.2, 0.9 + u.radius * 0.65) * (u.boss ? 1.3 : 1);
        this.bars.write(barCount++, u.x, top, u.z, u.hp / u.maxHp, u.team, width);
        this.unitAmbience(v, dt);
      } else if (u.action !== 'ash') {
        // Embers rise as the body dissolves.
        if (u.deathT > 1.1 && dt > 0 && Math.random() < 0.8) {
          for (let i = 0; i < 2; i++) fx.emberRise(u.x, u.y + rand(0.2, 1) * u.scale, u.z, u.radius * 0.9);
        }
        if (u.deathT > 2.6) {
          this.removeUnit(v);
        }
      } else {
        rig.root.visible = false;
        v.fxT -= dt;
        if (v.fxT <= 0) {
          v.fxT = 0.04;
          fx.emberRise(u.x, 0.4, u.z, 1.2);
          fx.particles.add({
            x: u.x + rand(-0.5, 0.5), y: 0.3, z: u.z + rand(-0.5, 0.5), vy: rand(2, 5), life: 0.5, size: rand(0.5, 1.4), endSize: 0.1,
            r: PALETTE.fire[0], g: PALETTE.fire[1], b: PALETTE.fire[2],
          });
        }
      }
    }
    this.bars.commit(barCount);

    for (const p of battle.projectiles) {
      const pv = this.projs.get(p.id);
      if (!pv || !p.alive) continue;
      pv.mesh.position.set(p.x, p.y, p.z);
      pv.tail -= dt;
      if (pv.tail <= 0 && dt > 0) {
        pv.tail = 0.016;
        const c = p.kind === 'venom' ? PALETTE.venom : p.kind === 'bolt' ? PALETTE.shock : p.kind === 'flame' ? PALETTE.fire : PALETTE.ice;
        fx.particles.add({
          x: p.x + rand(-0.08, 0.08), y: p.y + rand(-0.08, 0.08), z: p.z + rand(-0.08, 0.08),
          life: rand(0.2, 0.4), size: rand(0.26, 0.5), endSize: 0.04, r: c[0], g: c[1], b: c[2],
        });
      }
    }

    this.cinematicT = Math.max(0, this.cinematicT - realDt);
    this.cellT += dt;
    for (const m of this.auraMats.values()) m.uniforms.uTime.value = this.cellT;

    this.text.update(this.paused ? 0 : realDt, stage.cam.camera);
    fx.update(dt, realDt);
    audio.setIntensity(1 - Math.min(battle.teamHealth(0), battle.teamHealth(1)));
  }

  private unitAmbience(v: UnitView, dt: number): void {
    if (dt <= 0) return;
    const { u, rig } = v;
    const fx = this.stage.fx;
    const moving = Math.hypot(u.mx, u.mz);
    const h = rig.height * u.scale;

    // A beast sent sliding ploughs up the ground as it goes.
    const slide = Math.hypot(u.vx, u.vz);
    if (!u.flying && slide > 4 && u.y < 0.15) {
      fx.dust(u.x, u.z, 1 + Math.round(u.radius), 0.35 + u.radius * 0.2, 0.32 + u.radius * 0.5, 0.65);
    }
    // Kicked-up dust scaled to the beast's weight.
    if (!u.flying && moving > 1.4 && u.y < 0.1) {
      v.dustT -= dt * (moving / u.speed + 0.2);
      if (v.dustT <= 0) {
        v.dustT = 0.17;
        const sz = 0.26 + u.radius * 0.46;
        fx.dust(u.x - Math.sin(u.heading) * u.radius * 0.5, u.z - Math.cos(u.heading) * u.radius * 0.5, 1 + Math.round(u.radius), 0.42 + u.radius * 0.2, sz, 0.75);
      }
    }
    if (u.action === 'charge') {
      v.trailT -= dt;
      if (v.trailT <= 0) {
        v.trailT = 0.03;
        fx.dust(u.x, u.z, 2, 0.9, 1.1 + u.radius * 0.6, 0.9);
        const c = PALETTE.spark;
        fx.particles.add({
          x: u.x + rand(-0.4, 0.4) * u.radius, y: rand(0.3, h * 0.7), z: u.z + rand(-0.4, 0.4) * u.radius,
          vx: -Math.sin(u.heading) * 7, vz: -Math.cos(u.heading) * 7, life: 0.35, size: 0.22, endSize: 0.03, r: c[0], g: c[1], b: c[2],
        });
      }
    }
    if (u.action === 'leap') {
      const c = PALETTE.white;
      fx.particles.add({
        x: u.x + rand(-0.4, 0.4) * u.radius, y: u.y + h * 0.5, z: u.z + rand(-0.4, 0.4) * u.radius,
        life: 0.3, size: 0.42, endSize: 0.03, r: c[0] * 0.8, g: c[1] * 0.8, b: c[2],
      });
    }

    v.fxT -= dt;
    if (v.fxT > 0) return;
    v.fxT = 0.06;
    const p = fx.particles;
    const x = u.x + rand(-1, 1) * u.radius * 0.8;
    const z = u.z + rand(-1, 1) * u.radius * 0.8;
    const y = u.y + rand(0.2, 1) * h * 0.9;
    if (u.burn > 0) {
      const c = Math.random() < 0.5 ? PALETTE.fire : PALETTE.fireHot;
      p.add({ x, y, z, vy: rand(1.5, 3.8), life: rand(0.3, 0.6), size: 0.2 + u.radius * 0.36, endSize: 0.05, r: c[0], g: c[1], b: c[2] });
    }
    if (u.poison > 0 && Math.random() < 0.7) {
      const c = PALETTE.venom;
      p.add({ x, y, z, vy: rand(0.7, 1.8), life: rand(0.5, 0.9), size: 0.12 + u.radius * 0.11, endSize: 0.32, r: c[0], g: c[1], b: c[2], a: 0.8 });
    }
    if (u.frozen > 0 || (u.slow > 0 && Math.random() < 0.45)) {
      const c = PALETTE.iceHot;
      p.add({ x, y, z, vy: -0.25, life: 0.7, size: 0.11, endSize: 0.03, r: c[0], g: c[1], b: c[2] });
    }
    if (u.rage > 0) {
      const c = PALETTE.rage;
      p.add({ x, y, z, vy: rand(1.8, 3.8), life: 0.45, size: 0.14 + u.radius * 0.2, endSize: 0.03, r: c[0], g: c[1], b: c[2] });
    }
    if (u.buff > 0 && Math.random() < 0.4) {
      const c = PALETTE.gold;
      p.add({ x, y: u.y + 0.12, z, vy: rand(1.5, 2.6), life: 0.7, size: 0.1, endSize: 0.02, r: c[0], g: c[1], b: c[2] });
    }
    if (u.stun > 0 && Math.random() < 0.8) {
      const a = this.cellT * 7 + u.id;
      const c = PALETTE.goldHot;
      p.add({ x: u.x + Math.cos(a) * u.radius * 0.55, y: u.y + h + 0.1, z: u.z + Math.sin(a) * u.radius * 0.55, life: 0.22, size: 0.16, endSize: 0.02, r: c[0], g: c[1], b: c[2] });
    }
    // Species signature.
    if (u.sp.id === 'phoenix') {
      for (let i = 0; i < 3; i++) {
        const c = Math.random() < 0.5 ? PALETTE.fire : PALETTE.fireHot;
        p.add({ x: u.x + rand(-1, 1) * 1.1, y: u.y + rand(-0.3, 0.6), z: u.z + rand(-1, 1) * 1.1, vy: rand(-1.4, 1), life: rand(0.35, 0.7), size: rand(0.3, 0.7), endSize: 0.05, r: c[0], g: c[1], b: c[2] });
      }
    } else if (u.sp.id === 'roc' && Math.random() < 0.28) {
      const c = PALETTE.shockHot;
      fx.bolt([u.x + rand(-2, 2), u.y + rand(0, 1), u.z + rand(-2, 2)], [u.x + rand(-2, 2), u.y + rand(-1, 1), u.z + rand(-2, 2)], 0.04, 0.08);
      p.add({ x, y, z, life: 0.16, size: 0.3, endSize: 0.05, r: c[0], g: c[1], b: c[2] });
    } else if (u.sp.id === 'dragon' && Math.random() < 0.45) {
      fx.smoke(u.x, u.y + 1, u.z, 1, 1, 1.1, 0.07);
      fx.emberRise(u.x, u.y + 0.5, u.z, 1.6);
    } else if ((u.sp.id === 'wyrm' || u.sp.id === 'mammoth') && Math.random() < 0.6) {
      const c = PALETTE.iceHot;
      p.add({ x, y, z, vy: rand(-0.8, 0.4), life: 0.9, size: 0.1, endSize: 0.03, r: c[0], g: c[1], b: c[2] });
    } else if (u.sp.id === 'stag' && Math.random() < 0.6) {
      const c = PALETTE.heal;
      p.add({ x: u.x + rand(-0.5, 0.5), y: u.y + h * rand(0.8, 1.15), z: u.z + rand(-0.5, 0.5), vy: 0.7, life: 0.8, size: 0.09, endSize: 0.02, r: c[0], g: c[1], b: c[2] });
    } else if (u.sp.id === 'scorpion' && Math.random() < 0.3) {
      const c = PALETTE.venom;
      p.add({ x, y, z, vy: 0.5, life: 0.5, size: 0.07, endSize: 0.02, r: c[0] * 0.7, g: c[1] * 0.2, b: c[2] * 1.6 });
    }
    // Legends leak golden light; Elites leak violet.
    if (u.evo === 3 && Math.random() < 0.65) {
      const c = PALETTE.gold;
      p.add({ x, y: u.y + 0.2, z, vy: rand(1, 2.6), life: 0.9, size: 0.1, endSize: 0.02, r: c[0], g: c[1], b: c[2] });
    } else if (u.evo === 2 && Math.random() < 0.3) {
      p.add({ x, y: u.y + 0.2, z, vy: rand(0.8, 1.9), life: 0.8, size: 0.08, endSize: 0.02, r: 2.0, g: 1.1, b: 3.4 });
    }
  }

  private removeUnit(v: UnitView): void {
    v.gone = true;
    this.stage.scene.remove(v.rig.root);
    this.stage.scene.remove(v.ring);
    this.stage.scene.remove(v.shadow);
    if (v.aura) this.stage.scene.remove(v.aura);
    v.rig.dispose();
  }

  // ── Event → spectacle ───────────────────────────────────
  private handle(e: BattleEvent): void {
    const { fx, cam, post } = this.stage;
    switch (e.t) {
      case 'hit': {
        const v = this.units.get(e.tgt.id);
        const sizeK = Math.min(2, 0.55 + e.dmg / Math.max(40, e.tgt.maxHp) * 2.4);
        fx.impact(e.x, e.y, e.z, e.kind, sizeK, e.crit);
        if (e.kind !== 'dot') {
          // Flinch away from where the blow came from, in the victim's own frame.
          const hx = e.src ? e.tgt.x - e.src.x : 0;
          const hz = e.src ? e.tgt.z - e.src.z : 1;
          const len = Math.hypot(hx, hz) || 1;
          const s = Math.sin(e.tgt.heading);
          const c = Math.cos(e.tgt.heading);
          v?.rig.hit(e.big ? 1.4 : 0.75, (hx * c - hz * s) / len, (hx * s + hz * c) / len);
          audio.hit(e.kind, Math.min(1.5, sizeK), e.crit);
          // Anything sent flying gets the slide whistle.
          if (e.big && !e.tgt.flying && e.tgt.vy > 5) audio.launch();
          const r = e.tgt.radius;
          // Every connecting blow sprays a little of the victim's coat, and heavy ones burst.
          fx.tufts(e.x, e.y, e.z, e.big ? 12 : 4, ALL_LOOKS[e.tgt.sp.id]?.top ?? '#888888', 0.09 + r * 0.12);
          if (e.src && !e.src.ranged) {
            const col = e.kind === 'venom' ? '#73ff4a' : e.kind === 'fire' ? '#ff8a2a' : e.kind === 'ice' ? '#9ae8ff' : '#fff0c8';
            fx.star(e.x, e.y, e.z, (e.big ? 0.9 : 0.45) + r * (e.big ? 0.7 : 0.35), col, e.big ? 0.26 : 0.16);
          }
        }
        if (e.big) {
          cam.shake(e.finisher ? 0.42 : 0.26);
          cam.punch(e.finisher ? 1.8 : 1.2);
          cam.noteAction(e.x, e.z, 0.45);
          this.addHitStop(e.finisher ? 0.075 : e.crit ? 0.06 : 0.035);
          if (e.finisher) {
            fx.ring(e.tgt.x, e.tgt.z, 2 + e.tgt.radius * 1.6, '#fff0c8', 0.32, 0.18, 0.14, 2);
            fx.dust(e.tgt.x, e.tgt.z, 6, 1 + e.tgt.radius, 0.6 + e.tgt.radius * 0.5, 0.8);
          }
        }
        this.damageNumber(e);
        break;
      }
      case 'swing': {
        const r = this.units.get(e.u.id)?.rig;
        // Coil down before the spring.
        r?.kick(-1.6);
        if (Math.random() < 0.3) this.voice(e.u, false);
        break;
      }
      case 'lunge': {
        const u = e.u;
        const r = this.units.get(u.id);
        r?.rig.kick(1.8);
        audio.whoosh();
        const fxH = Math.sin(u.heading);
        const fzH = Math.cos(u.heading);
        const h = (r?.rig.height ?? 1) * u.scale;
        fx.streaks(u.x, u.y + h * 0.5, u.z, fxH, fzH, 0.4 + u.radius * 0.5, u.team === 0 ? '#bfe7ff' : '#ffd6c4');
        if (!u.flying) fx.dust(u.x - fxH * u.radius * 0.6, u.z - fzH * u.radius * 0.6, 3 + Math.round(u.radius), 0.6 + u.radius * 0.35, 0.4 + u.radius * 0.5, 0.7);
        // Claws leave three parallel slashes; everything else one big arc.
        const reach = u.radius + u.range * 0.55;
        const ax = u.x + fxH * reach;
        const az = u.z + fzH * reach;
        const ay = u.y + Math.max(0.4, h * 0.55);
        const col = u.team === 0 ? '#d4f0ff' : '#ffe0d0';
        const size = 1 + u.radius * 1.3;
        if (u.sp.hit === 'claw') {
          const tilt = e.combo === 0 ? -0.6 : e.combo === 1 ? 0.6 : 1.1;
          for (const off of [-0.22, 0, 0.22]) fx.arc(ax, ay + off * size, az, u.heading, size, col, tilt);
        } else {
          fx.arc(ax, ay, az, u.heading, size * (e.combo === 2 ? 1.25 : 1), col, e.combo === 2 ? 1.2 : Math.random() - 0.5);
        }
        break;
      }
      case 'clash': {
        const r = Math.max(e.a.radius, e.b.radius);
        fx.star(e.x, e.y, e.z, 1.6 + r * 1.1, '#ffe9a8', 0.36);
        fx.sparks(e.x, e.y, e.z, 34, PALETTE.spark, 15, 0.7, 0.2, 16);
        fx.ring(e.x, e.z, 4 + r * 2, '#ffe9a8', 0.5, 0.14, 0.15, 2.6);
        fx.dust(e.x, e.z, 14, 2 + r, 1 + r * 0.6, 1);
        fx.flash(e.x, e.y + 0.5, e.z, '#ffd890', 42, 0.24, 18);
        cam.shake(0.45);
        cam.punch(2.5);
        cam.noteAction(e.x, e.z, 0.7);
        post.kickAberration(0.2);
        this.addHitStop(0.11);
        audio.clash();
        this.units.get(e.a.id)?.rig.kick(-3);
        this.units.get(e.b.id)?.rig.kick(-3);
        this.text.spawn(e.x, e.y + 1.5 + r, e.z, 'CLASH!', 'callout gold', 0.9, 1.7);
        break;
      }
      case 'bump': {
        const r = e.b.radius;
        fx.star(e.x, 0.4 + r, e.z, 0.6 + r * 0.5, '#fff0c8', 0.18);
        fx.dust(e.x, e.z, 7, 1.4, 0.9 + r * 0.4, 0.8);
        audio.bump(Math.min(1.3, e.force / 12));
        this.units.get(e.b.id)?.rig.hit(1.1);
        break;
      }
      case 'absorb': {
        const v = this.units.get(e.u.id);
        const h = (v?.rig.height ?? 1) * e.u.scale;
        fx.star(e.u.x, e.u.y + h * 0.55, e.u.z, 0.7 + e.u.radius * 0.8, '#70ffd0', 0.2);
        audio.bump(0.5);
        break;
      }
      case 'expire': {
        // A summon's time ran out: a soft puff, not a knockout.
        fx.dust(e.u.x, e.u.z, 5, 0.8, 0.5, 0.5);
        audio.pop();
        break;
      }
      case 'spawned': {
        this.addUnit(e.u);
        fx.dust(e.u.x, e.u.z, 8, 1.2, 0.8, 0.7);
        fx.ring(e.u.x, e.u.z, 1.8, TEAM_COLOR[e.u.team], 0.35, 0.2, 0.14, 2.6);
        this.units.get(e.u.id)?.rig.kick(3);
        break;
      }
      case 'ability': this.abilityTell(e.u, e.id); break;
      case 'abilityFire': this.abilityFire(e.u, e.id, e.x, e.z); break;
      case 'shot': {
        const mat = this.projMats[e.p.kind];
        const mesh = new THREE.Mesh(this.projGeo, mat);
        mesh.scale.setScalar(e.p.kind === 'flame' || e.p.kind === 'ice' ? 1.5 : e.p.kind === 'venom' ? 0.8 : 1.15);
        mesh.position.set(e.p.x, e.p.y, e.p.z);
        this.stage.scene.add(mesh);
        this.projs.set(e.p.id, { kind: e.p.kind, mesh, tail: 0 });
        if (e.p.kind === 'venom') audio.spit();
        else if (e.p.kind === 'bolt') audio.zap();
        else if (e.p.kind === 'flame') audio.fire();
        else audio.ice();
        break;
      }
      case 'shotEnd': {
        const pv = this.projs.get(e.p.id);
        if (pv) {
          this.stage.scene.remove(pv.mesh);
          this.projs.delete(e.p.id);
        }
        const kind = e.p.kind === 'venom' ? 'venom' : e.p.kind === 'bolt' ? 'shock' : e.p.kind === 'flame' ? 'fire' : 'ice';
        fx.impact(e.x, Math.max(0.2, e.y), e.z, kind, 0.7, false);
        break;
      }
      case 'heal': {
        const v = this.units.get(e.u.id);
        const h = (v?.rig.height ?? 1) * e.u.scale;
        fx.healBurst(e.u.x, e.u.y + 0.2, e.u.z, h);
        this.text.spawn(e.u.x, e.u.y + h + 0.6, e.u.z, `+${Math.round(e.amount)}`, 'heal');
        audio.heal();
        break;
      }
      case 'land': {
        const r = e.u.radius;
        fx.dust(e.u.x, e.u.z, Math.round(5 + r * 6 * e.force), 0.8 + r, 0.9 + r * 0.7, 1);
        fx.ring(e.u.x, e.u.z, 1 + r * 1.4, '#ffffff', 0.34, 0.1, 0.14, 0.8);
        this.units.get(e.u.id)?.rig.kick(-5 * Math.min(1.6, e.force));
        if (e.u.mass > 300) cam.shake(0.08 * e.force);
        break;
      }
      case 'death': {
        const v = this.units.get(e.u.id);
        const h = (v?.rig.height ?? 1) * e.u.scale * 0.55;
        fx.deathBurst(e.u.x, e.u.y + h, e.u.z, e.u.radius, TEAM_COLOR[e.u.team]);
        fx.star(e.u.x, e.u.y + h, e.u.z, 1.3 + e.u.radius * 1.1, '#fff0c8', 0.3);
        fx.tufts(e.u.x, e.u.y + h, e.u.z, 18, ALL_LOOKS[e.u.sp.id]?.top ?? '#888888', 0.12 + e.u.radius * 0.14);
        audio.knockout(e.u.radius);
        cam.shake(0.3 + e.u.radius * 0.06);
        cam.punch(1.8);
        cam.noteAction(e.u.x, e.u.z, 0.8);
        if (!e.u.minion) this.scoreKill(e.u, e.by, e.last);
        this.onKill?.(e.u, e.by);
        if (e.u.team === 1 && e.by && e.by.team === 0) {
          fx.coinBurst(e.u.x, e.u.y + h, e.u.z, 8 + Math.round(e.u.radius * 6));
          audio.coin();
        }
        if (e.last) {
          this.triggerSlow(0.14, 1.9);
          this.tmp.set(e.u.x, 1 + e.u.y, e.u.z);
          cam.focus(this.tmp, Math.max(13, 9 + e.u.radius * 7), 2.2);
          cam.shake(0.45, true);
          post.kickAberration(0.5);
          post.flashScreen(0.26, '#ffffff');
          this.finishT = 0;
        } else if (e.u.boss) {
          this.triggerSlow(0.2, 1.1);
        }
        break;
      }
      case 'chain': {
        for (let i = 0; i < e.pts.length - 1; i++) {
          fx.bolt(e.pts[i], e.pts[i + 1], 0.22, 0.28);
          fx.bolt(e.pts[i], e.pts[i + 1], 0.09, 0.2);
          const p = e.pts[i + 1];
          fx.sparks(p[0], p[1], p[2], 12, PALETTE.shockHot, 9, 0.4, 0.13);
          fx.flash(p[0], p[1], p[2], '#a8d0ff', 22, 0.22, 14);
        }
        audio.thunder();
        cam.shake(0.14);
        break;
      }
      case 'breathTick': this.breathPuff(e.u, e.id, e.dx, e.dz, e.range); break;
      case 'incoming': {
        const col = e.kind === 'lightning' ? '#a8d8ff' : '#ff8a2a';
        fx.telegraph(e.x, e.z, e.radius, e.delay, col);
        if (e.kind === 'meteor') fx.meteor(e.x, e.z, e.delay);
        break;
      }
      case 'strike': {
        if (e.kind === 'meteor') {
          fx.explosion(e.x, e.z, e.radius, true);
          audio.explosion(1.2);
          this.addHitStop(0.09);
        } else if (e.kind === 'firerain') {
          fx.explosion(e.x, e.z, e.radius, false);
          audio.fire();
          audio.explosion(0.3);
        } else {
          fx.lightning(e.x, e.z, true);
          audio.thunder();
        }
        break;
      }
      case 'power': {
        if (e.kind === 'rally') {
          post.flashScreen(0.16, '#a8ffd0');
          audio.heal();
          for (const u of this.battle.alive(0)) {
            fx.beam(u.x, 0, u.z, u.radius * 0.9, 9, '#59ff9b', 0.9, 0.9);
            fx.ring(u.x, u.z, 2.2 + u.radius, '#59ff9b', 0.8, 0.14, 0.14, 2.6);
          }
        } else {
          audio.horn();
        }
        break;
      }
      case 'ashes': {
        fx.explosion(e.u.x, e.u.z, 3.6, false);
        audio.fire();
        this.text.spawn(e.u.x, 2.5, e.u.z, 'ASHES…', 'callout fire', 1.5, 1.1);
        break;
      }
      case 'rebirth': {
        const v = this.units.get(e.u.id);
        if (v) {
          v.rig.root.visible = true;
          v.shadow.visible = true;
        }
        fx.explosion(e.u.x, e.u.z, 7, true);
        fx.beam(e.u.x, 0, e.u.z, 4.2, 30, '#ff8a2a', 1.7, 3.4);
        fx.flash(e.u.x, 3, e.u.z, '#ffa040', 120, 0.8, 42);
        post.flashScreen(0.35, '#ffb066');
        audio.explosion(1);
        audio.magic();
        this.triggerSlow(0.25, 1.1);
        this.text.spawn(e.u.x, 6, e.u.z, 'REBORN!', 'callout fire', 1.9, 0.9);
        break;
      }
      case 'status': {
        if (e.s === 'gold') {
          const v = this.units.get(e.u.id);
          const h = (v?.rig.height ?? 1) * e.u.scale;
          fx.coinBurst(e.u.x, e.u.y + h, e.u.z, 26);
          fx.ring(e.u.x, e.u.z, 2 + e.u.radius * 1.5, '#ffc53d', 0.45, 0.18, 0.14, 3);
          this.text.spawn(e.u.x, e.u.y + h + 1, e.u.z, 'GOLD!', 'callout gold', 1, 1.2);
          audio.coin();
        } else if (e.s === 'shield') {
          fx.ring(e.u.x, e.u.z, 1.6 + e.u.radius * 1.3, '#70ffd0', 0.6, 0.18, 0.15, 2.6);
          fx.healBurst(e.u.x, e.u.y + 0.2, e.u.z, (this.units.get(e.u.id)?.rig.height ?? 1) * e.u.scale);
        } else if (e.s === 'freeze') {
          this.text.spawn(e.u.x, e.u.y + 2, e.u.z, 'FROZEN', 'status ice', 0.9, 1.6);
          audio.ice();
        } else if (e.s === 'rage') {
          fx.ring(e.u.x, e.u.z, 2 + e.u.radius, '#ff3a3a', 0.45, 0.2, 0.14, 2.6);
        }
        break;
      }
    }
  }

  /** First knockout, streaks and a moment of slow motion on the big takedowns. */
  private scoreKill(victim: Unit, by: Unit | null, last: boolean): void {
    const now = performance.now();
    if (!this.firstBlood) {
      this.firstBlood = true;
      this.onShout?.('FIRST KNOCKOUT!', 1);
    }
    if (victim.team === 1) {
      this.killTimes = this.killTimes.filter((t) => now - t < 3200);
      this.killTimes.push(now);
      const streak = this.killTimes.length;
      if (streak >= 2) this.onShout?.(['', '', 'DOUBLE KNOCKOUT!', 'TRIPLE KNOCKOUT!', 'UNSTOPPABLE!'][Math.min(4, streak)], streak);
      if (streak >= 2) audio.stinger(streak - 2);
    }
    // A big beast going down gets its own moment, spaced out so it never drags.
    if (!last && this.cinematicT <= 0 && (victim.radius > 1 || by?.sp.ability === 'pounce' || Math.random() < 0.25)) {
      this.cinematicT = 4.5;
      this.triggerSlow(0.28, 0.6);
      this.tmp.set(victim.x, victim.y + 1, victim.z);
      this.stage.cam.focus(this.tmp, Math.max(10, 6 + victim.radius * 5.5) * this.stage.cam.fitScale(), 1.0);
    }
  }

  /** Every animal has its own cartoon voice. */
  private voice(u: Unit, long: boolean): void {
    audio.voice(u.sp.id, u.sp.group, u.radius, long);
  }

  private damageNumber(e: Extract<BattleEvent, { t: 'hit' }>): void {
    const now = performance.now();
    // Numbers are throttled on small hits so the screen stays readable in a brawl.
    if (e.kind === 'dot') {
      if (Math.random() < 0.7) return;
      this.text.spawn(e.x, e.y, e.z, Math.round(e.dmg).toString(), 'dot', 0.75, 1.8);
      return;
    }
    if (!e.crit && !e.big && now - this.lastHitNumber < 25) return;
    this.lastHitNumber = now;
    const cls = e.crit ? 'crit' : e.tgt.team === 1 ? 'dealt' : 'taken';
    const label = e.crit ? `${Math.round(e.dmg)}!` : Math.round(e.dmg).toString();
    this.text.spawn(e.x, e.y + 0.3, e.z, label, cls, e.crit ? 1.05 : 0.78, e.crit ? 3.2 : 2.5);
  }

  private abilityTell(u: Unit, id: string): void {
    const { fx } = this.stage;
    const col = ABILITY_COLOR[id] ?? '#ffffff';
    const v = this.units.get(u.id);
    const h = (v?.rig.height ?? 1) * u.scale;
    // In a crowd these would pile into an unreadable stack, so they take turns. Big beasts always get theirs.
    const now = performance.now();
    if (u.radius >= 1.6 || now - this.lastCallout > 650) {
      this.lastCallout = now;
      this.text.spawn(u.x, u.y + h + 1, u.z, u.sp.abilityName.toUpperCase(), `callout team${u.team}`, 1.1, 1.3);
    }
    fx.ring(u.x, u.z, 1.5 + u.radius * 1.5, col, 0.5, 0.25, 0.14, 2.8);
    const c = new THREE.Color(col).multiplyScalar(3);
    // Energy gathering inward during the wind-up.
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.28;
      const d = rand(1.5, 3) + u.radius * 1.5;
      fx.particles.add({
        x: u.x + Math.cos(a) * d, y: u.y + rand(0.2, h), z: u.z + Math.sin(a) * d,
        vx: -Math.cos(a) * d * 2.4, vz: -Math.sin(a) * d * 2.4, drag: 1.2, life: 0.5, size: 0.2, endSize: 0.03, r: c.r, g: c.g, b: c.b,
      });
    }
    if (id === 'quake' || id === 'frostQuake' || id === 'slam' || id === 'fireBreath' || id === 'frostBreath') this.voice(u, false);
  }

  private abilityFire(u: Unit, id: string, x: number, z: number): void {
    const { fx, cam, post } = this.stage;
    const v = this.units.get(u.id);
    const h = (v?.rig.height ?? 1) * u.scale;
    switch (id) {
      case 'cloak':
      case 'phase':
        audio.magic();
        fx.ring(u.x, u.z, 2 + u.radius * 1.5, '#b8f0ff', 0.5, 0.16, 0.15, 2.6);
        fx.sparks(u.x, u.y + h * 0.5, u.z, 26, PALETTE.iceHot, 6, 0.6, 0.14, 2);
        break;
      case 'shield':
        audio.magic();
        fx.ring(u.x, u.z, 15, '#70ffd0', 0.9, 0.06, 0.16, 2.4);
        fx.beam(u.x, 0, u.z, u.radius * 1.1, 14, '#70ffd0', 1.1, 1.3);
        break;
      case 'brood':
        this.voice(u, true);
        fx.ring(u.x, u.z, 4 + u.radius * 2, '#ff70d0', 0.6, 0.14, 0.15, 2.6);
        break;
      case 'lance':
        this.voice(u, false);
        audio.ice();
        audio.charge();
        break;
      case 'chainDash':
        audio.thunder();
        fx.ring(u.x, u.z, 2 + u.radius, '#8fd8ff', 0.3, 0.2, 0.15, 3);
        break;
      case 'midas':
        audio.magic();
        break;
      case 'meteorStomp':
        audio.quake();
        this.voice(u, true);
        fx.slam(u.x, u.z, 6, '#ff8a2a', '#ff7a30');
        break;
      case 'cosmicSong': {
        this.voice(u, true);
        audio.magic();
        audio.heal();
        fx.ring(u.x, u.z, 30, '#c0a8ff', 1.4, 0.04, 0.18, 2.4);
        fx.ring(u.x, u.z, 20, '#ffffff', 1.1, 0.05, 0.18, 1.6);
        fx.flash(u.x, u.y + 2, u.z, '#a8a0ff', 70, 0.8, 60);
        post.flashScreen(0.14, '#c0b0ff');
        for (const o of this.battle.alive(u.team)) fx.beam(o.x, 0, o.z, o.radius * 0.9, 8, '#c0a8ff', 1, 1.2);
        break;
      }
      case 'tailWhip': {
        const r = 4.5 * u.scale + u.radius;
        this.voice(u, false);
        audio.whoosh();
        fx.ring(u.x, u.z, r, '#ffe0a8', 0.4, 0.2, 0.2, 2.4);
        for (let i = 0; i < 4; i++) fx.arc(u.x, 0.6 + u.radius * 0.5, u.z, u.heading + (i * Math.PI) / 2, r * 0.82, '#fff0c8', 0);
        fx.dust(u.x, u.z, 16, r * 0.7, 1.1 + u.radius * 0.4, 0.9);
        cam.shake(0.16);
        cam.noteAction(u.x, u.z, 0.5);
        break;
      }
      case 'swarm':
        this.voice(u, true);
        break;
      case 'charge':
        this.voice(u, false);
        audio.charge();
        fx.dust(u.x, u.z, 16, 1 + u.radius, 1 + u.radius * 0.8, 1.1);
        break;
      case 'roar': {
        const r = 9 * u.scale;
        this.voice(u, true);
        fx.ring(u.x, u.z, r, '#ffd28a', 0.8, 0.09, 0.18, 2.2);
        fx.ring(u.x, u.z, r * 0.72, '#ffffff', 0.62, 0.09, 0.18, 1.6);
        fx.ring(u.x, u.z, r * 0.45, '#ffd28a', 0.45, 0.11, 0.18, 2);
        this.tmp.set(u.x, u.y + h * 0.7, u.z).project(cam.camera);
        if (this.tmp.z < 1) post.shock(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5, 1.1, 0.8, 0.55);
        cam.shake(0.22);
        post.kickAberration(0.2);
        fx.dust(u.x, u.z, 14, r * 0.5, 1.5, 1.1);
        break;
      }
      case 'howl':
        this.voice(u, true);
        fx.ring(u.x, u.z, 11, '#9fd4ff', 0.95, 0.06, 0.18, 2.2);
        fx.ring(u.x, u.z, 7, '#ffffff', 0.7, 0.07, 0.18, 1.3);
        for (const o of this.battle.alive(u.team)) {
          if (Math.hypot(o.x - u.x, o.z - u.z) < 11) fx.ring(o.x, o.z, 1.3 + o.radius, '#ffc94d', 0.45, 0.2, 0.14, 2.8);
        }
        break;
      case 'rage':
        this.voice(u, true);
        fx.sparks(u.x, u.y + h * 0.5, u.z, 36, PALETTE.rage, 9, 0.7, 0.2, 8);
        fx.beam(u.x, 0, u.z, u.radius * 1.3, 9, '#ff3a3a', 0.65, 2.8);
        break;
      case 'slam':
        audio.quake();
        fx.slam(u.x + Math.sin(u.heading) * u.radius, u.z + Math.cos(u.heading) * u.radius, 5.5 * u.scale, '#e2bc8a', '#ff8a4a');
        break;
      case 'quake':
        audio.quake();
        fx.slam(u.x, u.z, 8 * u.scale, '#ffd28a', '#ff7a30');
        break;
      case 'frostQuake':
        audio.quake();
        audio.ice();
        fx.slam(u.x, u.z, 8.5 * u.scale, '#9ae8ff', '#7fe0ff');
        fx.sparks(u.x, 0.6, u.z, 80, PALETTE.iceHot, 15, 1.1, 0.22, 11);
        break;
      case 'heal':
        audio.heal();
        fx.ring(u.x, u.z, 13, '#59ff9b', 1.05, 0.07, 0.16, 2.4);
        fx.beam(u.x, 0, u.z, u.radius * 1.1, 14, '#59ff9b', 1.1, 1.3);
        fx.flash(u.x, 3, u.z, '#59ff9b', 28, 0.65, 20);
        for (const o of this.battle.alive(u.team)) {
          if (Math.hypot(o.x - u.x, o.z - u.z) < 13) fx.beam(o.x, 0, o.z, o.radius * 0.85, 6, '#7dffb4', 0.8, 0.9);
        }
        break;
      case 'chain':
        audio.thunder();
        break;
      case 'fireRain':
        this.voice(u, true);
        fx.flash(u.x, u.y, u.z, '#ff8a2a', 60, 0.45, 24);
        break;
      case 'deathRoll':
        this.voice(u, false);
        fx.dust(x, z, 18, 2, 1.4, 1);
        cam.shake(0.12);
        break;
      case 'dive':
      case 'pounce':
        this.voice(u, false);
        audio.jump();
        break;
      case 'sting':
        audio.spit();
        fx.sparks(x, 0.9, z, 22, PALETTE.venom, 7, 0.8, 0.16, 9);
        break;
      case 'fireBreath':
        this.voice(u, true);
        break;
      case 'frostBreath':
        this.voice(u, true);
        audio.ice();
        break;
    }
  }

  /** Thick cone of flame or frost, emitted from the beast's actual mouth. */
  private breathPuff(u: Unit, id: string, dx: number, dz: number, range: number): void {
    const { fx } = this.stage;
    const v = this.units.get(u.id);
    if (!v) return;
    const m = v.rig.mouthWorld(this.tmp);
    const fire = id === 'fireBreath';
    if (fire) audio.fire(); else audio.ice();
    const n = 42;
    const speed = range * 2.1;
    for (let i = 0; i < n; i++) {
      const spread = 0.42;
      const a = rand(-spread, spread);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const vx = (dx * cos - dz * sin) * speed * rand(0.55, 1);
      const vz = (dx * sin + dz * cos) * speed * rand(0.55, 1);
      const vy = -m.y * 1.45 + rand(-2.5, 3);
      const hot = Math.random() < 0.35;
      const c = fire ? (hot ? PALETTE.fireHot : PALETTE.fire) : hot ? PALETTE.iceHot : PALETTE.ice;
      fx.particles.add({
        x: m.x, y: m.y, z: m.z, vx, vy, vz, drag: 0.9, life: rand(0.5, 0.82),
        size: rand(0.5, 0.9), endSize: rand(2, 3.6), r: c[0], g: c[1], b: c[2], a: 0.7,
      });
    }
    if (Math.random() < 0.7) {
      const gx = u.x + dx * rand(4, range);
      const gz = u.z + dz * rand(4, range);
      if (fire) {
        fx.decal(gx, gz, rand(1.4, 2.6), '#ff5a14', false, 9);
        fx.smoke(gx, 0.5, gz, 1, 2.2, 1.5, 0.06);
      } else {
        fx.decal(gx, gz, rand(1.4, 2.6), '#c8f2ff', false, 7);
      }
    }
    fx.flash(m.x, m.y, m.z, fire ? '#ff8a2a' : '#7fe0ff', 28, 0.18, 22);
  }

  // ── Win ceremony ────────────────────────────────────────
  celebrate(uid: string, leveled: boolean, evolved: boolean): void {
    for (const v of this.units.values()) {
      if (v.u.uid !== uid || v.gone || v.u.dead) continue;
      const h = v.rig.height * v.u.scale;
      if (leveled) {
        this.stage.fx.levelUpBurst(v.u.x, v.u.z, h, evolved);
        this.text.spawn(v.u.x, h + 1.3, v.u.z, evolved ? 'EVOLVED!' : 'LEVEL UP!', evolved ? 'callout evolve' : 'callout gold', 2, 0.8);
      }
      this.stage.fx.coinBurst(v.u.x, h, v.u.z, 16);
      return;
    }
  }

  dispose(): void {
    for (const v of this.units.values()) {
      if (!v.gone) this.removeUnit(v);
    }
    for (const pv of this.projs.values()) this.stage.scene.remove(pv.mesh);
    this.stage.scene.remove(this.bars.mesh);
    this.bars.dispose();
    this.ringGeo.dispose();
    this.ringMats.forEach((m) => m.dispose());
    this.auraGeo.dispose();
    this.auraMats.forEach((m) => m.dispose());
    this.projGeo.dispose();
    this.shadowMat.dispose();
    Object.values(this.projMats).forEach((m) => m.dispose());
    this.text.dispose();
  }
}
