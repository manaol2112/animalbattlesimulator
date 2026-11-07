// Battle camera: orbit with an auto-director, follow, possession chase, and cinematic focus.
import * as THREE from 'three';

export type CamMode = 'orbit' | 'follow' | 'chase';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CamMode = 'orbit';
  target = new THREE.Vector3(0, 1, 0);
  private desired = new THREE.Vector3(0, 1, 0);
  azimuth = 0.6;
  elevation = 0.55;
  distance = 46;
  private dAz = 0.6;
  private dEl = 0.55;
  private dDist = 46;
  autoDirect = true;
  private idleT = 0;
  private trauma = 0;
  private time = 0;
  private focusT = 0;
  private focusPos = new THREE.Vector3();
  private focusDist = 12;
  private savedDist = 46;
  followPos: THREE.Vector3 | null = null;
  chaseHeading = 0;
  chaseHeight = 2;
  private tmp = new THREE.Vector3();
  driftSpeed = 0.035;
  baseFov = 38;
  /** How many beasts are fighting right now. */
  crowd = 0;
  private lastSmallShake = -1;
  private lastPunch = -1;
  /** Average size of the beasts in view, so a fight between ants gets as close as one between giants. */
  subjectSize = 1;
  private fovKick = 0;
  /** Where the fight is hottest right now, and how much that should pull the camera. */
  private hot = new THREE.Vector3();
  private hotW = 0;
  minDist = 6;
  maxDist = 150;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.2, 1500);
  }

  set(az: number, el: number, dist: number, snap = false): void {
    this.dAz = az; this.dEl = el; this.dDist = dist;
    if (snap) {
      this.azimuth = az; this.elevation = el; this.distance = dist;
      this.focusT = 0;
    }
  }

  lookAt(x: number, y: number, z: number, snap = false): void {
    this.desired.set(x, y, z);
    if (snap) {
      this.target.copy(this.desired);
      this.focusT = 0;
    }
  }

  /** How much further back to stand on narrow screens so the same width of arena fits. */
  fitScale(): number {
    return THREE.MathUtils.clamp(1.25 / this.camera.aspect, 1, 1.9);
  }

  /** Hands control straight to the director instead of waiting for input to go idle. */
  startDirecting(): void { this.idleT = 100; }

  /** A quick lens punch-in that sells a heavy blow. */
  punch(amount: number): void {
    // Lens punches are spaced out too: constant zooming feels just like shaking.
    if (this.time - this.lastPunch < 0.7) return;
    this.lastPunch = this.time;
    this.fovKick = Math.max(this.fovKick, amount * this.crowdCalm());
  }

  /** Marks a big moment so the director drifts toward it. */
  noteAction(x: number, z: number, weight: number): void {
    this.hot.set(x, 1.2, z);
    this.hotW = Math.min(1, this.hotW + weight);
  }

  /**
   * Shakes the camera. Everyday blows pass through a limiter: they share a low ceiling, take turns, and
   * get weaker as the crowd grows, because forty small hits a second would otherwise never let it settle.
   * `big` is for the rare moments that should really land, like a meteor or a giant's stomp.
   */
  shake(amount: number, big = false): void {
    if (big) {
      this.trauma = Math.min(0.8, this.trauma + amount);
      return;
    }
    if (this.time - this.lastSmallShake < 0.3) return;
    this.lastSmallShake = this.time;
    const room = Math.max(0, 0.32 - this.trauma);
    this.trauma += Math.min(room, amount * this.crowdCalm());
  }

  /** 1 for a small skirmish, easing to a little over half in a big brawl. */
  crowdCalm(): number {
    return THREE.MathUtils.clamp(1.2 - this.crowd * 0.03, 0.6, 1);
  }

  /** Clears any leftover cinematic state when moving to a new screen. */
  reset(): void {
    this.focusT = 0;
    this.hotW = 0;
    this.trauma = 0;
    this.fovKick = 0;
    this.mode = 'orbit';
    this.followPos = null;
  }

  /** Pull in on a moment for `dur` real seconds, then return. */
  focus(pos: THREE.Vector3, dist: number, dur: number): void {
    this.focusPos.copy(pos);
    if (this.focusT <= 0) this.savedDist = this.dDist;
    this.focusDist = dist;
    this.focusT = dur;
  }

  rotateBy(dx: number, dy: number): void {
    this.dAz -= dx * 0.005;
    this.dEl = THREE.MathUtils.clamp(this.dEl + dy * 0.004, 0.06, 1.35);
    this.idleT = 0;
  }

  zoomBy(delta: number): void {
    this.dDist = THREE.MathUtils.clamp(this.dDist * Math.exp(delta * 0.001), this.minDist, this.maxDist);
    this.idleT = 0;
  }

  panBy(dx: number, dz: number): void {
    const s = Math.sin(this.dAz);
    const c = Math.cos(this.dAz);
    this.desired.x += dx * c + dz * s;
    this.desired.z += -dx * s + dz * c;
    const r = Math.hypot(this.desired.x, this.desired.z);
    if (r > 60) { this.desired.x *= 60 / r; this.desired.z *= 60 / r; }
    this.idleT = 0;
  }

  update(dt: number, actionPoint: THREE.Vector3 | null, spread: number): void {
    this.time += dt;
    this.idleT += dt;
    if (this.focusT > 0) {
      this.focusT -= dt;
      this.desired.copy(this.focusPos);
      this.dDist = this.focusDist;
      if (this.focusT <= 0) this.dDist = this.savedDist;
    } else if (this.mode === 'follow' && this.followPos) {
      this.desired.copy(this.followPos);
    } else if (this.mode === 'orbit' && this.autoDirect && actionPoint && this.idleT > 3.5) {
      // Director: drift around the fight and frame it, without ever cutting abruptly.
      // Director: hold on the action, low and close, sweeping around it like a sports camera.
      this.hotW = Math.max(0, this.hotW - dt * 0.28);
      const aim = this.tmp.copy(actionPoint).lerp(this.hot, Math.min(0.8, this.hotW));
      this.desired.lerp(aim, 1 - Math.exp(-dt * 1.5));
      this.dAz += dt * (this.driftSpeed + this.hotW * 0.05);
      this.dEl += (0.27 + Math.sin(this.time * 0.17) * 0.07 + Math.min(0.14, spread * 0.005) - this.dEl) * (1 - Math.exp(-dt * 0.4));
      const framed = this.hotW > 0.6 ? Math.min(spread, 14) : Math.min(spread, 28);
      const sizeK = THREE.MathUtils.clamp(0.5 + this.subjectSize * 0.5, 0.62, 1.15);
      const wanted = THREE.MathUtils.clamp(14 + framed * 1.4, 18, 58) * sizeK * this.fitScale();
      this.dDist += (wanted - this.dDist) * (1 - Math.exp(-dt * 0.7));
    }

    this.fovKick = Math.max(0, this.fovKick - dt * 12);
    const fov = this.baseFov - this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.005) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const k = 1 - Math.exp(-dt * 7);
    this.target.lerp(this.desired, this.focusT > 0 ? 1 - Math.exp(-dt * 5) : 1 - Math.exp(-dt * 4));
    this.azimuth += (this.dAz - this.azimuth) * k;
    this.elevation += (this.dEl - this.elevation) * k;
    this.distance += (this.dDist - this.distance) * (1 - Math.exp(-dt * 3.5));

    const cam = this.camera;
    if (this.mode === 'chase' && this.followPos) {
      const back = this.chaseHeight * 3 + 5;
      const want = this.tmp.set(
        this.followPos.x - Math.sin(this.chaseHeading) * back,
        this.followPos.y + this.chaseHeight + 3.2,
        this.followPos.z - Math.cos(this.chaseHeading) * back,
      );
      cam.position.lerp(want, 1 - Math.exp(-dt * 6));
      this.target.lerp(this.followPos, 1 - Math.exp(-dt * 12));
      this.tmp.copy(this.target);
      this.tmp.y += this.chaseHeight * 0.6;
      cam.lookAt(this.tmp);
    } else {
      const cosE = Math.cos(this.elevation);
      cam.position.set(
        this.target.x + Math.sin(this.azimuth) * cosE * this.distance,
        Math.max(0.8, this.target.y + Math.sin(this.elevation) * this.distance),
        this.target.z + Math.cos(this.azimuth) * cosE * this.distance,
      );
      cam.lookAt(this.target);
    }

    // Trauma-based shake gives weight without nausea.
    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    const s = this.trauma * this.trauma;
    if (s > 0.0005) {
      const t = this.time * 31;
      const noise = (a: number) => Math.sin(t * a) * 0.6 + Math.sin(t * a * 1.7 + 1.3) * 0.4;
      cam.rotateZ(noise(0.93) * s * 0.03);
      cam.rotateX(noise(1.21) * s * 0.02);
      cam.rotateY(noise(0.77) * s * 0.02);
    }
  }
}
