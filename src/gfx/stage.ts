// Owns the renderer, scene, camera, post stack and the current biome.
import * as THREE from 'three';
import { CameraRig } from './camera';
import { FX } from './fx';
import { PostFX } from './post';
import { World, type Quality } from './world';
import type { BiomeId } from '../sim/stages';

const DUST: Record<BiomeId, string> = {
  savanna: '#c6a56f', jungle: '#6f7a4a', tundra: '#e8f2fa', primeval: '#7a7040', caldera: '#4a3a34', starfall: '#6f6498',
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: CameraRig;
  readonly post: PostFX;
  readonly fx: FX;
  world: World | null = null;
  time = 0;
  private pixelRatio: number;
  private fpsAvg = 60;
  private slowFor = 0;
  private shadowsOff = false;

  constructor(canvas: HTMLCanvasElement, readonly quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = quality === 'high' ? Math.min(devicePixelRatio, 2) : quality === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.cam = new CameraRig(innerWidth / innerHeight);
    this.post = new PostFX(this.renderer, this.scene, this.cam.camera, quality);
    this.fx = new FX(this.scene, this.cam, this.post, quality === 'high' ? 26000 : quality === 'medium' ? 14000 : 7000);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Swaps the biome only when it actually changes: building one costs a noticeable moment. */
  setBiome(biome: BiomeId): void {
    if (this.world?.biome === biome) return;
    this.world?.dispose();
    this.world = new World(biome, this.scene, this.renderer, this.quality);
    if (this.shadowsOff) this.world.sun.castShadow = false;
    this.renderer.toneMappingExposure = this.world.exposure;
    this.post.setGrade(this.world.bloom, this.world.grade.sat, this.world.grade.lift);
    this.fx.setDustColor(DUST[biome]);
    this.applyParticleScale();
  }

  private applyParticleScale(): void {
    const px = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.camera.fov / 2)));
    this.fx.setParticleScale(px);
    this.world?.setPixelScale(px);
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.cam.camera.aspect = w / h;
    // Portrait screens get a wider lens so the arena still fits.
    this.cam.baseFov = w / h < 1 ? 52 : 38;
    this.cam.camera.fov = this.cam.baseFov;
    this.cam.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setPixelRatio(this.pixelRatio);
    this.post.resize(w, h);
    this.applyParticleScale();
  }

  /** Quietly trades resolution, then shadows, then bloom for frame rate when a device struggles. */
  private governFrameRate(realDt: number): void {
    this.fpsAvg += (1 / Math.max(realDt, 0.001) - this.fpsAvg) * 0.04;
    if (this.fpsAvg >= 32) {
      this.slowFor = 0;
      return;
    }
    this.slowFor += realDt;
    if (this.slowFor < 2.5) return;
    this.slowFor = 0;
    this.fpsAvg = 45; // Give the change time to show before judging again.
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    } else if (!this.shadowsOff) {
      this.shadowsOff = true;
      if (this.world) this.world.sun.castShadow = false;
    } else if (this.post.bloom.enabled) {
      this.post.bloom.enabled = false;
    } else if (this.pixelRatio > 0.75) {
      this.pixelRatio = 0.75;
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  render(realDt: number): void {
    this.time += realDt;
    this.governFrameRate(realDt);
    this.world?.update(this.time);
    this.post.update(realDt);
    this.post.render();
  }
}
