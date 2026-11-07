// Visual definitions for the wider roster, built from body-plan presets drawn at radius 1.
import { LOOKS, PATTERN, type Look } from './looks';

const LENGTHS = ['L', 'H', 'rump', 'waist', 'chest', 'sh', 'legFront', 'legRear', 'legR', 'pawR', 'legSpread', 'neckLen', 'neckR', 'headLen', 'headR', 'snoutLen', 'snoutR', 'tailLen', 'tailR', 'wingSpan'] as const;

/** Scales a preset to the size a species actually is. */
function at(l: Look, k: number): Look {
  const out = { ...l };
  for (const f of LENGTHS) {
    const v = out[f];
    if (typeof v === 'number') (out as Record<string, unknown>)[f] = v * k;
  }
  return out;
}

const base = {
  accent: '#222222', dark: '#17120f', pattern: PATTERN.fur,
  tail: 'thin', attack: 'bite',
} as const;

type P = Partial<Look>;

const quad = (d: P) => (o: P, r: number): Look => at({
  plan: 'quad', ...base, top: '#888888', bottom: '#bbbbbb', L: 2, H: 1, rump: 0.4, waist: 0.34, chest: 0.44, sh: 0.06,
  legFront: 1, legRear: 1, legR: 0.12, pawR: 0.15, neckLen: 0.5, neckR: 0.24, neckAngle: 28, headLen: 0.36, headR: 0.25,
  snoutLen: 0.24, snoutR: 0.13, tailLen: 0.8, tailR: 0.06, ...d, ...o,
} as Look, r);

const cat = quad({ L: 2.1, rump: 0.38, waist: 0.31, chest: 0.46, sh: 0.08, legR: 0.13, pawR: 0.18, neckLen: 0.5, neckR: 0.25, neckAngle: 26, headLen: 0.35, headR: 0.27, snoutLen: 0.16, snoutR: 0.14, ears: 'round', tail: 'long', tailLen: 1.35, tailR: 0.07, attack: 'swipe' });
const dog = quad({ L: 2.2, H: 1.1, rump: 0.36, waist: 0.28, chest: 0.44, sh: 0.08, legR: 0.11, pawR: 0.14, neckLen: 0.65, neckR: 0.23, neckAngle: 32, headLen: 0.42, headR: 0.22, snoutLen: 0.42, snoutR: 0.11, ears: 'pointy', tail: 'bushy', tailLen: 1.15, tailR: 0.11, pattern: PATTERN.shaggy });
const hoofed = quad({ L: 2.2, H: 1.35, rump: 0.42, waist: 0.36, chest: 0.44, sh: 0.08, legR: 0.09, pawR: 0.1, hoof: true, neckLen: 1.0, neckR: 0.19, neckAngle: 50, headLen: 0.45, headR: 0.19, snoutLen: 0.42, snoutR: 0.12, ears: 'pointy', tail: 'bushy', tailLen: 1.0, tailR: 0.06, attack: 'gore' });
const bovine = quad({ L: 2.3, H: 1.05, rump: 0.55, waist: 0.58, chest: 0.62, sh: 0.14, legR: 0.16, pawR: 0.17, hoof: true, neckLen: 0.42, neckR: 0.38, neckAngle: 8, headLen: 0.48, headR: 0.3, snoutLen: 0.3, snoutR: 0.2, ears: 'small', tail: 'tuft', tailLen: 0.8, tailR: 0.04, attack: 'gore' });
const bearish = quad({ L: 1.85, H: 0.82, rump: 0.54, waist: 0.52, chest: 0.6, sh: 0.18, legR: 0.17, pawR: 0.2, neckLen: 0.34, neckR: 0.33, neckAngle: 14, headLen: 0.38, headR: 0.27, snoutLen: 0.22, snoutR: 0.13, ears: 'round', tail: 'bob', tailLen: 0.14, tailR: 0.08, pattern: PATTERN.shaggy, attack: 'swipe' });
const ape = quad({ L: 1.35, H: 0.78, rump: 0.5, waist: 0.5, chest: 0.7, sh: 0.6, legR: 0.2, pawR: 0.25, legSpread: 0.72, neckLen: 0.32, neckR: 0.28, neckAngle: 40, headLen: 0.32, headR: 0.26, snoutLen: 0.14, snoutR: 0.19, ears: 'small', tail: 'bob', tailLen: 0.02, tailR: 0.02, pattern: PATTERN.shaggy, attack: 'slam' });
const lizard = quad({ L: 2.1, H: 0.4, rump: 0.34, waist: 0.38, chest: 0.38, sh: 0, legR: 0.09, pawR: 0.12, sprawl: 0.6, neckLen: 0.25, neckR: 0.26, neckAngle: 6, headLen: 0.38, headR: 0.22, snoutLen: 0.4, snoutR: 0.13, tail: 'long', tailLen: 2, tailR: 0.26, pattern: PATTERN.scales });
const critter = quad({ L: 1.9, H: 0.7, rump: 0.5, waist: 0.48, chest: 0.46, sh: -0.04, legR: 0.1, pawR: 0.12, neckLen: 0.25, neckR: 0.26, neckAngle: 22, headLen: 0.36, headR: 0.27, snoutLen: 0.2, snoutR: 0.12, ears: 'round', tail: 'bob', tailLen: 0.2, tailR: 0.1, pattern: PATTERN.shaggy });
const sauropod = quad({ L: 2.3, H: 1.3, rump: 0.74, waist: 0.74, chest: 0.76, sh: 0.1, legR: 0.25, pawR: 0.31, neckLen: 3.2, neckR: 0.32, neckAngle: 52, neckSegs: 3, headLen: 0.3, headR: 0.17, snoutLen: 0.2, snoutR: 0.11, headScale: 1.5, tail: 'long', tailLen: 3.3, tailR: 0.42, pattern: PATTERN.scales, attack: 'gore' });
const ceratopsian = quad({ L: 2.1, H: 0.82, rump: 0.58, waist: 0.6, chest: 0.62, sh: 0, legR: 0.18, pawR: 0.22, neckLen: 0.3, neckR: 0.36, neckAngle: 0, headLen: 0.55, headR: 0.34, snoutLen: 0.4, snoutR: 0.18, headScale: 1.15, tail: 'long', tailLen: 1.4, tailR: 0.3, pattern: PATTERN.scales, attack: 'gore' });
const armored = quad({ L: 2.3, H: 0.72, rump: 0.62, waist: 0.66, chest: 0.58, sh: -0.14, legR: 0.17, pawR: 0.21, neckLen: 0.34, neckR: 0.26, neckAngle: -4, headLen: 0.34, headR: 0.2, snoutLen: 0.2, snoutR: 0.13, tail: 'long', tailLen: 1.9, tailR: 0.26, pattern: PATTERN.scales, attack: 'gore' });

