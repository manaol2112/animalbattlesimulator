// Campaign: six biomes, six stages each, ending in a boss.
import { getSpecies } from './species';

export type BiomeId = 'savanna' | 'jungle' | 'tundra' | 'primeval' | 'caldera' | 'starfall';

export interface EnemySpec { id: string; level: number; boss?: boolean; n?: number; }

export interface Stage {
  index: number;
  name: string;
  biome: BiomeId;
  enemies: EnemySpec[];
  xp: number;
  gold: number;
  boss: boolean;
}

export const BIOMES: Record<BiomeId, { name: string; blurb: string; accent: string }> = {
  savanna: { name: 'Sunscorch Savanna', blurb: 'Golden grass and long shadows. Everything here hunts.', accent: '#f0a64a' },
  jungle: { name: 'Whisperwood', blurb: 'Light breaks through the canopy. The trees are watching.', accent: '#5fd17a' },
  tundra: { name: 'Frostfang Reach', blurb: 'Under the aurora, only the massive survive.', accent: '#7fd6ff' },
  primeval: { name: 'Lost Valley', blurb: 'Ferns taller than houses. Something huge is breathing nearby.', accent: '#a4d65e' },
  caldera: { name: 'Emberfall Caldera', blurb: 'Rivers of magma and a sky full of ash.', accent: '#ff6a3d' },
  starfall: { name: 'Starfall Ruins', blurb: 'Where the first beasts fell from the sky.', accent: '#b78cff' },
};

type Raw = [name: string, enemies: EnemySpec[]];
const e = (id: string, level: number, n = 1): EnemySpec => ({ id, level, n });
const boss = (id: string, level: number): EnemySpec => ({ id, level, boss: true });

const CAMPAIGN: [BiomeId, Raw[]][] = [
  ['savanna', [
    ['First Scuffle', [e('hyena', 1, 2)]],
    ['Tusk Valley', [e('boar', 1, 2), e('fox', 1)]],
    ['The Spitting Grass', [e('cobra', 2, 2), e('zebra', 2)]],
    ['Badlands Brawl', [e('badger', 3, 2), e('hyena', 3, 2), e('rattlesnake', 3)]],
    ['Sunset Ridge', [e('lion', 3), e('cheetah', 2), e('hyena', 3, 2)]],
    ['The Lion Sovereign', [boss('lion', 5), e('hyena', 4, 3)]],
  ]],
  ['jungle', [
    ['Green Dark', [e('ant', 5, 4), e('tarantula', 4)]],
    ['Canopy Talons', [e('eagle', 5, 2), e('bat', 5, 2), e('wasp', 4)]],
    ['River of Teeth', [e('croc', 6, 2), e('piranha', 6, 3)]],
    ['Silverback Ridge', [e('gorilla', 7), e('chimp', 6, 2)]],
    ['Stingers Below', [e('scorpion', 8, 2), e('mantis', 7), e('stagbeetle', 7)]],
    ['The Elder Ape', [boss('gorilla', 8), e('eagle', 7), e('wasp', 7, 2)]],
  ]],
  ['tundra', [
    ['Whiteout', [e('wolf', 12, 4), e('penguin', 12, 2), e('bear', 11)]],
    ['Grizzly Tracks', [e('bear', 12, 2), e('wolf', 12, 3)]],
    ['Tooth and Ice', [e('tiger', 13, 2), e('stag', 12), e('wolf', 12, 2)]],
    ['Saber Hollow', [e('sabertooth', 13), e('moose', 13, 2)]],
    ['Herd of Giants', [e('polarbear', 14), e('walrus', 14), e('stag', 14)]],
    ['The Glacier King', [boss('mammoth', 13), e('wolf', 13, 3)]],
  ]],
  ['primeval', [
    ['Raptor Run', [e('velociraptor', 16, 4), e('compy', 16, 3)]],
    ['Crested Marsh', [e('dilophosaurus', 16, 2), e('parasaur', 16), e('iguanodon', 16)]],
    ['Plates and Horns', [e('stegosaurus', 17), e('styracosaurus', 17), e('pachy', 17)]],
    ['Shadow of Wings', [e('pteranodon', 17, 2), e('utahraptor', 17, 2)]],
    ['Three-Horn Stampede', [e('triceratops', 18), e('ankylosaurus', 18)]],
    ['The Tyrant King', [boss('trex', 17), e('velociraptor', 17, 2)]],
  ]],
  ['caldera', [
    ['Ash Road', [e('rhino', 17), e('scorpion', 17, 3)]],
    ['The Burning Pack', [e('sabertooth', 16, 2), e('tiger', 16)]],
    ['Earthshakers', [e('elephant', 18), e('stag', 18), e('tiger', 18)]],
    ['Tyrant Crater', [e('allosaurus', 20), e('carnotaurus', 18)]],
    ['Storm over Magma', [e('roc', 20), e('elephant', 20), e('sabertooth', 20)]],
    ['Wings of the Sun', [boss('phoenix', 18), e('sabertooth', 17)]],
  ]],
  ['starfall', [
    ['Shattered Steps', [e('mammoth', 23), e('roc', 22), e('tiger', 23, 2)]],
    ['Twin Tyrants', [e('giganotosaurus', 23), e('spinosaurus', 22)]],
    ['Winter Falls Upward', [e('wyrm', 24), e('sabertooth', 24, 2)]],
    ['Sky Burial', [e('phoenix', 24), e('quetzalcoatlus', 24), e('elephant', 24)]],
    ['The Last Herd', [e('wyrm', 25), e('brachiosaurus', 24)]],
    ['Beastfall', [boss('dragon', 21), e('phoenix', 20)]],
  ]],
];

