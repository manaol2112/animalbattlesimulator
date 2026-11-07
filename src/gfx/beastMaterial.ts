// One material per beast: fur/scale detail, team rim light, hit flash, status tint and glowing dissolve.
import * as THREE from 'three';

export interface BeastUniforms {
  uFlash: { value: number };
  uDissolve: { value: number };
  uTeam: { value: THREE.Color };
  uPattern: { value: number };
  uPatternCol: { value: THREE.Color };
  uGlowCol: { value: THREE.Color };
  uBodyGlow: { value: number };
  uMark: { value: number };
  uTint: { value: THREE.Color };
  uTintAmt: { value: number };
  uTime: { value: number };
  uPatScale: { value: number };
  uPatAll: { value: number };
  uRainbow: { value: number };
  uEdge: { value: THREE.Color };
}

const NOISE = /* glsl */ `
float bHash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float bNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(bHash(i),bHash(i+vec3(1,0,0)),f.x),mix(bHash(i+vec3(0,1,0)),bHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(bHash(i+vec3(0,0,1)),bHash(i+vec3(1,0,1)),f.x),mix(bHash(i+vec3(0,1,1)),bHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float bFbm(vec3 p){ return bNoise(p)*.55+bNoise(p*2.1+3.1)*.3+bNoise(p*4.3+7.7)*.15; }
`;

