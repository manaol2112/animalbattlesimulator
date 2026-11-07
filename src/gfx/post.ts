// Cinematic post stack: HDR bloom, ACES, then shock distortion, chromatic aberration and grade.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Quality } from './world';

const MAX_WAVES = 4;

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberration: { value: 0 },
    uVignette: { value: 1 },
    uSat: { value: 1.1 },
    uLift: { value: new THREE.Vector3(1, 1, 1) },
    uAspect: { value: 1 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color('#ffffff') },
    uWaves: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uDesat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime,uAberration,uVignette,uSat,uAspect,uFlash,uDesat;
    uniform vec3 uLift,uFlashCol; uniform vec4 uWaves[${MAX_WAVES}]; varying vec2 vUv;
    float grain(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uTime*17.0)*43758.5453); }
    void main(){
      vec2 uv = vUv;
      // Screen-space shockwaves: x,y center, z radius, w strength.
      for(int i=0;i<${MAX_WAVES};i++){
        vec4 w = uWaves[i];
        if(w.w<=0.001) continue;
        vec2 d = uv-w.xy; d.x*=uAspect;
        float len = length(d);
        float band = smoothstep(0.075,0.0,abs(len-w.z));
        if(len>0.0001){ vec2 n = d/len; n.x/=uAspect; uv -= n*band*w.w*0.05; }
      }
      vec2 c = uv-0.5;
      float r2 = dot(c,c);
      float ab = (0.00015 + uAberration*0.004)*(0.3+r2*3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ab*2.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ab*2.0).b;
      float lum = dot(col,vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(lum),col,uSat*(1.0-uDesat*0.75));
      col *= uLift;
      // Filmic contrast in display space.
      col = mix(col, col*col*(3.0-2.0*col), 0.22);
      col *= 1.0 - smoothstep(0.18,0.72,r2)*0.48*uVignette;
      col += uFlashCol*uFlash;
      col += (grain(gl_FragCoord.xy)-0.5)*0.016;
      gl_FragColor = vec4(col,1.0);
    }`,
};

interface Wave { x: number; y: number; t: number; dur: number; strength: number; reach: number; }

export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly final: ShaderPass;
  private waves: Wave[] = [];
  private aberration = 0;
  private flash = 0;
  private time = 0;
  private lastSmallShock = -1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: Quality) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 4 : quality === 'medium' ? 2 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.72, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.final.uniforms.uAspect.value = size.x / size.y;
    if (quality === 'low') this.bloom.enabled = false;
  }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.final.uniforms.uAspect.value = w / h;
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio);
  }

  setGrade(bloom: number, sat: number, lift: [number, number, number]): void {
    this.bloom.strength = bloom;
    this.final.uniforms.uSat.value = sat;
    this.final.uniforms.uLift.value.set(lift[0], lift[1], lift[2]);
  }

  shock(ndcX: number, ndcY: number, strength: number, dur = 0.65, reach = 0.55): void {
    // Small ripples take turns, so a brawl doesn't keep the whole picture wobbling.
    if (strength < 1 && this.time - this.lastSmallShock < 0.8) return;
    if (strength < 1) this.lastSmallShock = this.time;
    if (this.waves.length >= MAX_WAVES) this.waves.shift();
    this.waves.push({ x: ndcX, y: ndcY, t: 0, dur, strength, reach });
  }

  kickAberration(a: number): void { this.aberration = Math.min(1, Math.max(this.aberration, a)); }

  flashScreen(amount: number, color = '#ffffff'): void {
    this.flash = Math.max(this.flash, amount);
    this.final.uniforms.uFlashCol.value.set(color);
  }

  setDesat(v: number): void { this.final.uniforms.uDesat.value = v; }

  update(dt: number): void {
    this.time += dt;
    const u = this.final.uniforms;
    u.uTime.value = this.time % 100;
    this.aberration = Math.max(0, this.aberration - dt * 2.8);
    u.uAberration.value = this.aberration;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    u.uFlash.value = this.flash;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.waves[i].t += dt;
      if (this.waves[i].t >= this.waves[i].dur) this.waves.splice(i, 1);
    }
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = this.waves[i];
      if (w) {
        const k = w.t / w.dur;
        u.uWaves.value[i].set(w.x, w.y, k * w.reach, w.strength * (1 - k) * (1 - k));
      } else {
        u.uWaves.value[i].set(0, 0, 0, 0);
      }
    }
  }

  render(): void { this.composer.render(); }

  dispose(): void {
    this.composer.dispose();
  }
}

