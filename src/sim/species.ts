// Species catalogue: pure gameplay data, no rendering concerns.

export type AbilityId =
  | 'charge' | 'howl' | 'spit' | 'rage' | 'roar' | 'deathRoll' | 'dive' | 'sting'
  | 'slam' | 'pounce' | 'heal' | 'quake' | 'frostQuake' | 'chain' | 'fireRain'
  | 'fireBreath' | 'frostBreath' | 'tailWhip' | 'swarm'
  | 'cloak' | 'midas' | 'brood' | 'chainDash' | 'shield' | 'lance' | 'phase' | 'meteorStomp' | 'cosmicSong';

export type Role = 'Bruiser' | 'Tank' | 'Hunter' | 'Ranged' | 'Support' | 'Titan' | 'Mythic';

export const GROUPS = ['Dinosaurs', 'Bugs', 'Predators', 'Herd', 'Reptiles', 'Birds', 'Sea', 'Mythic', 'Rare'] as const;
export type Group = (typeof GROUPS)[number];

export interface Species {
  id: string;
  name: string;
  epithet: string;
  group?: Group;
  /** Can't be bought: earned only by finishing its task. */
  rare?: boolean;
  /** What its basic attack looks and feels like on impact. */
  hit?: 'bite' | 'claw' | 'horn' | 'venom' | 'earth';
  /** The projectile a ranged beast fires. */
  shot?: 'venom' | 'bolt' | 'flame' | 'ice';
  tier: 1 | 2 | 3 | 4 | 5;
  role: Role;
  /** Command points needed to field one. */
  cp: number;
  /** Gold cost of the first recruit. */
  price: number;
  hp: number;
  atk: number;
  /** Seconds between basic attacks. */
  cooldown: number;
  armor: number;
  speed: number;
  range: number;
  mass: number;
  radius: number;
  ranged?: boolean;
  flying?: boolean;
  critChance?: number;
  ability: AbilityId;
  abilityCd: number;
  abilityName: string;
  abilityDesc: string;
}

const s = (x: Species): Species => x;