const biped = (d: P) => (o: P, r: number): Look => at({
  plan: 'rex', ...base, pattern: PATTERN.scales, top: '#556b3a', bottom: '#d6c79a', accent: '#2a3320', L: 1.9, H: 1.24, rump: 0.4, waist: 0.38, chest: 0.42, sh: 0,
  legFront: 0, legRear: 1.24, legR: 0.2, pawR: 0.2, neckLen: 0.42, neckR: 0.24, neckAngle: 24, headLen: 0.46, headR: 0.24, snoutLen: 0.46, snoutR: 0.14,
  headScale: 1.1, tail: 'long', tailLen: 2, tailR: 0.28, ...d, ...o,
} as Look, r);

const theropod = biped({ arms: 'tiny' });
const raptor = biped({ L: 1.7, H: 1.1, chest: 0.3, waist: 0.27, legR: 0.13, neckLen: 0.58, neckR: 0.15, neckAngle: 42, headLen: 0.36, headR: 0.16, snoutLen: 0.36, snoutR: 0.09, tailLen: 2.1, tailR: 0.17, arms: 'claw', pattern: PATTERN.feather, sickle: true, headScale: 1.2 });
const hadrosaur = biped({ L: 2.0, H: 1.25, chest: 0.46, waist: 0.48, legR: 0.21, neckLen: 0.62, neckR: 0.21, neckAngle: 46, headLen: 0.4, headR: 0.18, snoutLen: 0.36, snoutR: 0.14, tailLen: 2.1, tailR: 0.3, arms: 'long', attack: 'gore' });
const groundBird = biped({ L: 1.0, H: 1.25, chest: 0.42, waist: 0.4, legR: 0.08, pawR: 0.14, neckLen: 0.9, neckR: 0.09, neckAngle: 76, headLen: 0.22, headR: 0.13, snoutLen: 0.2, snoutR: 0.05, tailLen: 0.5, tailR: 0.2, arms: 'none', pattern: PATTERN.feather, beak: true, tail: 'bob', attack: 'spit' });

const flyerOf = (d: P) => (o: P, r: number): Look => at({
  plan: 'bird', ...base, pattern: PATTERN.feather, top: '#555555', bottom: '#aaaaaa', accent: '#eeeeee', dark: '#e0a11c', L: 1.65, H: 0, rump: 0.33, waist: 0.4, chest: 0.46, sh: 0,
  legFront: 0.5, legRear: 0.5, legR: 0.05, pawR: 0.13, neckLen: 0.36, neckR: 0.22, neckAngle: 22, headLen: 0.27, headR: 0.2, snoutLen: 0.24, snoutR: 0.08,
  tailLen: 0.85, tailR: 0.24, wings: 'feather', wingSpan: 4, attack: 'swipe', ...d, ...o,
} as Look, r);

const flyer = flyerOf({});
const pterosaur = flyerOf({ wings: 'bat', pattern: PATTERN.hide, wingSpan: 5.6, L: 1.2, waist: 0.26, chest: 0.3, rump: 0.2, neckLen: 0.6, neckR: 0.11, headLen: 0.3, headR: 0.13, snoutLen: 0.75, snoutR: 0.06, tailLen: 0.3, tailR: 0.06, crest: 0.8 });

const insect = (o: P, r: number): Look => at({
  plan: 'insect', ...base, pattern: PATTERN.chitin, top: '#3a2a22', bottom: '#6a4a38', accent: '#c88a4a', dark: '#120c0a', L: 1.8, H: 0.55, rump: 0.5, waist: 0.34, chest: 0.36, sh: 0,
  legFront: 0.9, legRear: 0.9, legR: 0.045, pawR: 0.04, neckLen: 0, neckR: 0, neckAngle: 0, headLen: 0.3, headR: 0.26, snoutLen: 0, snoutR: 0, tailLen: 0, tailR: 0,
  antennae: 0.8, attack: 'bite', ...o,
} as Look, r);