export const STAGES: Stage[] = (() => {
  const out: Stage[] = [];
  for (const [biome, raws] of CAMPAIGN) {
    for (const [name, enemies] of raws) {
      const index = out.length;
      const isBoss = enemies.some((x) => x.boss);
      out.push({
        index, name, biome, enemies,
        xp: Math.round((55 + index * 30) * (isBoss ? 1.4 : 1)),
        gold: Math.round((60 + index * 34) * (isBoss ? 1.8 : 1)),
        boss: isBoss,
      });
    }
  }
  return out;
})();

/**
 * Rows of evenly spaced spots, in a square-ish block starting `startZ` from the midline.
 * Rows are always centred and everything stays inside the deployment circle.
 */
export function gridFormation(n: number, spacing: number, rowGap: number, startZ: number, limit = 31): [number, number][] {
  const perRow = Math.max(3, Math.ceil(Math.sqrt(n * 1.7)));
  const spots: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    let x = ((i % perRow) - (inRow - 1) / 2) * spacing;
    let z = startZ + row * rowGap;
    const r = Math.hypot(x, z);
    if (r > limit) { x *= limit / r; z *= limit / r; }
    spots.push([x, z]);
  }
  return spots;
}

/** Expands a stage into enemy placements in formation (negative z half). */
export function stageFormation(stage: Stage): { speciesId: string; level: number; boss: boolean; x: number; z: number }[] {
  const units: { speciesId: string; level: number; boss: boolean; radius: number }[] = [];
  for (const spec of stage.enemies) {
    for (let i = 0; i < (spec.n ?? 1); i++) {
      units.push({ speciesId: spec.id, level: spec.level, boss: !!spec.boss, radius: getSpecies(spec.id).radius });
    }
  }
  // Big and tough up front, ranged at the back.
  units.sort((a, b) => Number(!!getSpecies(a.speciesId).ranged) - Number(!!getSpecies(b.speciesId).ranged) || b.radius - a.radius);
  const spots = gridFormation(units.length, 4.5, 5, 12);
  const out = units.map((u, i) => ({ speciesId: u.speciesId, level: u.level, boss: u.boss, x: spots[i][0], z: -spots[i][1] }));
  return out;
}