export function makeBeastMaterial(opts: {
  team: string; pattern: number; patternCol?: string; glowCol?: string; bodyGlow?: number; mark?: number; size?: number; patternAll?: boolean; rainbow?: number;
}): { material: THREE.MeshStandardMaterial; uniforms: BeastUniforms } {
  const uniforms: BeastUniforms = {
    uFlash: { value: 0 },
    uDissolve: { value: 0 },
    uTeam: { value: new THREE.Color(opts.team) },
    uPattern: { value: opts.pattern },
    uPatternCol: { value: new THREE.Color(opts.patternCol ?? '#000000') },
    uGlowCol: { value: new THREE.Color(opts.glowCol ?? '#ffffff') },
    uBodyGlow: { value: opts.bodyGlow ?? 0 },
    uMark: { value: opts.mark ?? 0 },
    uTint: { value: new THREE.Color('#ffffff') },
    uTintAmt: { value: 0 },
    uTime: { value: 0 },
    uPatScale: { value: 1 / Math.pow(Math.max(0.55, opts.size ?? 1), 0.6) },
    uPatAll: { value: opts.patternAll ? 1 : 0 },
    uRainbow: { value: opts.rainbow ?? 0 },
    uEdge: { value: new THREE.Color('#ff7320') },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aGlow; varying float vGlow; varying vec3 vObj; varying float vWY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObj = position; vGlow = aGlow; vWY = (modelMatrix * vec4(position, 1.0)).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vGlow; varying vec3 vObj; varying float vWY;
        uniform float uFlash, uDissolve, uBodyGlow, uMark, uTintAmt, uTime, uPattern, uPatScale, uPatAll, uRainbow;
        uniform vec3 uTeam, uPatternCol, uGlowCol, uTint, uEdge;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 pObj = vObj * uPatScale;
        float pN = bFbm(pObj * 7.0);
        float pFine = bNoise(pObj * vec3(46.0, 46.0, 12.0));
        float pat = uPattern;
        float gloss = 0.0;
        float ember = 0.0;
        float pHeight = 0.0;
        float pBump = 0.0;
        if (vGlow < 0.005) {
          if (pat < 0.5) { // short fur
            diffuseColor.rgb *= 0.8 + 0.3 * pN + 0.16 * (pFine - 0.5);
            pHeight = pFine; pBump = 0.03;
          } else if (pat < 1.5) { // stripes
            float wob = bFbm(pObj * 3.4) * 1.9;
            float st = sin((pObj.z + pObj.y * 0.85) * 25.0 + wob * 3.0 + abs(pObj.x) * 4.0);
            float mask = smoothstep(0.62, 0.78, st);
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
            mask *= max(uPatAll, smoothstep(0.75, 0.35, lum));
            pHeight = pFine; pBump = 0.03;
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.86 + 0.25 * pN), uPatternCol, mask);
          } else if (pat < 2.5) { // spots
            float sp = bNoise(pObj * 15.0);
            float mask = smoothstep(0.7, 0.75, sp);
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.86 + 0.25 * pN), uPatternCol, mask * 0.75);
            pHeight = pFine; pBump = 0.03;
          } else if (pat < 3.5) { // scales
            vec3 q = pObj * vec3(19.0, 19.0, 13.0);
            float row = floor(q.z);
            float cell = sin((q.x + mod(row, 2.0) * 1.57) * 3.1416) * sin(q.z * 3.1416) ;
            float gap = smoothstep(0.0, 0.22, abs(cell));
            diffuseColor.rgb *= 0.68 + 0.42 * gap;
            diffuseColor.rgb *= 0.86 + 0.28 * pN;
            gloss = 0.32 * gap;
            pHeight = gap; pBump = 0.05;
            ember = (1.0 - gap);
          } else if (pat < 4.5) { // feathers
            float fe = sin(pObj.z * 26.0 + sin(pObj.x * 9.0) * 2.0);
            diffuseColor.rgb *= 0.82 + 0.2 * fe + 0.14 * pN;
            pHeight = fe * 0.5; pBump = 0.03;
          } else if (pat < 5.5) { // chitin
            diffuseColor.rgb *= 0.85 + 0.2 * pN;
            gloss = 0.5;
            pHeight = pN; pBump = 0.03;
          } else if (pat < 6.5) { // shaggy
            float sh = bNoise(pObj * vec3(30.0, 11.0, 30.0));
            diffuseColor.rgb *= 0.68 + 0.56 * sh;
            pHeight = sh; pBump = 0.06;
            diffuseColor.rgb *= 0.88 + 0.24 * pN;
          } else { // wrinkled hide
            float cr = abs(bNoise(pObj * 11.0) - 0.5) * 2.0;
            diffuseColor.rgb *= 0.84 + 0.2 * smoothstep(0.0, 0.25, cr);
            pHeight = pN; pBump = 0.05;
            diffuseColor.rgb *= 0.88 + 0.22 * pN;
          }
        }
        if (uRainbow > 0.0 && vGlow < 0.005) {
          // Colour bands slide along the body, for the beasts that shimmer.
          vec3 hue = 0.5 + 0.5 * cos(6.2832 * (pObj.z * 0.9 + pObj.y * 0.5 + uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
          diffuseColor.rgb = mix(diffuseColor.rgb, hue, uRainbow);
        }
        // Darkens toward the ground, which seats legs and bellies in the scene.
        diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 1.05, vWY));
        if (uDissolve > 0.0) {
          float dn = bFbm(vObj * 5.0 + 11.0);
          if (dn < uDissolve) discard;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Rim light reads the smooth surface, so team colour outlines the beast instead of tracing the bumps.
        vec3 smoothN = normal;
        // Procedural bump: the coat pattern catches the light, fading out with distance so it can't shimmer.
        float pBumpK = pBump * (1.0 - smoothstep(14.0, 60.0, length(vViewPosition)));
        if (pBumpK > 0.0001) {
          vec3 pP = -vViewPosition;
          vec3 pDx = dFdx(pP);
          vec3 pDy = dFdy(pP);
          float pHx = dFdx(pHeight) * pBumpK;
          float pHy = dFdy(pHeight) * pBumpK;
          vec3 pR1 = cross(pDy, normal);
          vec3 pR2 = cross(normal, pDx);
          float pDet = dot(pDx, pR1);
          vec3 pG = sign(pDet) * (pHx * pR1 + pHy * pR2);
          normal = normalize(abs(pDet) * normal - pG);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = max(0.18, roughnessFactor - gloss);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 vDir = normalize(vViewPosition);
        float rim = pow(1.0 - saturate(dot(smoothN, vDir)), 3.4);
        totalEmissiveRadiance += uTeam * rim * 0.34;
        // Painted glow parts (flames, antlers, stingers): vGlow in (0,1.5).
        if (vGlow > 0.01 && vGlow < 1.5) totalEmissiveRadiance += diffuseColor.rgb * vGlow * 3.0;
        // Eyes: vGlow >= 1.5 burn in team colour.
        if (vGlow >= 1.5) totalEmissiveRadiance += mix(uTeam, vec3(1.0), 0.12) * 2.1 * (vGlow - 0.5);
        // Molten seams or inner light for mythic beasts.
        if (uBodyGlow > 0.0) {
          float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + vObj.z * 2.0);
          totalEmissiveRadiance += uGlowCol * uBodyGlow * (ember * 0.4 + smoothstep(0.55, 0.85, pN) * 0.7) * pulse;
        }
        // Evolution markings: veins of light earned through levelling.
        if (uMark > 0.0) {
          // Thin, broken veins: the mask keeps them to patches so the fur still reads.
          float vein = 1.0 - smoothstep(0.0, 0.012, abs(bNoise(pObj * 5.5 + 3.0) - 0.5));
          float patchy = smoothstep(0.48, 0.62, bNoise(pObj * 1.9 + 9.0));
          float pulse = 0.6 + 0.4 * sin(uTime * 2.4 + vObj.z * 3.0);
          totalEmissiveRadiance += uGlowCol * vein * patchy * uMark * 1.5 * pulse;
        }
        if (uTintAmt > 0.0) {
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmt * 0.4);
          totalEmissiveRadiance += uTint * uTintAmt * 0.16;
        }
        totalEmissiveRadiance += vec3(1.0, 0.94, 0.86) * uFlash * 0.45;
        if (uDissolve > 0.0) {
          float dn2 = bFbm(vObj * 5.0 + 11.0);
          float edge = 1.0 - smoothstep(0.0, 0.07, dn2 - uDissolve);
          totalEmissiveRadiance += mix(uEdge, vec3(1.0, 0.9, 0.6), edge) * edge * 7.0;
        }`);
  };
  material.customProgramCacheKey = () => 'beast-v3';
  return { material, uniforms };
}