export const SPECIES: Species[] = [
  // ── Tier 1 ──────────────────────────────────────────────
  s({ id: 'wolf', name: 'Wolf', epithet: 'Pack Stalker', tier: 1, role: 'Hunter', cp: 1, price: 60,
    hp: 110, atk: 16, cooldown: 0.9, armor: 5, speed: 6.5, range: 1.3, mass: 40, radius: 0.55, critChance: 0.12,
    ability: 'howl', abilityCd: 12, abilityName: 'Pack Howl', abilityDesc: 'Rallies nearby allies, boosting their attack for 6s.' }),
  s({ id: 'boar', name: 'Boar', epithet: 'Tusked Rammer', tier: 1, role: 'Tank', cp: 1, price: 55,
    hp: 155, atk: 13, cooldown: 1.1, armor: 16, speed: 5.5, range: 1.2, mass: 70, radius: 0.6,
    ability: 'charge', abilityCd: 10, abilityName: 'Tusk Rush', abilityDesc: 'Barrels through the enemy line, flinging anything in the way.' }),
  s({ id: 'cobra', name: 'Cobra', epithet: 'Venom Spitter', tier: 1, role: 'Ranged', cp: 1, price: 70,
    hp: 72, atk: 13, cooldown: 1.4, armor: 0, speed: 4, range: 7, mass: 12, radius: 0.4, ranged: true,
    ability: 'spit', abilityCd: 8, abilityName: 'Toxic Spray', abilityDesc: 'Sprays a fan of venom globs that poison on impact.' }),
  s({ id: 'badger', name: 'Honey Badger', epithet: 'Fearless Brawler', tier: 1, role: 'Bruiser', cp: 1, price: 75,
    hp: 120, atk: 15, cooldown: 0.8, armor: 12, speed: 5.2, range: 1.1, mass: 25, radius: 0.45,
    ability: 'rage', abilityCd: 14, abilityName: 'Bad Attitude', abilityDesc: 'Flies into a rage, attacking faster and stealing life.' }),
  // ── Tier 2 ──────────────────────────────────────────────
  s({ id: 'lion', name: 'Lion', epithet: 'King of the Plain', tier: 2, role: 'Bruiser', cp: 2, price: 180,
    hp: 265, atk: 30, cooldown: 1.0, armor: 15, speed: 6.2, range: 1.6, mass: 190, radius: 0.85,
    ability: 'roar', abilityCd: 13, abilityName: 'Sovereign Roar', abilityDesc: 'A thunderous roar that staggers enemies and fires up allies.' }),
  s({ id: 'croc', name: 'Crocodile', epithet: 'River Ambusher', tier: 2, role: 'Tank', cp: 2, price: 170,
    hp: 345, atk: 26, cooldown: 1.4, armor: 32, speed: 3.9, range: 1.9, mass: 300, radius: 0.85,
    ability: 'deathRoll', abilityCd: 10, abilityName: 'Death Roll', abilityDesc: 'Clamps down and spins, dealing huge damage and stunning.' }),
  s({ id: 'eagle', name: 'Eagle', epithet: 'Sky Hunter', tier: 2, role: 'Hunter', cp: 2, price: 200,
    hp: 150, atk: 25, cooldown: 1.0, armor: 0, speed: 8.2, range: 1.6, mass: 15, radius: 0.6, flying: true, critChance: 0.2,
    ability: 'dive', abilityCd: 8, abilityName: 'Talon Dive', abilityDesc: 'Plummets onto the weakest enemy with a devastating strike.' }),
  s({ id: 'scorpion', name: 'Scorpion', epithet: 'Armored Stinger', tier: 2, role: 'Bruiser', cp: 2, price: 190,
    hp: 240, atk: 17, cooldown: 0.9, armor: 35, speed: 4.6, range: 2.4, mass: 90, radius: 0.72,
    ability: 'sting', abilityCd: 7, abilityName: 'Lethal Sting', abilityDesc: 'A precise sting that floods the target with deadly poison.' }),
  // ── Tier 3 ──────────────────────────────────────────────
  s({ id: 'gorilla', name: 'Gorilla', epithet: 'Silverback', tier: 3, role: 'Bruiser', cp: 3, price: 420,
    hp: 490, atk: 40, cooldown: 1.2, armor: 22, speed: 5.3, range: 1.9, mass: 220, radius: 1.0,
    ability: 'slam', abilityCd: 10, abilityName: 'Ground Pound', abilityDesc: 'Hammers the earth, launching nearby enemies skyward.' }),
  s({ id: 'bear', name: 'Grizzly', epithet: 'Mountain Mauler', tier: 3, role: 'Tank', cp: 3, price: 450,
    hp: 570, atk: 44, cooldown: 1.25, armor: 26, speed: 5, range: 1.9, mass: 380, radius: 1.1,
    ability: 'rage', abilityCd: 16, abilityName: 'Berserk Maul', abilityDesc: 'Enters a frenzy, attacking faster and healing on every hit.' }),
  s({ id: 'tiger', name: 'Tiger', epithet: 'Striped Stalker', tier: 3, role: 'Hunter', cp: 3, price: 460,
    hp: 360, atk: 54, cooldown: 0.95, armor: 12, speed: 7.3, range: 1.8, mass: 220, radius: 0.95, critChance: 0.22,
    ability: 'pounce', abilityCd: 8, abilityName: 'Tiger Pounce', abilityDesc: 'Leaps across the field onto the most vulnerable enemy.' }),
  s({ id: 'stag', name: 'Spirit Stag', epithet: 'Forest Warden', tier: 3, role: 'Support', cp: 3, price: 500,
    hp: 340, atk: 26, cooldown: 1.2, armor: 15, speed: 6, range: 1.6, mass: 170, radius: 0.9,
    ability: 'heal', abilityCd: 7, abilityName: 'Verdant Bloom', abilityDesc: 'Antlers bloom with light, healing all nearby allies.' }),
  // ── Tier 4 ──────────────────────────────────────────────
  s({ id: 'sabertooth', name: 'Sabertooth', epithet: 'Ice Age Ripper', tier: 4, role: 'Hunter', cp: 4, price: 900,
    hp: 700, atk: 92, cooldown: 0.9, armor: 18, speed: 7.5, range: 2.0, mass: 350, radius: 1.1, critChance: 0.25,
    ability: 'pounce', abilityCd: 7, abilityName: 'Saber Pounce', abilityDesc: 'A mighty leap onto the weakest foe.' }),
  s({ id: 'rhino', name: 'Rhinoceros', epithet: 'Living Battering Ram', tier: 4, role: 'Tank', cp: 4, price: 950,
    hp: 1020, atk: 62, cooldown: 1.4, armor: 55, speed: 5.5, range: 2.4, mass: 900, radius: 1.4,
    ability: 'charge', abilityCd: 9, abilityName: 'Rampage', abilityDesc: 'An unstoppable charge that sends whole packs flying.' }),
  s({ id: 'elephant', name: 'War Elephant', epithet: 'Earthshaker', tier: 4, role: 'Titan', cp: 5, price: 1300,
    hp: 1700, atk: 80, cooldown: 1.6, armor: 40, speed: 4.2, range: 3.0, mass: 1800, radius: 1.9,
    ability: 'quake', abilityCd: 11, abilityName: 'Earthshaker', abilityDesc: 'Rears and stomps, cracking the ground in a huge shockwave.' }),
  s({ id: 'trex', name: 'Tyrannosaur', epithet: 'Tyrant Lizard', tier: 4, role: 'Titan', cp: 6, price: 1700,
    hp: 1550, atk: 135, cooldown: 1.4, armor: 30, speed: 5.6, range: 3.2, mass: 1500, radius: 1.7,
    ability: 'roar', abilityCd: 12, abilityName: 'Tyrant Roar', abilityDesc: 'A bone-rattling roar that stuns everything nearby.' }),
  // ── Tier 5 ──────────────────────────────────────────────
  s({ id: 'mammoth', name: 'Frost Mammoth', epithet: 'Glacier Walker', tier: 5, role: 'Titan', cp: 7, price: 2400,
    hp: 2650, atk: 105, cooldown: 1.8, armor: 55, speed: 3.8, range: 3.4, mass: 2600, radius: 2.3,
    ability: 'frostQuake', abilityCd: 10, abilityName: 'Glacial Stomp', abilityDesc: 'A freezing shockwave that launches and chills all it touches.' }),
  s({ id: 'roc', name: 'Thunder Roc', epithet: 'Storm Bringer', tier: 5, role: 'Mythic', cp: 7, price: 2600,
    hp: 820, atk: 90, cooldown: 1.1, armor: 20, speed: 8.5, range: 9, mass: 400, radius: 1.2, flying: true, ranged: true,
    ability: 'chain', abilityCd: 6, abilityName: 'Chain Lightning', abilityDesc: 'Lightning arcs from foe to foe, stunning each one.' }),
  s({ id: 'phoenix', name: 'Phoenix', epithet: 'Undying Flame', tier: 5, role: 'Mythic', cp: 8, price: 3200,
    hp: 920, atk: 110, cooldown: 1.0, armor: 15, speed: 8, range: 8, mass: 400, radius: 1.3, flying: true, ranged: true,
    ability: 'fireRain', abilityCd: 9, abilityName: 'Sunfall', abilityDesc: 'Rains fire on the enemy. Rises from the ashes once per battle.' }),
  s({ id: 'wyrm', name: 'Frost Wyrm', epithet: 'Winter Incarnate', tier: 5, role: 'Mythic', cp: 10, price: 4200,
    hp: 2850, atk: 130, cooldown: 1.2, armor: 45, speed: 7, range: 8, mass: 2800, radius: 2.4, flying: true, ranged: true,
    ability: 'frostBreath', abilityCd: 9, abilityName: 'Absolute Zero', abilityDesc: 'Breathes a torrent of ice that slows and freezes its prey.' }),
  s({ id: 'dragon', name: 'Ember Dragon', epithet: 'Lord of Flames', tier: 5, role: 'Mythic', cp: 12, price: 5500,
    hp: 3500, atk: 160, cooldown: 1.4, armor: 50, speed: 8, range: 8, mass: 3000, radius: 2.6, flying: true, ranged: true,
    ability: 'fireBreath', abilityCd: 8, abilityName: 'Cataclysm', abilityDesc: 'Scours the field with a roaring stream of dragonfire.' }),
];

