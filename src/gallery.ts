// Developer view: every beast side by side. Open /gallery.html?evo=0..3
import * as THREE from 'three';
import { BeastRig, IDLE_POSE } from './gfx/beast';
import { SPECIES } from './sim/species';

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7f9ab0');
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 400);
const params = new URLSearchParams(location.search);
const evo = Number(params.get('evo') ?? 0);
const only = params.get('only');
scene.add(new THREE.HemisphereLight('#dfeeff', '#6a5a40', 1.5));
const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
sun.position.set(14, 26, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, far: 120 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#8f8a72' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const list = only ? SPECIES.filter((s) => only.split(',').includes(s.id)) : SPECIES;
if (!list.length) document.body.insertAdjacentHTML('afterbegin', `<p style="color:#fff;font:16px sans-serif">No species match "${only}".</p>`);
const cols = Math.max(1, Math.ceil(Math.sqrt(list.length * 1.5)));
const rigs: { rig: BeastRig; flying: boolean }[] = [];
const spacing = Number(params.get('sp') ?? (only ? 3.2 : 8));
list.forEach((sp, i) => {
  const rig = new BeastRig(sp.id, evo, '#46a8ff');
  rig.setScale(1);
  const col = i % cols;
  const row = Math.floor(i / cols);
  rig.root.position.set((col - (cols - 1) / 2) * spacing, sp.flying ? 2.4 : 0, row * spacing * 0.8 - 8);
  rig.root.rotation.y = 0.75;
  scene.add(rig.root);
  rigs.push({ rig, flying: !!sp.flying });
});
const rows = Math.ceil(list.length / cols);
const span = cols * spacing;
const midZ = (rows - 1) * spacing * 0.4 - 8;
camera.position.set(0, span * 0.3 + 1.5, midZ + span * 1.25 + rows);
camera.lookAt(0, 0.9, midZ);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
let last = performance.now();
function frame(now: number) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  for (const { rig, flying } of rigs) rig.update({ ...IDLE_POSE, flying }, dt, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
