// Renders each beast once into an image for cards. Uses a small dedicated renderer, cached forever.
import * as THREE from 'three';
import { BeastRig, IDLE_POSE } from '../gfx/beast';
import { getSpecies } from '../sim/species';

const SIZE = 192;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
const cache = new Map<string, string>();

function init(): void {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#fff3e0', '#5a4632', 1.9));
  const key = new THREE.DirectionalLight('#fff0d8', 3.4);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fd0ff', 2.2);
  rim.position.set(-5, 3, -5);
  scene.add(rim);
}

export function portrait(speciesId: string, evo = 0): string {
  const key = `${speciesId}:${evo}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!renderer) init();
  const sp = getSpecies(speciesId);
  const rig = new BeastRig(speciesId, evo, '#ffffff');
  rig.uniforms.uTeam.value.set('#000000');
  rig.update({ ...IDLE_POSE, flying: !!sp.flying }, 0, 0);
  // Point the beast toward camera at a flattering three-quarter angle.
  rig.root.rotation.y = -0.72;
  scene.add(rig.root);
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.5;
  const dist = r / Math.sin(THREE.MathUtils.degToRad(13));
  camera.position.set(center.x, center.y + r * 0.45, center.z + dist);
  camera.lookAt(center);
  renderer!.render(scene, camera);
  const url = renderer!.domElement.toDataURL('image/webp', 0.86);
  cache.set(key, url);
  scene.remove(rig.root);
  rig.dispose();
  return url;
}

// ── Lazy loading ──────────────────────────────────────────
// With a hundred species, drawing every portrait up front would freeze a phone. Cards start blank
// and fill in as they scroll into view, a few per frame.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const waiting: HTMLImageElement[] = [];
let pumping = false;

function pump(): void {
  const start = performance.now();
  while (waiting.length && performance.now() - start < 14) {
    const img = waiting.shift()!;
    if (!img.isConnected) continue;
    img.src = portrait(img.dataset.pid!, Number(img.dataset.pevo ?? 0));
    delete img.dataset.pid;
  }
  if (waiting.length) requestAnimationFrame(pump);
  else pumping = false;
}

const seen: IntersectionObserver | null = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen?.unobserve(e.target);
      const img = e.target as HTMLImageElement;
      // Newest-seen first, so the row being looked at fills before ones already scrolled past.
      waiting.unshift(img);
    }
    if (waiting.length && !pumping) {
      pumping = true;
      requestAnimationFrame(pump);
    }
  }, { rootMargin: '120px' })
  : null;

/** An image tag for a beast's portrait. Pair with `watchPortraits` on the page's root. */
export function portraitImg(speciesId: string, evo = 0, alt = ''): string {
  const hit = cache.get(`${speciesId}:${evo}`);
  if (hit) return `<img class="portrait" src="${hit}" alt="${alt}" draggable="false" />`;
  return `<img class="portrait lazy" src="${BLANK}" data-pid="${speciesId}" data-pevo="${evo}" alt="${alt}" draggable="false" />`;
}

/** Starts filling in lazy portraits anywhere under `root`, now and as new markup arrives. */
export function watchPortraits(root: HTMLElement): void {
  const attach = (n: ParentNode) => {
    const load = (img: HTMLImageElement) => {
      if (seen) seen.observe(img);
      else img.src = portrait(img.dataset.pid!, Number(img.dataset.pevo ?? 0));
    };
    // An added node can be the image itself, which a search of its descendants would miss.
    if (n instanceof HTMLImageElement) {
      if (n.dataset.pid) load(n);
      return;
    }
    n.querySelectorAll<HTMLImageElement>('img[data-pid]').forEach(load);
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((node) => { if (node instanceof HTMLElement) attach(node); });
  }).observe(root, { childList: true, subtree: true });
  attach(root);
}