// ── The wider animal kingdom ─────────────────────────────
// Stats come from a formula so that every beast costs a fair price for what it does.

type Arch = 'tank' | 'bruiser' | 'hunter' | 'ranged' | 'support' | 'swarm';
const ARCH: Record<Arch, { hp: number; atk: number; armor: number; role: Role; crit?: number }> = {
  tank: { hp: 1.32, atk: 0.76, armor: 26, role: 'Tank' },
  bruiser: { hp: 1, atk: 1, armor: 14, role: 'Bruiser' },
  hunter: { hp: 0.82, atk: 1.24, armor: 8, role: 'Hunter', crit: 0.2 },
  ranged: { hp: 0.62, atk: 0.96, armor: 2, role: 'Ranged' },
  support: { hp: 0.92, atk: 0.74, armor: 12, role: 'Support' },
  swarm: { hp: 0.86, atk: 1.1, armor: 4, role: 'Hunter', crit: 0.12 },
};
const HP_PER_CP = [120, 135, 165, 250, 350];
const ATK_PER_CP = [15, 14.5, 15, 17, 15];
const PRICE_PER_CP = [60, 95, 150, 240, 345];

const ABILITY_TEXT: Record<AbilityId, string> = {
  charge: 'Lowers its head and barrels through the enemy line, flinging anything in the way.',
  howl: 'Rallies nearby allies, boosting their attack for 6 seconds.',
  spit: 'Sprays a fan of toxic globs that poison on impact.',
  rage: 'Flies into a frenzy, attacking faster and healing on every hit.',
  roar: 'A thunderous roar that stuns nearby enemies and fires up allies.',
  deathRoll: 'Clamps down and thrashes, dealing huge damage and stunning.',
  dive: 'Plummets onto the weakest enemy with a devastating strike.',
  sting: 'A precise strike that floods the target with poison.',
  slam: 'Hammers the ground, launching nearby enemies skyward.',
  pounce: 'Leaps across the field onto the most vulnerable enemy.',
  heal: 'Heals every nearby ally.',
  quake: 'Rears and stomps, cracking the ground in a huge shockwave.',
  frostQuake: 'A freezing shockwave that launches and chills all it touches.',
  chain: 'Lightning arcs from foe to foe, stunning each one.',
  fireRain: 'Rains fire on the enemy.',
  fireBreath: 'Scours the field with a stream of fire.',
  frostBreath: 'Breathes a torrent of ice that slows and freezes its prey.',
  tailWhip: 'Spins and whips its tail, sending everything around it flying.',
  swarm: 'Calls in reinforcements to join the fight for a short time.',
  cloak: 'Vanishes from sight so no enemy can target it. Its next attack hits three times as hard.',
  midas: 'Turns an enemy to solid gold for a moment. While it fights for you, every battle pays 50% more gold.',
  brood: 'Calls an army of soldier ants to fight at her side.',
  chainDash: 'A bolt of lightning on legs: dashes through up to four enemies in a blink, stunning each one.',
  shield: 'Wraps every nearby ally in a glowing bubble that soaks up damage.',
  lance: 'Charges with its ice horn, freezing everything it hits solid.',
  phase: 'Turns into a ghost for a few seconds: nothing can hurt it, it runs straight through enemies, and it moves faster.',
  meteorStomp: 'Stomps so hard the sky answers: three meteors crash down on the enemy.',
  cosmicSong: 'A song from the stars heals your whole team and slows every enemy on the field.',
};

