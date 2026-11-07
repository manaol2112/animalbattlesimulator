// Visual definition of each species: body proportions, colours, features.
export type Plan = 'quad' | 'rex' | 'snake' | 'scorpion' | 'bird' | 'insect' | 'fish' | 'centipede';

export const PATTERN = { fur: 0, stripes: 1, spots: 2, scales: 3, feather: 4, chitin: 5, shaggy: 6, hide: 7 } as const;

export interface Look {
  plan: Plan;
  top: string; bottom: string; accent: string; dark: string;
  pattern: number; patternCol?: string; glowCol?: string; bodyGlow?: number;
  L: number; H: number; rump: number; waist: number; chest: number; sh: number;
  legFront: number; legRear: number; legR: number; pawR: number; legSpread?: number; sprawl?: number; hoof?: boolean;
  headScale?: number;
  neckLen: number; neckR: number; neckAngle: number; neckSegs?: number;
  headLen: number; headR: number; snoutLen: number; snoutR: number;
  ears?: 'pointy' | 'round' | 'big' | 'small' | 'long';
  modelScale?: number;
  stripesAll?: boolean; eyePatch?: boolean; darkLegs?: boolean; darkEars?: boolean; bigEyes?: boolean;
  hornStyle?: 'bull' | 'ram' | 'goat' | 'unicorn'; antlerKind?: 'deer' | 'moose'; neckMane?: boolean; ossicones?: boolean;
  quills?: boolean; shell?: boolean; tailUp?: boolean; beak?: boolean; crest?: number; crestStyle?: 'tube' | 'twin'; frillNeck?: boolean; dome?: boolean;
  sail?: number; plates?: number; armorPlates?: boolean; tailSpikes?: boolean; tailClub?: boolean;
  frill?: number; frillSpikes?: boolean; noseHorn?: number; browHorns?: number;
  arms?: 'tiny' | 'claw' | 'long' | 'none' | 'scythe' | 'flipper'; upright?: number; sickle?: boolean; thumbSpike?: boolean;
  antennae?: number; mandibles?: number; bugHorn?: number; flyingBug?: boolean; wingKind?: 'clear' | 'butterfly' | 'long'; stinger?: boolean;
  glowTail?: boolean; hindLong?: boolean; raptorial?: boolean;
  spider?: boolean; hourglass?: boolean; crab?: boolean; noHood?: boolean; rattle?: boolean;
  hammer?: boolean; whitePatch?: boolean; flippers?: boolean; tusk?: boolean; crown?: boolean;
  /** Shifting rainbow colours, from 0 to 1. */
  rainbow?: number;
  mane?: boolean; tusks?: 'small' | 'long' | 'mammoth'; rhinoHorn?: boolean; antlers?: boolean; trunk?: boolean;
  sabers?: boolean; hump?: boolean; backSpikes?: number; horns?: boolean; shag?: boolean; silverback?: boolean; stripeBack?: boolean;
  tail: 'thin' | 'tuft' | 'bushy' | 'thick' | 'long' | 'bob'; tailLen: number; tailR: number;
  wings?: 'bat' | 'feather'; wingSpan?: number;
  attack: 'bite' | 'swipe' | 'gore' | 'slam' | 'spit';
}

const quad = (o: Partial<Look> & Pick<Look, 'top' | 'bottom' | 'L' | 'H' | 'rump' | 'waist' | 'chest'>): Look => ({
  plan: 'quad', accent: '#222', dark: '#1a1512', pattern: PATTERN.fur, sh: 0.05,
  legFront: o.H, legRear: o.H, legR: 0.08, pawR: 0.09,
  neckLen: 0.4, neckR: 0.14, neckAngle: 30, headLen: 0.3, headR: 0.14, snoutLen: 0.22, snoutR: 0.08,
  tail: 'thin', tailLen: 0.6, tailR: 0.05, attack: 'bite', ...o,
});

