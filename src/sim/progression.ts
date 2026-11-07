// XP curve, stat scaling, evolution, rewards and the persistent player profile.
import { getSpecies, SPECIES_BY_ID, type Species } from './species';

export const MAX_LEVEL = 30;

export const EVOLUTIONS = [
  { level: 1, name: 'Wild', color: '#b8c2cc' },
  { level: 5, name: 'Veteran', color: '#6fd3ff' },
  { level: 10, name: 'Elite', color: '#c58bff' },
  { level: 20, name: 'Legend', color: '#ffc94d' },
] as const;

/** XP required to advance *from* `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.round(40 * Math.pow(level, 1.35));
}

export function evoStage(level: number): number {
  let stage = 0;
  EVOLUTIONS.forEach((e, i) => { if (level >= e.level) stage = i; });
  return stage;
}

export interface DerivedStats {
  hp: number; atk: number; armor: number; speed: number; cooldown: number; abilityCd: number;
  range: number; mass: number; radius: number; scale: number; critChance: number;
}

export function deriveStats(sp: Species, level: number, boss = false): DerivedStats {
  const evo = evoStage(level);
  const lv = level - 1;
  const growth = 1 + 0.13 * lv;
  const evoBonus = 1 + 0.06 * evo;
  const bossHp = boss ? 2.2 : 1;
  const bossAtk = boss ? 1.25 : 1;
  const scale = (1 + 0.04 * evo) * (boss ? 1.55 : 1);
  return {
    hp: Math.round(sp.hp * growth * evoBonus * bossHp),
    atk: Math.round(sp.atk * growth * evoBonus * bossAtk * 10) / 10,
    armor: Math.round(sp.armor + lv * 1.5 + evo * 4),
    speed: sp.speed * (1 + 0.005 * lv),
    cooldown: sp.cooldown * Math.max(0.75, 1 - 0.006 * lv),
    abilityCd: sp.abilityCd * Math.max(0.65, 1 - 0.012 * lv),
    range: sp.range + (sp.ranged ? 0 : sp.radius * (scale - 1)),
    mass: sp.mass * (boss ? 2 : 1) * (1 + 0.02 * lv),
    radius: sp.radius * scale * 1.2,
    scale,
    critChance: (sp.critChance ?? 0.08) + 0.003 * lv,
  };
}

/** A beast the player owns. */
export interface Beast {
  uid: string;
  speciesId: string;
  level: number;
  xp: number;
  kills: number;
  wins: number;
  battles: number;
}

export interface Upgrades { command: number; mentor: number; warchest: number; spirit: number; }

export interface Profile {
  version: 1;
  gold: number;
  beasts: Beast[];
  /** Stars earned per stage index. Length = stages attempted-and-won. */
  stars: Record<number, number>;
  upgrades: Upgrades;
  nextUid: number;
  totalWins: number;
  totalKills: number;
  lastSquad: Placement[];
  settings: { quality: 'high' | 'medium' | 'low'; muted: boolean; musicOff?: boolean; qualityChosen?: boolean };
  /** Rare beasts this player has earned. */
  rares: string[];
  /** All gold ever earned from battles, whatever has been spent since. */
  totalGold: number;
  /** When this save was last written. Decides which copy wins between devices. */
  savedAt?: number;
  /** True once this save has been compared with the cloud copy, so its timestamp can be trusted. */
  cloudSeen?: boolean;
}

export interface Placement { uid: string; x: number; z: number; }

export const UPGRADE_DEFS = {
  command: { name: 'War Banner', desc: '+2 command points in every battle.', base: 150, growth: 1.9, max: 12 },
  mentor: { name: 'Elder Mentor', desc: '+15% XP from every battle.', base: 200, growth: 1.8, max: 8 },
  warchest: { name: 'War Chest', desc: '+15% gold from every battle.', base: 200, growth: 1.8, max: 8 },
  spirit: { name: 'Spirit Totem', desc: '+20% Spirit charge rate in battle.', base: 250, growth: 1.9, max: 6 },
} as const;
export type UpgradeId = keyof typeof UPGRADE_DEFS;

export function upgradeCost(id: UpgradeId, owned: number): number {
  const def = UPGRADE_DEFS[id];
  return Math.round(def.base * Math.pow(def.growth, owned) / 5) * 5;
}