interface Row {
  id: string; name: string; ep: string; g: Group; tier: 1 | 2 | 3 | 4 | 5; cp: number; arch: Arch;
  r: number; mass: number; speed: number; ab: AbilityId; abName: string;
  hit?: Species['hit']; shot?: Species['shot']; fly?: boolean; range?: number; cd?: number; rare?: boolean; crit?: number; abCd?: number;
}

function fromRow(x: Row): Species {
  const a = ARCH[x.arch];
  const cooldown = x.cd ?? Math.min(1.8, 0.78 + x.r * 0.28);
  const ranged = x.arch === 'ranged';
  return {
    id: x.id, name: x.name, epithet: x.ep, group: x.g, tier: x.tier, role: x.cp >= 7 && x.arch === 'tank' ? 'Titan' : a.role, cp: x.cp,
    price: Math.round((PRICE_PER_CP[x.tier - 1] * x.cp) / 5) * 5,
    hp: Math.round(HP_PER_CP[x.tier - 1] * x.cp * a.hp),
    atk: Math.round(ATK_PER_CP[x.tier - 1] * x.cp * a.atk * cooldown * 10) / 10,
    cooldown, armor: a.armor + x.tier * 4, speed: x.speed,
    range: x.range ?? (ranged ? 7.5 : 0.9 + x.r * 0.75), mass: x.mass, radius: x.r,
    ranged, flying: x.fly, critChance: x.crit ?? a.crit, hit: x.hit, shot: x.shot, rare: x.rare,
    ability: x.ab, abilityCd: x.abCd ?? 7 + x.tier, abilityName: x.abName, abilityDesc: ABILITY_TEXT[x.ab],
  };
}

const R = (
  id: string, name: string, ep: string, g: Group, tier: Row['tier'], cp: number, arch: Arch, r: number, mass: number, speed: number,
  ab: AbilityId, abName: string, extra: Partial<Row> = {},
): Species => fromRow({ id, name, ep, g, tier, cp, arch, r, mass, speed, ab, abName, ...extra });