export const LOOKS: Record<string, Look> = {
  wolf: quad({ top: '#5f6772', bottom: '#d8dbe0', accent: '#2a2d33', pattern: PATTERN.shaggy,
    L: 1.3, H: 0.66, rump: 0.22, waist: 0.17, chest: 0.27, sh: 0.05, legR: 0.066, pawR: 0.085,
    neckLen: 0.42, neckR: 0.14, neckAngle: 32, headLen: 0.26, headR: 0.13, snoutLen: 0.27, snoutR: 0.065,
    ears: 'pointy', tail: 'bushy', tailLen: 0.7, tailR: 0.07 }),
  boar: quad({ top: '#4c3a30', bottom: '#8c7160', accent: '#1f1612', pattern: PATTERN.shaggy,
    L: 1.25, H: 0.42, rump: 0.3, waist: 0.32, chest: 0.42, sh: 0.1, legR: 0.07, pawR: 0.07, hoof: true,
    neckLen: 0.22, neckR: 0.24, neckAngle: -5, headLen: 0.32, headR: 0.2, snoutLen: 0.3, snoutR: 0.11,
    ears: 'small', tusks: 'small', tail: 'thin', tailLen: 0.28, tailR: 0.025, attack: 'gore' }),
  badger: quad({ top: '#5e5a54', bottom: '#17161a', accent: '#17161a', pattern: PATTERN.shaggy, stripeBack: true,
    L: 1.0, H: 0.28, rump: 0.25, waist: 0.25, chest: 0.26, sh: 0, legR: 0.06, pawR: 0.08,
    neckLen: 0.14, neckR: 0.16, neckAngle: 5, headLen: 0.2, headR: 0.14, snoutLen: 0.15, snoutR: 0.07,
    ears: 'small', tail: 'thick', tailLen: 0.32, tailR: 0.07, attack: 'swipe' }),
  lion: quad({ top: '#c6964b', bottom: '#efdcb0', accent: '#7f4a22', pattern: PATTERN.fur,
    L: 1.75, H: 0.84, rump: 0.32, waist: 0.26, chest: 0.4, sh: 0.08, legR: 0.11, pawR: 0.15,
    neckLen: 0.42, neckR: 0.22, neckAngle: 28, headLen: 0.3, headR: 0.23, snoutLen: 0.14, snoutR: 0.125,
    ears: 'round', mane: true, tail: 'tuft', tailLen: 0.95, tailR: 0.04, attack: 'swipe' }),
  croc: quad({ top: '#3f5029', bottom: '#c0ba86', accent: '#28341a', pattern: PATTERN.scales, backSpikes: 14,
    L: 2.1, H: 0.34, rump: 0.3, waist: 0.34, chest: 0.34, sh: -0.02, legFront: 0.34, legRear: 0.34, legR: 0.08, pawR: 0.1, sprawl: 0.6,
    neckLen: 0.2, neckR: 0.24, neckAngle: 0, headLen: 0.38, headR: 0.2, snoutLen: 0.72, snoutR: 0.11,
    tail: 'long', tailLen: 2.3, tailR: 0.26 }),
  gorilla: quad({ top: '#26262c', bottom: '#4a4a54', accent: '#b3b6c0', pattern: PATTERN.shaggy, silverback: true,
    L: 1.35, H: 0.78, rump: 0.5, waist: 0.5, chest: 0.72, sh: 0.62, legFront: 1.5, legRear: 0.78, legR: 0.2, pawR: 0.26, legSpread: 0.74,
    neckLen: 0.34, neckR: 0.3, neckAngle: 40, headLen: 0.34, headR: 0.27, snoutLen: 0.14, snoutR: 0.2,
    ears: 'small', tail: 'bob', tailLen: 0.02, tailR: 0.02, attack: 'slam' }),
  bear: quad({ top: '#55351f', bottom: '#7f5b3e', accent: '#2c1a0e', pattern: PATTERN.shaggy,
    L: 2.0, H: 0.9, rump: 0.58, waist: 0.56, chest: 0.66, sh: 0.2, legR: 0.18, pawR: 0.22,
    neckLen: 0.36, neckR: 0.36, neckAngle: 14, headLen: 0.42, headR: 0.29, snoutLen: 0.24, snoutR: 0.14,
    ears: 'round', tail: 'bob', tailLen: 0.15, tailR: 0.08, attack: 'swipe' }),
  tiger: quad({ top: '#e8852a', bottom: '#f6ecd9', accent: '#17110d', pattern: PATTERN.stripes, patternCol: '#17110d',
    L: 1.9, H: 0.8, rump: 0.33, waist: 0.27, chest: 0.4, sh: 0.06, legR: 0.11, pawR: 0.155,
    neckLen: 0.42, neckR: 0.2, neckAngle: 22, headLen: 0.3, headR: 0.22, snoutLen: 0.13, snoutR: 0.12,
    ears: 'round', tail: 'long', tailLen: 1.2, tailR: 0.05, attack: 'swipe' }),
  stag: quad({ top: '#8b6946', bottom: '#ebdfc8', accent: '#67ffb0', pattern: PATTERN.spots, patternCol: '#f3e8d2', glowCol: '#67ffb0',
    L: 1.7, H: 1.1, rump: 0.28, waist: 0.24, chest: 0.31, sh: 0.06, legR: 0.055, pawR: 0.06, hoof: true,
    neckLen: 0.72, neckR: 0.13, neckAngle: 52, headLen: 0.3, headR: 0.13, snoutLen: 0.24, snoutR: 0.07,
    ears: 'pointy', antlers: true, tail: 'bob', tailLen: 0.18, tailR: 0.06, attack: 'gore' }),
  sabertooth: quad({ top: '#ae8454', bottom: '#ecddc0', accent: '#5b4023', pattern: PATTERN.spots, patternCol: '#6b4a28',
    L: 2.2, H: 1.0, rump: 0.38, waist: 0.34, chest: 0.5, sh: 0.2, legFront: 1.1, legRear: 0.92, legR: 0.14, pawR: 0.17,
    neckLen: 0.44, neckR: 0.27, neckAngle: 24, headLen: 0.36, headR: 0.26, snoutLen: 0.16, snoutR: 0.15,
    ears: 'small', sabers: true, tail: 'bob', tailLen: 0.25, tailR: 0.06, attack: 'swipe' }),
  rhino: quad({ headScale: 1.05, top: '#74767b', bottom: '#a8aaae', accent: '#393a3e', pattern: PATTERN.hide,
    L: 2.8, H: 0.95, rump: 0.68, waist: 0.68, chest: 0.76, sh: 0.1, legR: 0.22, pawR: 0.25, hoof: true,
    neckLen: 0.4, neckR: 0.42, neckAngle: -8, headLen: 0.6, headR: 0.34, snoutLen: 0.5, snoutR: 0.24,
    ears: 'pointy', rhinoHorn: true, tail: 'thin', tailLen: 0.45, tailR: 0.035, attack: 'gore' }),
  elephant: quad({ headScale: 1.0, top: '#6f7076', bottom: '#9b9ca2', accent: '#55565c', pattern: PATTERN.hide,
    L: 3.0, H: 1.75, rump: 0.98, waist: 0.98, chest: 1.05, sh: 0.1, legR: 0.34, pawR: 0.39,
    neckLen: 0.36, neckR: 0.62, neckAngle: 8, headLen: 0.7, headR: 0.56, snoutLen: 0.2, snoutR: 0.34,
    ears: 'big', tusks: 'long', trunk: true, tail: 'thin', tailLen: 0.9, tailR: 0.04, attack: 'gore' }),
  mammoth: quad({ headScale: 1.0, top: '#5a3b23', bottom: '#8a6544', accent: '#9ce4ff', pattern: PATTERN.shaggy, glowCol: '#8fe6ff',
    L: 3.3, H: 1.9, rump: 1.05, waist: 1.15, chest: 1.3, sh: 0.3, legR: 0.4, pawR: 0.45,
    neckLen: 0.34, neckR: 0.7, neckAngle: 0, headLen: 0.72, headR: 0.62, snoutLen: 0.22, snoutR: 0.36,
    ears: 'small', tusks: 'mammoth', trunk: true, hump: true, shag: true, tail: 'tuft', tailLen: 0.8, tailR: 0.05, attack: 'gore' }),
  dragon: quad({ headScale: 1.05, top: '#7c1d17', bottom: '#e6a252', accent: '#2e0c0a', pattern: PATTERN.scales, patternCol: '#ff7a2e', glowCol: '#ff6a1f', bodyGlow: 0.35,
    L: 3.3, H: 1.35, rump: 0.72, waist: 0.68, chest: 0.92, sh: 0.25, legR: 0.21, pawR: 0.26,
    neckLen: 2.2, neckR: 0.4, neckAngle: 42, neckSegs: 3, headLen: 0.72, headR: 0.34, snoutLen: 0.65, snoutR: 0.19,
    horns: true, backSpikes: 20, tail: 'long', tailLen: 4.0, tailR: 0.42, wings: 'bat', wingSpan: 5.4, attack: 'bite' }),
  wyrm: quad({ headScale: 1.05, top: '#5a9bc8', bottom: '#eaf8ff', accent: '#20486a', pattern: PATTERN.scales, patternCol: '#bff2ff', glowCol: '#7fe4ff', bodyGlow: 0.25,
    L: 3.0, H: 1.2, rump: 0.62, waist: 0.58, chest: 0.82, sh: 0.2, legR: 0.18, pawR: 0.22,
    neckLen: 2.5, neckR: 0.34, neckAngle: 44, neckSegs: 3, headLen: 0.66, headR: 0.3, snoutLen: 0.6, snoutR: 0.16,
    horns: true, backSpikes: 22, tail: 'long', tailLen: 4.4, tailR: 0.36, wings: 'bat', wingSpan: 5.0, attack: 'bite' }),
  trex: { plan: 'rex', headScale: 1.05, top: '#47573a', bottom: '#c9b98a', accent: '#23291a', dark: '#141810', pattern: PATTERN.scales,
    L: 3.2, H: 2.1, rump: 0.72, waist: 0.68, chest: 0.72, sh: 0.1, legFront: 0, legRear: 2.1, legR: 0.34, pawR: 0.34,
    neckLen: 0.7, neckR: 0.42, neckAngle: 22, headLen: 0.82, headR: 0.42, snoutLen: 0.86, snoutR: 0.26,
    backSpikes: 16, tail: 'long', tailLen: 3.4, tailR: 0.5, attack: 'bite' },
  eagle: { plan: 'bird', top: '#4a3423', bottom: '#8a6a4b', accent: '#f4f1e8', dark: '#e0a11c', pattern: PATTERN.feather,
    L: 1.0, H: 0, rump: 0.2, waist: 0.24, chest: 0.28, sh: 0, legFront: 0.3, legRear: 0.3, legR: 0.03, pawR: 0.08,
    neckLen: 0.22, neckR: 0.13, neckAngle: 20, headLen: 0.16, headR: 0.12, snoutLen: 0.14, snoutR: 0.05,
    tail: 'thin', tailLen: 0.5, tailR: 0.14, wings: 'feather', wingSpan: 2.4, attack: 'swipe' },
  roc: { plan: 'bird', top: '#2f3f73', bottom: '#90b4ff', accent: '#ffeb70', dark: '#ffd84a', pattern: PATTERN.feather, glowCol: '#8fd0ff', bodyGlow: 0.3,
    L: 1.9, H: 0, rump: 0.38, waist: 0.46, chest: 0.52, sh: 0, legFront: 0.5, legRear: 0.5, legR: 0.06, pawR: 0.13,
    neckLen: 0.4, neckR: 0.24, neckAngle: 22, headLen: 0.3, headR: 0.22, snoutLen: 0.28, snoutR: 0.08,
    tail: 'thin', tailLen: 1.1, tailR: 0.3, wings: 'feather', wingSpan: 4.8, attack: 'spit' },
  phoenix: { plan: 'bird', top: '#e8320c', bottom: '#ff9a1f', accent: '#ffcf4a', dark: '#ffb300', pattern: PATTERN.feather, glowCol: '#ff7a1a', bodyGlow: 0.9,
    L: 1.8, H: 0, rump: 0.36, waist: 0.42, chest: 0.48, sh: 0, legFront: 0.45, legRear: 0.45, legR: 0.05, pawR: 0.12,
    neckLen: 0.46, neckR: 0.2, neckAngle: 28, headLen: 0.28, headR: 0.2, snoutLen: 0.22, snoutR: 0.07,
    tail: 'long', tailLen: 1.6, tailR: 0.32, wings: 'feather', wingSpan: 4.8, attack: 'spit' },
  cobra: { plan: 'snake', top: '#3b4a22', bottom: '#d9c67f', accent: '#c6ad4c', dark: '#1e2610', pattern: PATTERN.scales,
    L: 1.7, H: 0.75, rump: 0.1, waist: 0.14, chest: 0.13, sh: 0, legFront: 0, legRear: 0, legR: 0, pawR: 0,
    neckLen: 0, neckR: 0.11, neckAngle: 0, headLen: 0.18, headR: 0.1, snoutLen: 0.1, snoutR: 0.06,
    tail: 'thin', tailLen: 0.6, tailR: 0.05, attack: 'spit' },
  scorpion: { plan: 'scorpion', top: '#2a2030', bottom: '#5b4560', accent: '#c37bff', dark: '#120c16', pattern: PATTERN.chitin, glowCol: '#d890ff',
    L: 1.2, H: 0.42, rump: 0.28, waist: 0.34, chest: 0.4, sh: 0, legFront: 0.5, legRear: 0.5, legR: 0.04, pawR: 0.05,
    neckLen: 0, neckR: 0, neckAngle: 0, headLen: 0.2, headR: 0.2, snoutLen: 0, snoutR: 0,
    tail: 'long', tailLen: 1.5, tailR: 0.13, attack: 'gore' },
};