export function newProfile(): Profile {
  const p: Profile = {
    version: 1, gold: 120, beasts: [], stars: {},
    upgrades: { command: 0, mentor: 0, warchest: 0, spirit: 0 },
    nextUid: 1, totalWins: 0, totalKills: 0, lastSquad: [], rares: [], totalGold: 0,
    settings: { quality: 'high', muted: false },
  };
  addBeast(p, 'wolf'); addBeast(p, 'compy'); addBeast(p, 'boar'); addBeast(p, 'ant');
  return p;
}

export function addBeast(p: Profile, speciesId: string, level = 1): Beast {
  getSpecies(speciesId);
  const b: Beast = { uid: `b${p.nextUid++}`, speciesId, level, xp: 0, kills: 0, wins: 0, battles: 0 };
  p.beasts.push(b);
  return b;
}

export function highestCleared(p: Profile): number {
  let hi = -1;
  for (const k of Object.keys(p.stars)) hi = Math.max(hi, Number(k));
  return hi;
}

export function commandCap(p: Profile): number {
  return 5 + p.upgrades.command * 2 + Math.floor((highestCleared(p) + 1) * 0.75);
}

export function recruitPrice(p: Profile, sp: Species): number {
  const owned = p.beasts.filter((b) => b.speciesId === sp.id).length;
  return Math.round(sp.price * (1 + 0.3 * owned) / 5) * 5;
}

/** Gold cost to pay for one full level at the training grounds. */
export function trainCost(b: Beast): number {
  const sp = getSpecies(b.speciesId);
  return Math.round((30 + xpToNext(b.level) * 0.6) * (0.7 + sp.tier * 0.3) / 5) * 5;
}

/** Stage reached when a species becomes purchasable. */
export function recruitUnlockStage(sp: Species): number {
  if (sp.rare) return Infinity;
  return [-1, 1, 5, 11, 17][sp.tier - 1];
}

/** Add XP, resolving as many level-ups as it pays for. */
export function grantXp(b: Beast, amount: number): { levelsGained: number; evolved: boolean } {
  const startLevel = b.level;
  const startEvo = evoStage(b.level);
  b.xp += amount;
  while (b.level < MAX_LEVEL && b.xp >= xpToNext(b.level)) {
    b.xp -= xpToNext(b.level);
    b.level++;
  }
  if (b.level >= MAX_LEVEL) b.xp = 0;
  return { levelsGained: b.level - startLevel, evolved: evoStage(b.level) > startEvo };
}

// ── Battle rewards ────────────────────────────────────────

export interface BattleEntry {
  uid: string; kills: number; damage: number; survived: boolean;
}

export interface BeastReward {
  uid: string; speciesId: string; xpGained: number;
  levelBefore: number; xpBefore: number; levelAfter: number; xpAfter: number;
  levelsGained: number; evolved: boolean; goldEarned: number; kills: number; survived: boolean; mvp: boolean;
}

export interface BattleRewards {
  won: boolean; stars: number; firstClear: boolean; gold: number; baseGold: number; bonusGold: number;
  beasts: BeastReward[];
  /** Rare beasts earned by this battle. */
  rares: string[];
}

/** What a clean first-try win pays, before bounties and bonuses, for showing ahead of a battle. */
export function previewRewards(p: Profile, stage: { xp: number; gold: number }, firstClear: boolean): { gold: number; xp: number } {
  return {
    gold: Math.round(stage.gold * (firstClear ? 1 : 0.6) * 1.1 * (1 + 0.15 * p.upgrades.warchest)),
    xp: Math.round(stage.xp * (1 + 0.15 * p.upgrades.mentor)),
  };
}

export function starsFor(won: boolean, lost: number, fielded: number): number {
  if (!won) return 0;
  if (lost === 0) return 3;
  return lost <= fielded / 2 ? 2 : 1;
}

export interface RewardInput {
  stage: { xp: number; gold: number };
  stageIndex: number;
  won: boolean;
  entries: BattleEntry[];
}

/**
 * Pays out a finished battle: every fielded beast gains XP, the player banks gold,
 * and stars are recorded. A win always pays full value; a loss pays a small consolation
 * so a tough stage never leaves the player stuck.
 */