SPECIES.push(
  // ── Dinosaurs ─────────────────────────────────────────
  R('compy', 'Compsognathus', 'Tiny Terror', 'Dinosaurs', 1, 1, 'swarm', 0.4, 8, 7.4, 'swarm', 'Pack Call'),
  R('protoceratops', 'Protoceratops', 'Little Horn-Face', 'Dinosaurs', 1, 1, 'tank', 0.52, 90, 5, 'charge', 'Frill Bump', { hit: 'horn' }),
  R('microraptor', 'Microraptor', 'Four-Winged Glider', 'Dinosaurs', 1, 1, 'hunter', 0.42, 6, 8.2, 'dive', 'Glide Strike', { fly: true, hit: 'claw' }),
  R('velociraptor', 'Velociraptor', 'Sickle-Claw Hunter', 'Dinosaurs', 2, 2, 'hunter', 0.6, 40, 8.4, 'pounce', 'Sickle Leap', { hit: 'claw' }),
  R('dilophosaurus', 'Dilophosaurus', 'Crested Spitter', 'Dinosaurs', 2, 2, 'ranged', 0.72, 280, 5.6, 'spit', 'Blinding Spit', { shot: 'venom' }),
  R('pachy', 'Pachycephalosaurus', 'Dome-Head Basher', 'Dinosaurs', 2, 2, 'bruiser', 0.75, 400, 6.2, 'charge', 'Skull Bash', { hit: 'horn' }),
  R('gallimimus', 'Gallimimus', 'Ostrich Mimic', 'Dinosaurs', 2, 2, 'hunter', 0.75, 300, 10, 'charge', 'Blur Sprint'),
  R('dimetrodon', 'Dimetrodon', 'Sail-Backed Ancient', 'Dinosaurs', 2, 2, 'bruiser', 0.82, 240, 4.8, 'pounce', 'Sail Surge'),
  R('utahraptor', 'Utahraptor', 'Giant Raptor', 'Dinosaurs', 3, 3, 'hunter', 0.95, 500, 7.6, 'pounce', 'Terror Leap', { hit: 'claw' }),
  R('iguanodon', 'Iguanodon', 'Thumb-Spike Grazer', 'Dinosaurs', 3, 3, 'bruiser', 1.05, 1200, 5, 'slam', 'Thumb Spike', { hit: 'horn' }),
  R('parasaur', 'Parasaurolophus', 'Trumpet Crest', 'Dinosaurs', 3, 3, 'support', 1.05, 1400, 5.6, 'heal', 'Herd Song'),
  R('stegosaurus', 'Stegosaurus', 'Plated Wall', 'Dinosaurs', 3, 3, 'tank', 1.25, 2200, 4.2, 'tailWhip', 'Thagomizer', { hit: 'horn' }),
  R('pteranodon', 'Pteranodon', 'Winged Lizard', 'Dinosaurs', 3, 3, 'hunter', 0.95, 40, 8.6, 'dive', 'Sky Snatch', { fly: true, hit: 'claw' }),
  R('styracosaurus', 'Styracosaurus', 'Spike-Frilled Rusher', 'Dinosaurs', 4, 4, 'bruiser', 1.32, 2400, 5.3, 'charge', 'Spike Rush', { hit: 'horn' }),
  R('ankylosaurus', 'Ankylosaurus', 'Living Tank', 'Dinosaurs', 4, 4, 'tank', 1.38, 4500, 3.9, 'tailWhip', 'Club Tail', { hit: 'earth' }),
  R('triceratops', 'Triceratops', 'Three-Horned Face', 'Dinosaurs', 4, 5, 'tank', 1.6, 6000, 5, 'charge', 'Triple Horn Charge', { hit: 'horn' }),
  R('carnotaurus', 'Carnotaurus', 'Horned Sprinter', 'Dinosaurs', 4, 5, 'hunter', 1.35, 1500, 7.4, 'charge', 'Bull Rush'),
  R('allosaurus', 'Allosaurus', 'Jurassic Bruiser', 'Dinosaurs', 4, 5, 'bruiser', 1.45, 2000, 6.2, 'roar', 'Savage Roar'),
  R('therizinosaurus', 'Therizinosaurus', 'Scythe Lizard', 'Dinosaurs', 4, 5, 'hunter', 1.42, 3000, 5.4, 'rage', 'Scythe Frenzy', { hit: 'claw' }),
  R('quetzalcoatlus', 'Quetzalcoatlus', 'Giant of the Skies', 'Dinosaurs', 4, 5, 'hunter', 1.5, 250, 8, 'dive', 'Falling Shadow', { fly: true, hit: 'claw' }),
  R('spinosaurus', 'Spinosaurus', 'River Sail', 'Dinosaurs', 5, 7, 'bruiser', 1.85, 7000, 5.2, 'tailWhip', 'River Sweep'),
  R('giganotosaurus', 'Giganotosaurus', 'Giant Southern Lizard', 'Dinosaurs', 5, 7, 'hunter', 1.9, 7500, 5.9, 'roar', 'Apex Roar'),
  R('apatosaurus', 'Apatosaurus', 'Thunder Lizard', 'Dinosaurs', 5, 7, 'tank', 2.2, 20000, 3.5, 'quake', 'Thunder Step', { hit: 'earth' }),
  R('diplodocus', 'Diplodocus', 'Whip-Tail Colossus', 'Dinosaurs', 5, 7, 'tank', 2.1, 15000, 3.7, 'tailWhip', 'Sonic Whip', { hit: 'earth' }),
  R('brachiosaurus', 'Brachiosaurus', 'Treetop Titan', 'Dinosaurs', 5, 8, 'tank', 2.45, 30000, 3.3, 'quake', 'Titan Stomp', { hit: 'earth' }),
  // ── Bugs and creepy-crawlies ──────────────────────────
  R('ant', 'Soldier Ant', 'Colony Warrior', 'Bugs', 1, 1, 'swarm', 0.42, 10, 6.2, 'swarm', 'Colony Call'),
  R('ladybug', 'Ladybug', 'Spotted Tank', 'Bugs', 1, 1, 'tank', 0.46, 25, 4.6, 'charge', 'Shell Bash', { hit: 'horn' }),
  R('bee', 'Honey Bee', 'Hive Defender', 'Bugs', 1, 1, 'hunter', 0.42, 5, 8, 'dive', 'Stinger Dive', { fly: true, hit: 'venom' }),
  R('butterfly', 'Butterfly', 'Painted Healer', 'Bugs', 1, 1, 'support', 0.5, 3, 6.4, 'heal', 'Healing Dust', { fly: true }),
  R('firefly', 'Firefly', 'Living Spark', 'Bugs', 1, 1, 'ranged', 0.4, 3, 6.8, 'chain', 'Glow Zap', { fly: true, shot: 'bolt' }),
  R('grasshopper', 'Grasshopper', 'Mega Hopper', 'Bugs', 1, 1, 'hunter', 0.55, 15, 7, 'pounce', 'Mega Hop'),
  R('cockroach', 'Cockroach', 'The Unsquishable', 'Bugs', 1, 1, 'tank', 0.5, 20, 6, 'rage', 'Refuses to Die'),
  R('stagbeetle', 'Stag Beetle', 'Pincer Wrestler', 'Bugs', 2, 2, 'bruiser', 0.82, 140, 4.8, 'charge', 'Pincer Toss', { hit: 'horn' }),
  R('rhinobeetle', 'Rhino Beetle', 'Strongest Bug Alive', 'Bugs', 2, 2, 'tank', 0.88, 220, 4.5, 'charge', 'Horn Flip', { hit: 'horn' }),
  R('wasp', 'Wasp', 'Angry Striker', 'Bugs', 2, 2, 'hunter', 0.58, 15, 8.6, 'sting', 'Venom Stab', { fly: true, hit: 'venom' }),
  R('dragonfly', 'Dragonfly', 'Razor Wings', 'Bugs', 2, 2, 'hunter', 0.72, 12, 9.6, 'dive', 'Razor Dash', { fly: true, hit: 'claw' }),
  R('mantis', 'Praying Mantis', 'Patient Ambusher', 'Bugs', 2, 2, 'hunter', 0.8, 100, 6.4, 'pounce', 'Ambush Strike', { hit: 'claw' }),
  R('tarantula', 'Tarantula', 'Hairy Heavyweight', 'Bugs', 2, 2, 'bruiser', 0.85, 180, 5.6, 'sting', 'Fang Bite', { hit: 'venom' }),
  R('crab', 'Giant Crab', 'Sideways Crusher', 'Bugs', 2, 2, 'tank', 0.85, 300, 4, 'slam', 'Claw Smash', { hit: 'claw' }),
  R('widow', 'Black Widow', 'Silent Web', 'Bugs', 3, 3, 'ranged', 0.75, 90, 5.4, 'spit', 'Venom Web', { shot: 'venom' }),
  R('centipede', 'Giant Centipede', 'Hundred Legs', 'Bugs', 3, 3, 'hunter', 1.0, 300, 6.4, 'sting', 'Venom Claws', { hit: 'venom' }),
  // ── Predators ─────────────────────────────────────────
  R('fox', 'Red Fox', 'Sly Trickster', 'Predators', 1, 1, 'hunter', 0.48, 10, 7.4, 'pounce', 'Sneak Pounce'),
  R('dog', 'War Hound', 'Loyal to the End', 'Predators', 1, 1, 'bruiser', 0.55, 40, 6.6, 'howl', 'Battle Bark'),
  R('hyena', 'Hyena', 'Cackling Scavenger', 'Predators', 1, 1, 'swarm', 0.55, 50, 6.8, 'swarm', 'Clan Laugh'),
  R('lynx', 'Lynx', 'Tufted Shadow', 'Predators', 1, 1, 'hunter', 0.5, 25, 7.2, 'pounce', 'Silent Spring', { hit: 'claw' }),
  R('cheetah', 'Cheetah', 'Fastest on Land', 'Predators', 2, 2, 'hunter', 0.68, 60, 11, 'pounce', 'Top Speed', { hit: 'claw' }),
  R('leopard', 'Leopard', 'Spotted Ambusher', 'Predators', 2, 2, 'hunter', 0.72, 80, 7.8, 'pounce', 'Tree Drop', { hit: 'claw' }),
  R('panda', 'Giant Panda', 'Do Not Underestimate', 'Predators', 2, 2, 'tank', 0.9, 120, 4.4, 'slam', 'Bamboo Smash', { hit: 'claw' }),
  R('kangaroo', 'Kangaroo', 'Outback Boxer', 'Predators', 2, 2, 'bruiser', 0.72, 90, 7, 'pounce', 'Flying Kick', { hit: 'claw' }),
  R('chimp', 'Chimpanzee', 'Clever Brawler', 'Predators', 2, 2, 'bruiser', 0.72, 60, 6, 'rage', 'Tantrum', { hit: 'earth' }),
  R('jaguar', 'Jaguar', 'Power Jaws', 'Predators', 3, 3, 'hunter', 0.92, 120, 7.2, 'pounce', 'Crushing Bite'),
  R('panther', 'Black Panther', 'Midnight Stalker', 'Predators', 3, 3, 'hunter', 0.92, 110, 7.6, 'pounce', 'Shadow Leap', { hit: 'claw' }),
  R('orangutan', 'Orangutan', 'Red Ape', 'Predators', 3, 3, 'bruiser', 1.0, 150, 5, 'slam', 'Long-Arm Slam', { hit: 'earth' }),
  R('polarbear', 'Polar Bear', 'Arctic Apex', 'Predators', 4, 4, 'bruiser', 1.28, 600, 5.4, 'rage', 'Ice Fury', { hit: 'claw' }),
  // ── Herd animals ──────────────────────────────────────
  R('rabbit', 'Rabbit', 'Surprisingly Vicious', 'Herd', 1, 1, 'swarm', 0.38, 3, 8, 'swarm', 'Multiply'),
  R('pig', 'Farm Pig', 'Muddy Bulldozer', 'Herd', 1, 1, 'tank', 0.56, 120, 4.8, 'charge', 'Hog Rush', { hit: 'horn' }),
  R('goat', 'Mountain Goat', 'Headbutt Champion', 'Herd', 1, 1, 'bruiser', 0.55, 70, 6.2, 'charge', 'Headbutt', { hit: 'horn' }),
  R('llama', 'Llama', 'Unimpressed Spitter', 'Herd', 1, 1, 'ranged', 0.58, 130, 5.4, 'spit', 'Rude Spit', { shot: 'venom' }),
  R('deer', 'Deer', 'Swift Antlers', 'Herd', 1, 1, 'support', 0.6, 80, 7.4, 'heal', 'Forest Calm', { hit: 'horn' }),
  R('armadillo', 'Armadillo', 'Rolling Armor', 'Herd', 1, 1, 'tank', 0.46, 30, 5, 'charge', 'Cannonball', { hit: 'horn' }),
  R('porcupine', 'Porcupine', 'Do Not Pet', 'Herd', 1, 1, 'ranged', 0.46, 20, 4.4, 'spit', 'Quill Volley', { shot: 'bolt' }),
  R('skunk', 'Skunk', 'Chemical Warfare', 'Herd', 1, 1, 'ranged', 0.42, 6, 5, 'spit', 'Stink Cloud', { shot: 'venom' }),
  R('ram', 'Bighorn Ram', 'Curled Thunder', 'Herd', 2, 2, 'bruiser', 0.72, 130, 6.4, 'charge', 'Ram Attack', { hit: 'horn' }),
  R('zebra', 'Zebra', 'Striped Kicker', 'Herd', 2, 2, 'bruiser', 0.82, 350, 8, 'charge', 'Stampede', { hit: 'horn' }),
  R('horse', 'War Horse', 'Thundering Hooves', 'Herd', 2, 2, 'bruiser', 0.85, 500, 9, 'charge', 'Cavalry Charge', { hit: 'horn' }),
  R('bison', 'Bison', 'Plains Thunder', 'Herd', 3, 3, 'tank', 1.15, 900, 5.8, 'charge', 'Stampede', { hit: 'horn' }),
  R('bull', 'Raging Bull', 'Seeing Red', 'Herd', 3, 3, 'bruiser', 1.08, 800, 6.6, 'charge', 'Red Rage', { hit: 'horn' }),
  R('moose', 'Moose', 'Antlered Giant', 'Herd', 3, 3, 'bruiser', 1.15, 700, 5.8, 'charge', 'Antler Sweep', { hit: 'horn' }),
  R('camel', 'Camel', 'Desert Grump', 'Herd', 3, 3, 'ranged', 1.0, 600, 5, 'spit', 'Mega Spit', { shot: 'venom' }),
  R('hippo', 'Hippopotamus', 'River Tyrant', 'Herd', 4, 4, 'tank', 1.5, 2500, 4.6, 'deathRoll', 'Crushing Jaws'),
  R('giraffe', 'Giraffe', 'Long Reach', 'Herd', 4, 4, 'bruiser', 1.15, 1200, 5.6, 'slam', 'Neck Slam', { hit: 'earth', range: 3.4 }),
  // ── Reptiles ──────────────────────────────────────────
  R('iguana', 'Iguana', 'Tiny Dragon', 'Reptiles', 1, 1, 'bruiser', 0.46, 10, 5, 'tailWhip', 'Tail Slap'),
  R('rattlesnake', 'Rattlesnake', 'Warning Given', 'Reptiles', 1, 1, 'hunter', 0.4, 5, 5.4, 'sting', 'Fang Strike', { hit: 'venom' }),
  R('python', 'Python', 'The Squeeze', 'Reptiles', 2, 2, 'tank', 0.65, 90, 4, 'deathRoll', 'Constrict'),
  R('turtle', 'Snapping Turtle', 'Ancient Armor', 'Reptiles', 2, 2, 'tank', 0.78, 120, 3.2, 'deathRoll', 'Snap'),
  R('komodo', 'Komodo Dragon', 'Venomous Giant', 'Reptiles', 3, 3, 'bruiser', 1.0, 150, 5, 'sting', 'Toxic Bite', { hit: 'venom' }),
  // ── Birds and bats ────────────────────────────────────
  R('bat', 'Vampire Bat', 'Night Flapper', 'Birds', 1, 1, 'hunter', 0.42, 2, 8.2, 'rage', 'Night Frenzy', { fly: true }),
  R('falcon', 'Falcon', 'Speed Dive', 'Birds', 1, 1, 'hunter', 0.45, 2, 9.4, 'dive', 'Stoop', { fly: true, hit: 'claw' }),
  R('parrot', 'Macaw', 'Loud and Proud', 'Birds', 1, 1, 'support', 0.45, 2, 7, 'howl', 'Battle Squawk', { fly: true }),
  R('penguin', 'Emperor Penguin', 'Formal Attire', 'Birds', 1, 1, 'tank', 0.48, 40, 4.4, 'charge', 'Belly Slide', { hit: 'horn' }),
  R('flamingo', 'Flamingo', 'Pink Menace', 'Birds', 1, 1, 'bruiser', 0.52, 5, 6, 'pounce', 'Kick Flip'),
  R('owl', 'Great Owl', 'Silent Wings', 'Birds', 2, 2, 'hunter', 0.6, 3, 7.6, 'dive', 'Night Strike', { fly: true, hit: 'claw' }),
  R('vulture', 'Vulture', 'Patient Circler', 'Birds', 2, 2, 'bruiser', 0.72, 10, 7, 'dive', 'Swoop Drop', { fly: true }),
  R('ostrich', 'Ostrich', 'Kick Like a Truck', 'Birds', 2, 2, 'bruiser', 0.75, 130, 9.6, 'charge', 'Mega Kick', { hit: 'claw' }),
  // ── Sea creatures that didn't get the memo about land ─
  R('seal', 'Seal', 'Slippery Bruiser', 'Sea', 1, 1, 'tank', 0.56, 120, 4.2, 'charge', 'Flipper Slide', { hit: 'horn' }),
  R('piranha', 'Piranha', 'All Teeth', 'Sea', 1, 1, 'swarm', 0.38, 3, 7.2, 'swarm', 'Feeding Frenzy', { fly: true }),
  R('shark', 'Great White Shark', 'Land Shark', 'Sea', 3, 3, 'hunter', 1.05, 1000, 7.4, 'deathRoll', 'Frenzy Bite', { fly: true }),
  R('hammerhead', 'Hammerhead', 'Head First', 'Sea', 3, 3, 'bruiser', 1.0, 500, 7, 'charge', 'Hammer Ram', { fly: true, hit: 'horn' }),
  R('walrus', 'Walrus', 'Tusked Blubber', 'Sea', 3, 3, 'tank', 1.12, 1200, 3.8, 'slam', 'Belly Flop', { hit: 'horn' }),
  R('orca', 'Orca', 'Killer Whale', 'Sea', 4, 5, 'hunter', 1.5, 5000, 7, 'deathRoll', 'Pod Hunter', { fly: true }),
  R('megalodon', 'Megalodon', 'Biggest Bite Ever', 'Sea', 5, 7, 'hunter', 2.0, 40000, 6, 'deathRoll', 'Mega Chomp', { fly: true }),
  R('mosasaurus', 'Mosasaurus', 'Terror of the Deep', 'Dinosaurs', 5, 8, 'bruiser', 2.2, 20000, 5.6, 'tailWhip', 'Abyssal Sweep', { fly: true }),
  // ── Legends ───────────────────────────────────────────
  R('unicorn', 'Unicorn', 'Rainbow Lance', 'Mythic', 4, 4, 'support', 0.95, 500, 8.6, 'heal', 'Starlight Mend', { hit: 'horn' }),
);