const fish = (o: P, r: number): Look => at({
  plan: 'fish', ...base, pattern: PATTERN.hide, top: '#5f7283', bottom: '#eef2f4', accent: '#3a4a58', dark: '#1a2228', L: 3, H: 0, rump: 0.3, waist: 0.5, chest: 0.58, sh: 0,
  legFront: 0, legRear: 0, legR: 0, pawR: 0, neckLen: 0, neckR: 0, neckAngle: 0, headLen: 0.6, headR: 0.42, snoutLen: 0.5, snoutR: 0.24, tailLen: 1.1, tailR: 0.5, attack: 'bite', ...o,
} as Look, r);

const snake = (o: P, modelScale: number): Look => ({
  plan: 'snake', ...base, pattern: PATTERN.scales, top: '#3b4a22', bottom: '#d9c67f', accent: '#c6ad4c', dark: '#1e2610', L: 1.7, H: 0.75, rump: 0.1, waist: 0.14, chest: 0.13, sh: 0,
  legFront: 0, legRear: 0, legR: 0, pawR: 0, neckLen: 0, neckR: 0.11, neckAngle: 0, headLen: 0.18, headR: 0.1, snoutLen: 0.1, snoutR: 0.06, tailLen: 0.6, tailR: 0.05,
  attack: 'spit', modelScale, ...o,
} as Look);

const clawed = (o: P, modelScale: number): Look => ({
  plan: 'scorpion', ...base, pattern: PATTERN.chitin, top: '#2a2030', bottom: '#5b4560', accent: '#c37bff', dark: '#120c16', L: 1.2, H: 0.42, rump: 0.28, waist: 0.34, chest: 0.4, sh: 0,
  legFront: 0.5, legRear: 0.5, legR: 0.04, pawR: 0.05, neckLen: 0, neckR: 0, neckAngle: 0, headLen: 0.2, headR: 0.2, snoutLen: 0, snoutR: 0, tailLen: 0, tailR: 0.13,
  attack: 'gore', modelScale, ...o,
} as Look);