export function applyBattleResult(p: Profile, input: RewardInput): BattleRewards {
  const { stage, stageIndex, won, entries } = input;
  const lost = entries.filter((e) => !e.survived).length;
  const stars = starsFor(won, lost, entries.length);
  const prevStars = p.stars[stageIndex] ?? 0;
  const firstClear = won && prevStars === 0;

  const xpMult = (won ? 1 : 0.25) * (1 + 0.15 * p.upgrades.mentor);
  const herd = entries.map((e) => p.beasts.find((b) => b.uid === e.uid)?.speciesId ?? '').filter(Boolean);
  // The Golden Scarab's gift: any battle it fights in pays half as much again.
  const goldMult = (1 + 0.15 * p.upgrades.warchest) * (herd.includes('scarab') ? 1.5 : 1);
  const totalKills = entries.reduce((sum, e) => sum + e.kills, 0);
  const baseGold = won
    ? Math.round(stage.gold * (firstClear ? 1 : 0.6) * (0.8 + 0.1 * stars) * goldMult)
    : Math.round(stage.gold * 0.15 * goldMult);
  const killGoldEach = won ? Math.round(stage.gold * 0.05 * goldMult) : 0;
  const bonusGold = totalKills * killGoldEach;

  const topDamage = Math.max(0, ...entries.map((e) => e.damage));
  const beasts: BeastReward[] = [];
  for (const e of entries) {
    const b = p.beasts.find((x) => x.uid === e.uid);
    if (!b) continue;
    const mvp = won && e.damage === topDamage && topDamage > 0;
    const xpGained = Math.round(
      (stage.xp * (e.survived ? 1 : 0.7) + e.kills * stage.xp * 0.12) * xpMult * (mvp ? 1.25 : 1),
    );
    const levelBefore = b.level;
    const xpBefore = b.xp;
    const { levelsGained, evolved } = grantXp(b, xpGained);
    b.kills += e.kills;
    b.battles += 1;
    if (won) b.wins += 1;
    beasts.push({
      uid: b.uid, speciesId: b.speciesId, xpGained, levelBefore, xpBefore,
      levelAfter: b.level, xpAfter: b.xp, levelsGained, evolved,
      goldEarned: e.kills * killGoldEach, kills: e.kills, survived: e.survived, mvp,
    });
  }

  const gold = baseGold + bonusGold;
  p.gold += gold;
  p.totalGold = (p.totalGold ?? 0) + gold;
  p.totalKills += totalKills;
  if (won) {
    p.totalWins += 1;
    p.stars[stageIndex] = Math.max(prevStars, stars);
  }
  const rares = won ? checkRareTasks(p, { stageIndex, herd, stars }) : [];
  return { won, stars, firstClear, gold, baseGold, bonusGold, beasts, rares };
}

// ── Rare beast tasks ──────────────────────────────────────

/** What a just-won battle looked like, for tasks about how it was won. */
export interface WinContext { stageIndex: number; herd: string[]; stars: number; }

export interface RareTask {
  speciesId: string;
  /** Index of the stage that must be cleared before the task is revealed. */
  afterStage: number;
  text: string;
  /** Counting tasks show a progress bar. Tasks done in one battle have none. */
  progress?: (p: Profile) => { have: number; need: number };
  /** Whether this win completes a task that's judged on a single battle. */
  won?: (w: WinContext) => boolean;
}

const starTotal = (p: Profile) => Object.values(p.stars).reduce((a, b) => a + b, 0);
const threeStars = (p: Profile) => Object.values(p.stars).filter((n) => n >= 3).length;
const onlyGroup = (w: WinContext, group: string, min: number) =>
  w.herd.length >= min && w.herd.every((id) => getSpecies(id).group === group);