// ── Rare beasts: earned by finishing a task, never sold ───
const rare: Partial<Row> = { rare: true };
SPECIES.push(
  R('chameleon', 'Rainbow Chameleon', 'Now You See Me', 'Rare', 2, 2, 'hunter', 0.62, 30, 6, 'cloak', 'Color Cloak', { ...rare, abCd: 9 }),
  R('jackalope', 'Lucky Jackalope', 'Luckiest Beast Alive', 'Rare', 2, 2, 'hunter', 0.5, 12, 8.6, 'pounce', 'Lucky Leap', { ...rare, crit: 0.5, hit: 'horn' }),
  R('scarab', 'Golden Scarab', 'Worth Its Weight', 'Rare', 2, 2, 'tank', 0.72, 150, 4.8, 'midas', 'Midas Touch', { ...rare, hit: 'horn' }),
  R('queenant', 'Queen Ant', 'Mother of the Colony', 'Rare', 3, 3, 'bruiser', 1.0, 300, 4.8, 'brood', 'Royal Brood', { ...rare, abCd: 11 }),
  R('stormraptor', 'Storm Raptor', 'Faster Than Thunder', 'Rare', 3, 3, 'hunter', 0.85, 300, 9.4, 'chainDash', 'Lightning Dash', { ...rare, hit: 'claw' }),
  R('narwhal', 'Frost Narwhal', 'Unicorn of the Sea', 'Rare', 3, 3, 'bruiser', 1.05, 900, 7, 'lance', 'Ice Lance', { ...rare, fly: true, hit: 'horn' }),
  R('ghosttiger', 'Ghost Tiger', 'Hunts Through Walls', 'Rare', 4, 4, 'hunter', 1.05, 200, 8, 'phase', 'Phantom Run', { ...rare, hit: 'claw' }),
  R('aurorafox', 'Aurora Fox', 'Keeper of the Northern Lights', 'Rare', 4, 4, 'support', 0.9, 100, 7.6, 'shield', 'Spirit Shield', { ...rare }),
  R('sunfirerex', 'Sunfire Rex', 'King of Kings', 'Rare', 5, 8, 'bruiser', 1.95, 8000, 5.6, 'meteorStomp', 'Meteor Stomp', { ...rare, abCd: 13 }),
  R('starwhale', 'Star Whale', 'Swims the Night Sky', 'Rare', 5, 9, 'support', 2.5, 40000, 4.4, 'cosmicSong', 'Cosmic Song', { ...rare, fly: true, abCd: 11 }),
);