export const MORE_LOOKS: Record<string, Look> = {
  // ── Dinosaurs ─────────────────────────────────────────
  compy: raptor({ top: '#7a9a3a', bottom: '#e6e0a8', accent: '#3a5020', arms: 'claw', sickle: false }, 0.42),
  microraptor: flyer({ top: '#1e3a5a', bottom: '#3f8fc0', accent: '#9fe0ff', dark: '#222222', pattern: PATTERN.feather, snoutR: 0.09, tail: 'long', tailLen: 1.4, wingSpan: 3.6 }, 0.42),
  velociraptor: raptor({ top: '#8a5a2e', bottom: '#ecd9b0', accent: '#3a2412', patternCol: '#3a2412' }, 0.62),
  utahraptor: raptor({ top: '#7a2f22', bottom: '#e8cda8', accent: '#2c120c', crest: 0.45 }, 1.0),
  dilophosaurus: theropod({ top: '#2f7a5a', bottom: '#e4d890', accent: '#e8c030', arms: 'claw', crestStyle: 'twin', frillNeck: true, L: 1.8, chest: 0.34, waist: 0.3, legR: 0.15, neckLen: 0.62, neckR: 0.15, neckAngle: 38, headLen: 0.34, headR: 0.17, snoutLen: 0.36, snoutR: 0.1, tailR: 0.2, attack: 'spit' }, 0.76),
  pachy: theropod({ top: '#7a6a4a', bottom: '#dcc99a', accent: '#a08050', arms: 'claw', dome: true, L: 1.7, snoutLen: 0.2, snoutR: 0.13, headR: 0.25, headLen: 0.34, neckAngle: 20, attack: 'gore' }, 0.8),
  gallimimus: raptor({ top: '#a08a5a', bottom: '#f0e8c8', accent: '#5a4a2a', sickle: false, neckLen: 0.82, beak: true, snoutLen: 0.26, snoutR: 0.07, arms: 'long', legR: 0.14 }, 0.78),
  dimetrodon: lizard({ top: '#6a4a3a', bottom: '#d0b090', accent: '#b0452a', sail: 0.95, snoutLen: 0.3, headR: 0.25, sprawl: 0.5 }, 0.85),
  iguanodon: hadrosaur({ top: '#5a6a42', bottom: '#d6c8a0', accent: '#3a4428', thumbSpike: true }, 1.08),
  parasaur: hadrosaur({ top: '#3f7f6a', bottom: '#ece0b8', accent: '#d8a040', crestStyle: 'tube' }, 1.08),
  stegosaurus: armored({ top: '#5f6e3a', bottom: '#d0c690', accent: '#b0502a', plates: 11, tailSpikes: true, chest: 0.5, waist: 0.68, rump: 0.66, sh: -0.26 }, 1.28),
  ankylosaurus: armored({ top: '#6a5a3e', bottom: '#b8a880', accent: '#40362a', armorPlates: true, tailClub: true, L: 2.2, H: 0.55, chest: 0.66, waist: 0.76, rump: 0.7, sh: 0 }, 1.4),
  protoceratops: ceratopsian({ top: '#a08a58', bottom: '#e8d8a8', accent: '#6a5a38', frill: 0.85, tailLen: 1.1, beak: false }, 0.58),
  triceratops: ceratopsian({ top: '#6a6f42', bottom: '#d8cc98', accent: '#c07a30', frill: 1.25, noseHorn: 0.5, browHorns: 1.25 }, 1.62),
  styracosaurus: ceratopsian({ top: '#8a5a3a', bottom: '#e4d0a4', accent: '#a0342a', frill: 1.1, frillSpikes: true, noseHorn: 1.15 }, 1.35),
  carnotaurus: theropod({ top: '#8a2f22', bottom: '#e0b888', accent: '#3a140e', browHorns: 0.55, snoutLen: 0.28, snoutR: 0.17, arms: 'tiny', L: 1.9, chest: 0.36, waist: 0.32, legR: 0.17 }, 1.38),
  allosaurus: theropod({ top: '#74603a', bottom: '#e4d4a8', accent: '#402f18', patternCol: '#402f18', browHorns: 0.28, arms: 'claw' }, 1.48),
  therizinosaurus: hadrosaur({ top: '#6a4a78', bottom: '#d8c8d8', accent: '#3a2448', arms: 'scythe', pattern: PATTERN.feather, attack: 'swipe', chest: 0.5, waist: 0.56, upright: 0.5, neckLen: 0.9, neckR: 0.15, headLen: 0.26, headR: 0.13, snoutLen: 0.2, snoutR: 0.08 }, 1.45),
  spinosaurus: theropod({ top: '#3f5a5a', bottom: '#d4c8a0', accent: '#b03a2a', sail: 1.15, snoutLen: 0.85, snoutR: 0.13, headR: 0.2, arms: 'claw', L: 2.1, chest: 0.38, waist: 0.36 }, 1.9),
  giganotosaurus: theropod({ top: '#5a4632', bottom: '#d4c098', accent: '#2c2014', backSpikes: 14, arms: 'tiny', headScale: 1.2 }, 1.95),
  pteranodon: pterosaur({ top: '#6a4a3a', bottom: '#d8c0a0', accent: '#c05a2a', dark: '#caa23a', crest: 1 }, 0.98),
  quetzalcoatlus: pterosaur({ top: '#3a4a5a', bottom: '#e0d8c8', accent: '#d04a2a', dark: '#e8b040', wingSpan: 6.4, neckLen: 1.0, crest: 0.6 }, 1.5),
  brachiosaurus: sauropod({ top: '#6a7050', bottom: '#c8c0a0', accent: '#48503a', sh: 0.75, neckLen: 4.2, neckAngle: 62 }, 2.45),
  apatosaurus: sauropod({ top: '#5a5a48', bottom: '#b8b09a', accent: '#3a3a2c', neckR: 0.42 }, 2.2),
  diplodocus: sauropod({ top: '#6a5438', bottom: '#d4bc90', accent: '#3a2c1a', neckLen: 3.6, neckAngle: 30, tailLen: 5.2, tailR: 0.34, backSpikes: 12 }, 2.1),
  mosasaurus: fish({ top: '#2a4a5a', bottom: '#d8e8d8', accent: '#14303c', pattern: PATTERN.scales, L: 3.6, snoutLen: 0.9, snoutR: 0.22, headR: 0.36, flippers: true }, 2.2),
  // ── Bugs ──────────────────────────────────────────────
  ant: insect({ top: '#5a1e12', bottom: '#8a3018', accent: '#e8a040', rump: 0.42, waist: 0.14, chest: 0.26, headR: 0.3, mandibles: 0.45 }, 0.48),
  ladybug: insect({ top: '#d0201a', bottom: '#1a1414', accent: '#141010', patternCol: '#141010', pattern: PATTERN.spots, shell: true, headR: 0.2, rump: 0.62, L: 1.5, legFront: 0.6, antennae: 0.4, H: 0.42 }, 0.5),
  bee: insect({ top: '#e8b020', bottom: '#2a1e10', accent: '#fff0a0', pattern: PATTERN.stripes, patternCol: '#1a120a', stripesAll: true, flyingBug: true, wingKind: 'clear', stinger: true, rump: 0.42, chest: 0.36, antennae: 0.5 }, 0.46),
  wasp: insect({ top: '#e0a018', bottom: '#2a1e10', accent: '#fff0a0', pattern: PATTERN.stripes, patternCol: '#0f0a06', stripesAll: true, flyingBug: true, wingKind: 'clear', stinger: true, rump: 0.34, waist: 0.1, chest: 0.3, L: 2.1, mandibles: 0.3 }, 0.62),
  butterfly: insect({ top: '#2a1a12', bottom: '#40302a', accent: '#ff8a1a', glowCol: '#ffd070', flyingBug: true, wingKind: 'butterfly', rump: 0.16, chest: 0.16, waist: 0.1, headR: 0.13, L: 1.3, antennae: 1 }, 0.62),
  firefly: insect({ top: '#2a2418', bottom: '#4a4028', accent: '#c8ff40', glowCol: '#d8ff50', flyingBug: true, wingKind: 'clear', glowTail: true, rump: 0.34, chest: 0.26, L: 1.5, headR: 0.2 }, 0.44),
  grasshopper: insect({ top: '#6a9a2a', bottom: '#b8d060', accent: '#3a5a14', pattern: PATTERN.hide, hindLong: true, rump: 0.32, L: 2.1, chest: 0.3, headR: 0.24, antennae: 0.9 }, 0.6),
  cockroach: insect({ top: '#4a2412', bottom: '#7a4a24', accent: '#c88a4a', shell: true, rump: 0.5, L: 1.9, H: 0.36, chest: 0.34, antennae: 1.5, headR: 0.2 }, 0.56),
  stagbeetle: insect({ top: '#1e1410', bottom: '#4a2c1a', accent: '#6a3a20', shell: true, mandibles: 1.3, rump: 0.56, chest: 0.42, headR: 0.32, antennae: 0.3 }, 0.86),
  rhinobeetle: insect({ top: '#2a1a12', bottom: '#5a3a22', accent: '#3a2414', shell: true, bugHorn: 1.2, rump: 0.62, chest: 0.46, headR: 0.28, antennae: 0.25 }, 0.92),
  dragonfly: insect({ top: '#1a7a8a', bottom: '#40c8c0', accent: '#7fffe0', glowCol: '#7fffe0', flyingBug: true, wingKind: 'long', rump: 0.11, waist: 0.1, chest: 0.2, L: 3.2, headR: 0.22, antennae: 0.15 }, 0.8),
  mantis: insect({ top: '#5a9a3a', bottom: '#a8d070', accent: '#d8f0a0', pattern: PATTERN.hide, raptorial: true, rump: 0.26, waist: 0.14, chest: 0.17, L: 2.5, H: 0.7, headR: 0.22, antennae: 0.7 }, 0.85),
  centipede: { plan: 'centipede', ...base, pattern: PATTERN.chitin, top: '#7a2410', bottom: '#d07a30', accent: '#ffd040', dark: '#1a0c08', L: 3, H: 0.2, rump: 0.22, waist: 0.25, chest: 0.25, sh: 0, legFront: 0.5, legRear: 0.5, legR: 0.04, pawR: 0.04, neckLen: 0, neckR: 0.2, neckAngle: 0, headLen: 0.3, headR: 0.28, snoutLen: 0, snoutR: 0, tailLen: 0, tailR: 0, modelScale: 1.15 } as Look,
  tarantula: clawed({ top: '#2c1e18', bottom: '#5a3a2a', accent: '#d06a30', pattern: PATTERN.shaggy, spider: true }, 1.05),
  widow: clawed({ top: '#0e0c10', bottom: '#2a2228', accent: '#ff2a20', glowCol: '#ff2a20', spider: true, hourglass: true, attack: 'spit' }, 0.92),
  crab: clawed({ top: '#c8441e', bottom: '#f0a070', accent: '#fff0d8', dark: '#3a1208', pattern: PATTERN.chitin, crab: true }, 1.15),
  // ── Predators ─────────────────────────────────────────
  fox: dog({ top: '#d0601e', bottom: '#f6ecd8', accent: '#2a1810', snoutR: 0.09, tailR: 0.15, tailLen: 1.25, legR: 0.09, pawR: 0.1 }, 0.52),
  dog: dog({ top: '#7a5a38', bottom: '#d8c098', accent: '#2a1c10', ears: 'round', tail: 'thin', tailR: 0.06, pattern: PATTERN.fur }, 0.6),
  hyena: dog({ top: '#9a8a68', bottom: '#d4c8a8', accent: '#2a2218', pattern: PATTERN.spots, patternCol: '#3a3022', ears: 'round', sh: 0.22, H: 0.95, tail: 'tuft', tailR: 0.05, neckAngle: 22 }, 0.6),
  lynx: cat({ top: '#a08868', bottom: '#ece0c8', accent: '#2a2018', pattern: PATTERN.spots, patternCol: '#6a5038', ears: 'pointy', tail: 'bob', tailLen: 0.25, tailR: 0.07 }, 0.54),
  cheetah: cat({ top: '#d8a848', bottom: '#f6ecd0', accent: '#1a140e', pattern: PATTERN.spots, patternCol: '#17110d', H: 1.1, waist: 0.24, rump: 0.3, chest: 0.38, legR: 0.09, headR: 0.2, headLen: 0.28 }, 0.72),
  leopard: cat({ top: '#d0a048', bottom: '#f0e4c0', accent: '#1a140e', pattern: PATTERN.spots, patternCol: '#17110d' }, 0.76),
  jaguar: cat({ top: '#c88e38', bottom: '#f0e0b8', accent: '#1a140e', pattern: PATTERN.spots, patternCol: '#120d09', chest: 0.52, headR: 0.31, legR: 0.15, H: 0.92 }, 0.96),
  panther: cat({ top: '#17161c', bottom: '#26252e', accent: '#0c0c10' }, 0.96),
  panda: bearish({ top: '#f0ece4', bottom: '#14141a', accent: '#14141a', pattern: PATTERN.shaggy, eyePatch: true, darkLegs: true, darkEars: true }, 0.92),
  polarbear: bearish({ top: '#f4f1e6', bottom: '#d8d2c0', accent: '#b8b0a0', neckLen: 0.6, neckR: 0.28, neckAngle: 8, headR: 0.24, snoutLen: 0.3 }, 1.3),
  chimp: ape({ top: '#2c241e', bottom: '#4a3a2e', accent: '#c8a888', ears: 'round', snoutR: 0.17 }, 0.76),
  orangutan: ape({ top: '#a84e1e', bottom: '#d07a38', accent: '#3a2418', ears: 'small', sh: 0.4, snoutR: 0.2 }, 1.02),
  kangaroo: biped({})({ top: '#a87a50', bottom: '#ecd8bc', accent: '#3a2414', pattern: PATTERN.fur, upright: 0.85, L: 1.3, H: 0.95, chest: 0.34, waist: 0.4, legR: 0.2, pawR: 0.2, neckLen: 0.45, neckR: 0.13, neckAngle: 40, headLen: 0.3, headR: 0.16, snoutLen: 0.2, snoutR: 0.1, tailLen: 1.9, tailR: 0.2, arms: 'long', ears: 'long', backSpikes: 0, attack: 'swipe', headScale: 1.2 }, 0.78),
  // ── Herd ──────────────────────────────────────────────
  rabbit: critter({ top: '#b8aa98', bottom: '#f4eee4', accent: '#e8a8a0', ears: 'long', snoutLen: 0.1, snoutR: 0.11, H: 0.62, legR: 0.09, tailR: 0.14 }, 0.42),
  pig: bovine({ top: '#eba69a', bottom: '#f6c8bc', accent: '#c8807a', dark: '#6a4a44', pattern: PATTERN.fur, ears: 'pointy', tail: 'thin', tailLen: 0.3, H: 0.6, snoutLen: 0.28, snoutR: 0.17, headScale: 1.3 }, 0.6),
  goat: hoofed({ top: '#d8d0c0', bottom: '#f0ece0', accent: '#5a4a3a', hornStyle: 'goat', neckLen: 0.5, neckR: 0.18, neckAngle: 38, H: 1.0, L: 1.9, pattern: PATTERN.shaggy, tail: 'bob', tailLen: 0.2, tailR: 0.07 }, 0.58),
  ram: hoofed({ top: '#a89878', bottom: '#d8c8a8', accent: '#6a5a42', hornStyle: 'ram', neckLen: 0.46, neckR: 0.22, neckAngle: 30, H: 1.0, L: 1.9, rump: 0.48, waist: 0.46, chest: 0.5, pattern: PATTERN.shaggy, tail: 'bob', tailLen: 0.2, tailR: 0.08 }, 0.76),
  llama: hoofed({ top: '#d8c4a0', bottom: '#f0e6d0', accent: '#8a6a48', neckLen: 1.15, neckR: 0.16, neckAngle: 72, pattern: PATTERN.shaggy, tail: 'bob', tailLen: 0.25, tailR: 0.09, snoutLen: 0.25, attack: 'spit' }, 0.6),
  deer: hoofed({ top: '#a8743e', bottom: '#f0e0c8', accent: '#d8c8a8', pattern: PATTERN.spots, patternCol: '#f0e4cc', antlerKind: 'deer', tail: 'bob', tailLen: 0.2, tailR: 0.07, L: 1.9 }, 0.62),
  armadillo: critter({ top: '#a08a70', bottom: '#d8c0a8', accent: '#6a5a48', shell: true, snoutLen: 0.32, snoutR: 0.09, ears: 'pointy', tail: 'long', tailLen: 0.8, tailR: 0.1, pattern: PATTERN.scales }, 0.5),
  porcupine: critter({ top: '#3a3028', bottom: '#6a5a48', accent: '#efe8d8', quills: true, attack: 'spit' }, 0.5),
  skunk: critter({ top: '#14141a', bottom: '#14141a', accent: '#f4f0e8', stripeBack: true, tail: 'bushy', tailLen: 0.8, tailR: 0.2, tailUp: true, ears: 'small', attack: 'spit' }, 0.46),
  zebra: hoofed({ top: '#f2f0ea', bottom: '#f6f4ee', accent: '#141418', pattern: PATTERN.stripes, patternCol: '#141418', stripesAll: true, neckMane: true }, 0.85),
  horse: hoofed({ top: '#6a3e1e', bottom: '#8a5a32', accent: '#1a100a', neckMane: true, tailLen: 1.15, tailR: 0.08 }, 0.9),
  unicorn: hoofed({ top: '#f4f0fa', bottom: '#ffffff', accent: '#e8a0e0', glowCol: '#d0a0ff', bodyGlow: 0.2, neckMane: true, hornStyle: 'unicorn', tailLen: 1.2, tailR: 0.09, dark: '#c8a040' }, 0.98),
  bison: bovine({ top: '#3a2a1c', bottom: '#5a4430', accent: '#2a1c12', hornStyle: 'bull', hump: true, shag: true, pattern: PATTERN.shaggy, chest: 0.72, rump: 0.48, waist: 0.5, sh: 0.3 }, 1.15),
  bull: bovine({ top: '#2a1e1a', bottom: '#46342c', accent: '#d0c0a0', hornStyle: 'bull', pattern: PATTERN.fur }, 1.1),
  moose: hoofed({ top: '#4a3626', bottom: '#6a5240', accent: '#a89878', antlerKind: 'moose', H: 1.45, neckLen: 0.5, neckR: 0.3, neckAngle: 30, rump: 0.5, waist: 0.5, chest: 0.62, sh: 0.2, snoutR: 0.18, headLen: 0.5, tail: 'bob', tailLen: 0.2, tailR: 0.06, pattern: PATTERN.shaggy }, 1.15),
  camel: hoofed({ top: '#c8a06a', bottom: '#e6cca0', accent: '#8a6a40', hump: true, neckLen: 1.1, neckR: 0.17, neckAngle: 58, H: 1.5, snoutLen: 0.32, snoutR: 0.14, attack: 'spit' }, 1.0),
  hippo: bovine({ top: '#6a5a62', bottom: '#b09aa0', accent: '#d8c0c0', pattern: PATTERN.hide, H: 0.72, L: 2.3, rump: 0.72, waist: 0.76, chest: 0.76, sh: 0, legR: 0.22, pawR: 0.24, neckLen: 0.25, neckR: 0.5, headLen: 0.42, headR: 0.42, snoutLen: 0.55, snoutR: 0.36, tail: 'thin', tailLen: 0.4, ears: 'small', tusks: 'small', attack: 'bite', headScale: 1.05 }, 1.5),
  giraffe: hoofed({ top: '#e0b868', bottom: '#f4e6c0', accent: '#7a4a1e', pattern: PATTERN.spots, patternCol: '#7a4a1e', neckLen: 2.5, neckR: 0.17, neckAngle: 72, H: 1.75, L: 2, sh: 0.45, ossicones: true, neckMane: true, legR: 0.08 }, 1.15),
  // ── Reptiles ──────────────────────────────────────────
  iguana: lizard({ top: '#4a8a3a', bottom: '#b8d080', accent: '#2a5a20', backSpikes: 12, snoutLen: 0.22, attack: 'swipe' }, 0.5),
  komodo: lizard({ top: '#5a5a48', bottom: '#a8a088', accent: '#3a3a2c', snoutLen: 0.42, H: 0.5, rump: 0.36, waist: 0.4, chest: 0.42 }, 1.05),
  turtle: critter({ top: '#3a4a2a', bottom: '#b8b080', accent: '#2a3420', shell: true, pattern: PATTERN.scales, ears: undefined, snoutLen: 0.14, snoutR: 0.13, neckLen: 0.4, neckR: 0.16, neckAngle: 12, H: 0.42, legR: 0.13, pawR: 0.16, sprawl: 0.4, tail: 'thin', tailLen: 0.5, tailR: 0.09 }, 0.8),
  rattlesnake: snake({ top: '#8a6a3e', bottom: '#e0cc98', accent: '#4a3620', dark: '#2a1e10', noHood: true, rattle: true, patternCol: '#3a2a18' }, 0.92),
  python: snake({ top: '#5a4a22', bottom: '#d8c888', accent: '#2a2410', noHood: true }, 1.5),
  // ── Birds ─────────────────────────────────────────────
  bat: flyer({ top: '#2a2028', bottom: '#4a3a42', accent: '#3a2a32', dark: '#d8d0c8', wings: 'bat', wingSpan: 4.4, pattern: PATTERN.shaggy, snoutLen: 0.08, ears: 'pointy', tailLen: 0.1, tailR: 0.05 }, 0.45),
  falcon: flyer({ top: '#3a4858', bottom: '#d8d0c0', accent: '#f0e8d8', dark: '#e8b020', wingSpan: 4.2, chest: 0.4, waist: 0.34, rump: 0.28 }, 0.48),
  parrot: flyer({ top: '#d0201a', bottom: '#2060d0', accent: '#f0d020', dark: '#2a2420', wingSpan: 3.6, tail: 'long', tailLen: 1.5, tailR: 0.14, snoutR: 0.12, snoutLen: 0.2 }, 0.5),
  owl: flyer({ top: '#6a5238', bottom: '#d8c8a8', accent: '#a88a60', dark: '#2a2420', headR: 0.34, headLen: 0.2, snoutLen: 0.08, neckLen: 0.1, wingSpan: 4, chest: 0.5, ears: 'pointy', bigEyes: true }, 0.62),
  vulture: flyer({ top: '#2a2420', bottom: '#4a3e34', accent: '#d8a8a0', dark: '#c8a860', neckLen: 0.55, neckR: 0.09, headR: 0.15, wingSpan: 5 }, 0.75),
  penguin: groundBird({ top: '#16161e', bottom: '#f4f2ea', accent: '#f0c030', dark: '#e8a020', upright: 1.25, L: 0.8, chest: 0.42, waist: 0.46, H: 0.42, legR: 0.09, pawR: 0.16, neckLen: 0.14, neckR: 0.2, neckAngle: 0, headLen: 0.24, headR: 0.2, snoutLen: 0.16, tailLen: 0.1, tailR: 0.1, arms: 'flipper' }, 0.55),
  flamingo: groundBird({ top: '#ff7a9a', bottom: '#ffb0c0', accent: '#ffc0d0', dark: '#2a1a1a', H: 1.5, chest: 0.3, waist: 0.3, L: 0.9, legR: 0.045, neckLen: 1.15, neckR: 0.06, headLen: 0.18, headR: 0.09, snoutLen: 0.2 }, 0.62),
  ostrich: groundBird({ top: '#1e1a18', bottom: '#d8d0c0', accent: '#d8b8a8', dark: '#c89070', neckR: 0.08 }, 0.82),
  // ── Rare ──────────────────────────────────────────────
  chameleon: lizard({ top: '#3fb06a', bottom: '#d8f0a0', accent: '#ff5a8a', rainbow: 0.6, glowCol: '#ffffff', H: 0.55, snoutLen: 0.2, snoutR: 0.13, headR: 0.25, bigEyes: true, backSpikes: 10, tail: 'long', tailLen: 1.3, tailR: 0.14, sprawl: 0.35 }, 0.68),
  jackalope: critter({ top: '#c8a060', bottom: '#fff4d8', accent: '#ffc53d', ears: 'long', antlerKind: 'deer', glowCol: '#ffd860', bodyGlow: 0.3, snoutLen: 0.1, snoutR: 0.11, H: 0.68, legR: 0.09, tailR: 0.14 }, 0.54),
  scarab: insect({ top: '#f0b818', bottom: '#a8701a', accent: '#ffd860', glowCol: '#ffc53d', bodyGlow: 0.5, shell: true, rump: 0.6, chest: 0.44, headR: 0.3, antennae: 0.4, mandibles: 0.4, bugHorn: 0.5 }, 0.76),
  queenant: insect({ top: '#7a1e6a', bottom: '#b03a8a', accent: '#ffd860', glowCol: '#ff70d0', bodyGlow: 0.3, rump: 0.72, waist: 0.14, chest: 0.3, headR: 0.32, mandibles: 0.5, L: 2.3, crown: true }, 1.02),
  stormraptor: raptor({ top: '#2848c0', bottom: '#b8d8ff', accent: '#ffe040', patternCol: '#ffe040', glowCol: '#8fd8ff', bodyGlow: 0.7, crest: 0.6 }, 0.92),
  ghosttiger: cat({ top: '#e8f4ff', bottom: '#ffffff', accent: '#60c8ff', pattern: PATTERN.stripes, patternCol: '#2890e0', stripesAll: true, glowCol: '#80e0ff', bodyGlow: 0.6 }, 1.08),
  aurorafox: dog({ top: '#e8f0ff', bottom: '#ffffff', accent: '#70ffd0', rainbow: 0.35, glowCol: '#90ffe0', bodyGlow: 0.35, snoutR: 0.09, tailR: 0.2, tailLen: 1.5, legR: 0.1 }, 0.92),
  sunfirerex: theropod({ top: '#c85a10', bottom: '#ffd870', accent: '#ffd020', patternCol: '#ffa020', glowCol: '#ff8a20', bodyGlow: 0.75, backSpikes: 16, arms: 'tiny', headScale: 1.2, browHorns: 0.4 }, 2.0),
  narwhal: fish({ top: '#7a9ab0', bottom: '#f0f6fa', accent: '#3a5a70', glowCol: '#a8ecff', bodyGlow: 0.2, tusk: true, snoutLen: 0.2, snoutR: 0.26, headR: 0.42, L: 2.8 }, 1.08),
  starwhale: fish({ top: '#1a2268', bottom: '#b8c8ff', accent: '#ffe080', pattern: PATTERN.spots, patternCol: '#fff4c0', glowCol: '#a8c0ff', bodyGlow: 0.5, rainbow: 0.12, chest: 0.72, waist: 0.64, headR: 0.56, snoutLen: 0.3, snoutR: 0.34 }, 2.5),
  // ── Sea ───────────────────────────────────────────────
  seal: lizard({ top: '#6a7078', bottom: '#d0d4d8', accent: '#3a4048', pattern: PATTERN.fur, H: 0.3, rump: 0.28, waist: 0.42, chest: 0.42, sprawl: 0.8, snoutLen: 0.14, snoutR: 0.14, headR: 0.26, tail: 'thick', tailLen: 0.7, tailR: 0.22, legR: 0.08, pawR: 0.16 }, 0.6),
  walrus: lizard({ top: '#8a6a52', bottom: '#c8a88a', accent: '#5a4432', pattern: PATTERN.hide, H: 0.34, rump: 0.5, waist: 0.68, chest: 0.72, L: 2, sprawl: 0.7, snoutLen: 0.18, snoutR: 0.24, headR: 0.3, tusks: 'long', tail: 'thick', tailLen: 0.7, tailR: 0.3, attack: 'gore' }, 1.12),
  piranha: fish({ top: '#4a5a4a', bottom: '#e8402a', accent: '#2a3a2a', L: 1.6, chest: 0.6, waist: 0.5, headR: 0.5, snoutLen: 0.22, snoutR: 0.34, tailLen: 0.7, tailR: 0.45 }, 0.42),
  shark: fish({}, 1.05),
  hammerhead: fish({ top: '#6a7a82', hammer: true, snoutLen: 0.3 }, 1.0),
  orca: fish({ top: '#101218', bottom: '#f4f4f0', accent: '#0a0a10', chest: 0.68, waist: 0.62, headR: 0.5, snoutLen: 0.32, snoutR: 0.3, whitePatch: true }, 1.5),
  megalodon: fish({ top: '#3a4a50', bottom: '#d8dcd8', accent: '#20282c', chest: 0.72, waist: 0.62, headR: 0.54, snoutLen: 0.6, snoutR: 0.34, headLen: 0.8 }, 2.0),
};

export const ALL_LOOKS: Record<string, Look> = { ...LOOKS, ...MORE_LOOKS };