export const RARE_TASKS: RareTask[] = [
  { speciesId: 'chameleon', afterStage: 2, text: 'Earn 3 stars on Stage 3.',
    won: (w) => w.stageIndex === 2 && w.stars === 3 },
  { speciesId: 'scarab', afterStage: 3, text: 'Earn 1,500 gold from battles.',
    progress: (p) => ({ have: p.totalGold ?? 0, need: 1500 }) },
  { speciesId: 'jackalope', afterStage: 4, text: 'Earn 3 stars on 5 different stages.',
    progress: (p) => ({ have: threeStars(p), need: 5 }) },
  { speciesId: 'queenant', afterStage: 6, text: 'Win a battle with a herd of 3 or more, using only bugs.',
    won: (w) => onlyGroup(w, 'Bugs', 3) },
  { speciesId: 'stormraptor', afterStage: 8, text: 'Win a battle with a herd of 3 or more, using only dinosaurs.',
    won: (w) => onlyGroup(w, 'Dinosaurs', 3) },
  { speciesId: 'ghosttiger', afterStage: 11, text: 'Knock out 150 enemies.',
    progress: (p) => ({ have: p.totalKills, need: 150 }) },
  { speciesId: 'narwhal', afterStage: 14, text: 'Win a battle with a herd of 2 or more, using only sea creatures.',
    won: (w) => onlyGroup(w, 'Sea', 2) },
  { speciesId: 'aurorafox', afterStage: 17, text: 'Beat The Glacier King (Stage 18) without losing a single beast.',
    won: (w) => w.stageIndex === 17 && w.stars === 3 },
  { speciesId: 'sunfirerex', afterStage: 23, text: 'Beat The Tyrant King (Stage 24) with a Tyrannosaur in your herd.',
    won: (w) => w.stageIndex === 23 && w.herd.includes('trex') },
  { speciesId: 'starwhale', afterStage: 29, text: 'Collect 75 stars across the campaign.',
    progress: (p) => ({ have: starTotal(p), need: 75 }) },
];

export const hasRare = (p: Profile, speciesId: string) => (p.rares ?? []).includes(speciesId);
export const taskRevealed = (p: Profile, t: RareTask) => highestCleared(p) >= t.afterStage;

/** Grants every rare beast whose task is now done. Called after a win. */
export function checkRareTasks(p: Profile, w: WinContext): string[] {
  const earned: string[] = [];
  for (const t of RARE_TASKS) {
    if (hasRare(p, t.speciesId) || !taskRevealed(p, t)) continue;
    const prog = t.progress?.(p);
    const done = (prog && prog.have >= prog.need) || t.won?.(w);
    if (!done) continue;
    p.rares = [...(p.rares ?? []), t.speciesId];
    // Arrives ready to fight alongside the rest of the herd.
    const top = Math.max(...p.beasts.map((b) => b.level));
    addBeast(p, t.speciesId, Math.max(1, Math.round(top * 0.75)));
    earned.push(t.speciesId);
  }
  return earned;
}

// ── Persistence ───────────────────────────────────────────

const SAVE_KEY = 'beastfall.save.v1';

/** Turns stored JSON into a usable save, or null. Repairs missing fields so old saves keep working. */
export function parseProfile(json: string): Profile | null {
  try {
    const p = JSON.parse(json) as Profile;
    if (p?.version !== 1 || !Array.isArray(p.beasts)) return null;
    const fresh = newProfile();
    const known = p.beasts.filter((b) => b && SPECIES_BY_ID[b.speciesId]);
    if (!known.length) return null;
    return {
      ...fresh, ...p, beasts: known,
      gold: Number.isFinite(p.gold) ? p.gold : fresh.gold,
      rares: Array.isArray(p.rares) ? p.rares : [],
      stars: p.stars ?? {},
      upgrades: { ...fresh.upgrades, ...p.upgrades },
      lastSquad: Array.isArray(p.lastSquad) ? p.lastSquad : [],
      settings: { ...fresh.settings, ...p.settings },
    };
  } catch {
    return null;
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const parsed = raw ? parseProfile(raw) : null;
    if (parsed) return parsed;
  } catch { /* storage may be blocked: fall through to a fresh profile */ }
  return newProfile();
}

const progressScore = (p: Profile) => p.totalWins * 1000 + p.beasts.reduce((sum, b) => sum + b.level, 0);

/**
 * Which save to keep when this device and the cloud disagree. Timestamps only count if this device has
 * actually seen the cloud copy. Otherwise a brand-new save could beat a real campaign just by being recent,
 * so the one with more progress wins.
 */
export function chooseSave(local: Profile, cloud: Profile | null): 'local' | 'cloud' {
  if (!cloud) return 'local';
  if (local.cloudSeen) return (cloud.savedAt ?? 0) > (local.savedAt ?? 0) ? 'cloud' : 'local';
  return progressScore(cloud) >= progressScore(local) ? 'cloud' : 'local';
}

let saveListener: ((p: Profile) => void) | null = null;

/** Lets another store mirror every save. */
export function setSaveListener(fn: (p: Profile) => void): void {
  saveListener = fn;
}

export function saveProfile(p: Profile): void {
  p.savedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { /* best effort */ }
  saveListener?.(p);
}

export function resetProfile(): Profile {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* best effort */ }
  return newProfile();
}