const ORIGINAL_GROUPS: Record<string, Group> = {
  wolf: 'Predators', boar: 'Herd', cobra: 'Reptiles', badger: 'Predators', lion: 'Predators', croc: 'Reptiles', eagle: 'Birds',
  scorpion: 'Bugs', gorilla: 'Predators', bear: 'Predators', tiger: 'Predators', stag: 'Herd', sabertooth: 'Predators',
  rhino: 'Herd', elephant: 'Herd', trex: 'Dinosaurs', mammoth: 'Herd', roc: 'Mythic', phoenix: 'Mythic', wyrm: 'Mythic', dragon: 'Mythic',
};
const ORIGINAL_HITS: Record<string, Species['hit']> = {
  boar: 'horn', rhino: 'horn', stag: 'horn', mammoth: 'horn', elephant: 'horn', scorpion: 'venom',
  lion: 'claw', tiger: 'claw', bear: 'claw', eagle: 'claw', sabertooth: 'claw', badger: 'claw', gorilla: 'earth',
};
const ORIGINAL_SHOTS: Record<string, Species['shot']> = { cobra: 'venom', roc: 'bolt', phoenix: 'flame', dragon: 'flame', wyrm: 'ice' };
for (const sp of SPECIES) {
  sp.group ??= ORIGINAL_GROUPS[sp.id];
  sp.hit ??= ORIGINAL_HITS[sp.id] ?? 'bite';
  if (sp.ranged) sp.shot ??= ORIGINAL_SHOTS[sp.id] ?? 'bolt';
}

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((x) => [x.id, x]));

export function getSpecies(id: string): Species {
  const sp = SPECIES_BY_ID[id];
  if (!sp) throw new Error(`Unknown species: ${id}`);
  return sp;
}
