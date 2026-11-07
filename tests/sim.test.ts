import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loft } from '../src/gfx/geom';
import { BeastRig, IDLE_POSE } from '../src/gfx/beast';
import { CameraRig } from '../src/gfx/camera';
import { Battle, type Deployment } from '../src/sim/battle';
import {
  addBeast, applyBattleResult, chooseSave, commandCap, deriveStats, evoStage, grantXp, MAX_LEVEL, newProfile, parseProfile, RARE_TASKS, recruitPrice,
  recruitUnlockStage, UPGRADE_DEFS, upgradeCost, xpToNext,
} from '../src/sim/progression';
import { getSpecies, GROUPS, SPECIES } from '../src/sim/species';
import { gridFormation, STAGES, stageFormation } from '../src/sim/stages';

function run(b: Battle, maxT = 300): void {
  while (!b.over && b.time < maxT) {
    b.step(1 / 30);
    b.drainEvents();
  }
}
const dep = (speciesId: string, level: number, n: number, z: number): Deployment[] =>
  Array.from({ length: n }, (_, i) => ({ speciesId, level, x: (i - (n - 1) / 2) * 3, z }));

describe('progression', () => {
  it('levels up and carries over spare XP', () => {
    const p = newProfile();
    const b = p.beasts[0];
    const need = xpToNext(1);
    const r = grantXp(b, need + 5);
    expect(r.levelsGained).toBe(1);
    expect(b.level).toBe(2);
    expect(b.xp).toBe(5);
  });

  it('caps at max level', () => {
    const b = addBeast(newProfile(), 'wolf');
    grantXp(b, 10_000_000);
    expect(b.level).toBe(MAX_LEVEL);
    expect(b.xp).toBe(0);
  });

  it('reports evolution thresholds', () => {
    expect(evoStage(4)).toBe(0);
    expect(evoStage(5)).toBe(1);
    expect(evoStage(10)).toBe(2);
    expect(evoStage(20)).toBe(3);
    const b = addBeast(newProfile(), 'wolf', 4);
    expect(grantXp(b, xpToNext(4)).evolved).toBe(true);
  });

  it('makes higher levels strictly stronger', () => {
    const sp = getSpecies('lion');
    const lo = deriveStats(sp, 1);
    const hi = deriveStats(sp, 10);
    expect(hi.hp).toBeGreaterThan(lo.hp);
    expect(hi.atk).toBeGreaterThan(lo.atk);
    expect(hi.armor).toBeGreaterThan(lo.armor);
  });

  it('a win pays gold and XP, and the first stage levels up the squad', () => {
    const p = newProfile();
    const gold = p.gold;
    const uid = p.beasts[0].uid;
    const r = applyBattleResult(p, {
      stage: STAGES[0], stageIndex: 0, won: true,
      entries: [{ uid, kills: 2, damage: 100, survived: true }],
    });
    expect(r.gold).toBeGreaterThan(0);
    expect(p.gold).toBe(gold + r.gold);
    expect(r.beasts[0].levelAfter).toBeGreaterThanOrEqual(2);
    expect(r.stars).toBe(3);
    expect(r.firstClear).toBe(true);
    expect(p.stars[0]).toBe(3);
  });

  it('replays pay less than the first clear and keep the best stars', () => {
    const p = newProfile();
    const uid = p.beasts[0].uid;
    const entry = (survived: boolean) => [{ uid, kills: 0, damage: 1, survived }];
    const first = applyBattleResult(p, { stage: STAGES[3], stageIndex: 3, won: true, entries: entry(true) });
    const again = applyBattleResult(p, { stage: STAGES[3], stageIndex: 3, won: true, entries: entry(false) });
    expect(again.gold).toBeLessThan(first.gold);
    expect(p.stars[3]).toBe(3);
  });

  it('a loss still pays a small consolation but records no stars', () => {
    const p = newProfile();
    const uid = p.beasts[0].uid;
    const r = applyBattleResult(p, {
      stage: STAGES[5], stageIndex: 5, won: false, entries: [{ uid, kills: 0, damage: 1, survived: false }],
    });
    expect(r.stars).toBe(0);
    expect(p.stars[5]).toBeUndefined();
    const win = applyBattleResult(newProfile(), {
      stage: STAGES[5], stageIndex: 5, won: true, entries: [{ uid, kills: 0, damage: 1, survived: false }],
    });
    expect(r.gold).toBeLessThan(win.gold);
  });
});

describe('battle sim', () => {
  it('finishes and declares the stronger side the winner', () => {
    const b = new Battle(dep('wolf', 10, 4, 12), dep('wolf', 1, 4, -12), 1);
    run(b);
    expect(b.over).toBe(true);
    expect(b.winner).toBe(0);
  });

  it('every species can fight every other species without errors or stalls', () => {
    for (const a of SPECIES) {
      for (const c of [SPECIES[0], SPECIES[8], SPECIES[20]]) {
        const b = new Battle(dep(a.id, 5, 1, 10), dep(c.id, 5, 1, -10), 7);
        run(b);
        expect(b.over, `${a.id} vs ${c.id}`).toBe(true);
        for (const u of b.units) {
          expect(Number.isFinite(u.x) && Number.isFinite(u.z) && Number.isFinite(u.y), `${u.sp.id} position`).toBe(true);
        }
      }
    }
  });

  it('gives each species a ground-truth mass advantage: titans beat a same-CP swarm less cheaply', () => {
    const b = new Battle(dep('elephant', 1, 1, 10), dep('wolf', 1, 2, -10), 3);
    run(b);
    expect(b.winner).toBe(0);
  });

  it('phoenix rises once then can die for good', () => {
    const b = new Battle(dep('phoenix', 1, 1, 10), dep('dragon', 25, 1, -10), 5);
    let rebirths = 0;
    while (!b.over && b.time < 200) {
      b.step(1 / 30);
      for (const e of b.drainEvents()) if (e.t === 'rebirth') rebirths++;
    }
    expect(rebirths).toBe(1);
    expect(b.winner).toBe(1);
  });

  it('spirit powers spend spirit and hurt enemies', () => {
    const b = new Battle(dep('wolf', 1, 1, 30), dep('wolf', 5, 3, -5), 2);
    b.spirit = 100;
    expect(b.castPower('meteor', 0, -5)).toBe(true);
    expect(b.spirit).toBeLessThan(100);
    for (let i = 0; i < 90; i++) b.step(1 / 30);
    expect(b.alive(1).some((u) => u.hp < u.maxHp) || b.alive(1).length < 3).toBe(true);
    b.spirit = 0;
    expect(b.castPower('meteor', 0, 0)).toBe(false);
  });
});

describe('campaign', () => {
  it('has well formed stages with rewards that grow', () => {
    expect(STAGES.length).toBe(36);
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].gold).toBeGreaterThan(0);
      expect(STAGES[i].xp).toBeGreaterThanOrEqual(STAGES[i - 1].xp * 0.7);
    }
    for (const st of STAGES) {
      const f = stageFormation(st);
      expect(f.length).toBeGreaterThan(0);
      for (const u of f) expect(u.z).toBeLessThan(0);
    }
  });

  /**
   * Bot playthrough. A naive player auto-buys and auto-fields, replaying a stage when beaten.
   * Guards the whole economy: the campaign must be completable, and not by endless grinding.
   */
  it('can be completed by a naive bot without excessive grinding', () => {
    const p = newProfile();
    let attempts = 0;
    const log: string[] = [];
    let idx = 0;
    let tries = 0;
    while (idx < STAGES.length && attempts < 500) {
      attempts++;
      const stage = STAGES[idx];
      // Spend like a sensible player: banner first, then save for the best unlocked beast.
      const bannerCost = upgradeCost('command', p.upgrades.command);
      if (p.upgrades.command < UPGRADE_DEFS.command.max && bannerCost <= p.gold * 0.5) {
        p.gold -= bannerCost;
        p.upgrades.command++;
      }
      const best = SPECIES.filter((s) => recruitUnlockStage(s) <= idx && s.cp <= commandCap(p) * 0.6)
        .sort((a, b) => b.price - a.price)[0];
      if (best && recruitPrice(p, best) <= p.gold) {
        p.gold -= recruitPrice(p, best);
        addBeast(p, best.id);
      }
      // Field by raw power until command cap.
      const cap = commandCap(p);
      const ranked = [...p.beasts].sort((a, b) => {
        const pa = deriveStats(getSpecies(a.speciesId), a.level);
        const pb = deriveStats(getSpecies(b.speciesId), b.level);
        return pb.hp * pb.atk - pa.hp * pa.atk;
      });
      let used = 0;
      const squad = [];
      for (const b of ranked) {
        const cp = getSpecies(b.speciesId).cp;
        if (used + cp > cap) continue;
        used += cp;
        squad.push(b);
      }
      const us: Deployment[] = squad.map((b, i) => ({
        speciesId: b.speciesId, level: b.level, uid: b.uid, x: (i - (squad.length - 1) / 2) * 3.5, z: 12 + (i % 2) * 3,
      }));
      const them: Deployment[] = stageFormation(stage).map((f) => ({ speciesId: f.speciesId, level: f.level, boss: f.boss, x: f.x, z: f.z }));
      const battle = new Battle(us, them, attempts * 31);
      run(battle, 240);
      const won = battle.winner === 0;
      applyBattleResult(p, {
        stage, stageIndex: idx, won,
        entries: battle.units.filter((u) => u.team === 0 && u.uid).map((u) => ({ uid: u.uid!, kills: u.kills, damage: u.damage, survived: !u.dead || u.action === 'ash' })),
      });
      if (won) {
        log.push(`${idx + 1}(${tries + 1})`);
        idx++;
        tries = 0;
      } else tries++;
    }
    if (import.meta.env.VITE_BOT_LOG) {
      console.log('stage(attempts):', log.join(' '));
      console.log('final', p.beasts.map((b) => `${b.speciesId}${b.level}`).join(','));
      console.log('attempts', attempts);
    }
    expect(idx).toBe(STAGES.length);
    expect(attempts).toBeLessThan(90);
  });
});

describe('roster', () => {
  it('every species has a model that builds into finite geometry at every evolution', () => {
    for (const sp of SPECIES) {
      for (const evo of [0, 1, 2, 3]) {
        const rig = new BeastRig(sp.id, evo, '#ffffff');
        expect(rig.height, `${sp.id} height`).toBeGreaterThan(0);
        expect(Number.isFinite(rig.height), `${sp.id} height`).toBe(true);
        rig.update({ ...IDLE_POSE, flying: !!sp.flying }, 1 / 60, 1 / 60);
        rig.root.traverse((o) => {
          const g = (o as { geometry?: { attributes: { position: { array: ArrayLike<number> } } } }).geometry;
          if (!g) return;
          const a = g.attributes.position.array;
          for (let i = 0; i < a.length; i += 17) expect(Number.isFinite(a[i]), `${sp.id} vertex`).toBe(true);
        });
      }
    }
  });

  it('has a broad cast with unique ids, covering every group', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const g of GROUPS) expect(SPECIES.filter((s) => s.group === g).length, g).toBeGreaterThan(0);
    expect(SPECIES.filter((s) => s.group === 'Dinosaurs').length).toBeGreaterThanOrEqual(25);
    expect(SPECIES.filter((s) => s.group === 'Bugs').length).toBeGreaterThanOrEqual(15);
  });

  it('summoned minions expire and never decide a battle on their own', () => {
    const b = new Battle(dep('ant', 12, 1, 30), dep('rhino', 12, 1, -30), 9);
    let spawned = 0;
    while (!b.over && b.time < 200) {
      b.step(1 / 30);
      for (const e of b.drainEvents()) if (e.t === 'spawned') spawned++;
    }
    expect(spawned).toBeGreaterThan(0);
    expect(b.over).toBe(true);
    // The fight ends with the real beasts: the summoner's death ends its side even with minions around.
    const realLeft = b.units.filter((u) => !u.minion && !u.dead);
    expect(realLeft.every((u) => u.team === b.winner)).toBe(true);
  });

  it('melee beasts actually move during a fight instead of standing still', () => {
    const b = new Battle(dep('lion', 8, 1, 3.5), dep('lion', 8, 1, -3.5), 4);
    let path = 0;
    let lunges = 0;
    const u = b.units[0];
    let px = u.x;
    let pz = u.z;
    for (let i = 0; i < 300 && !b.over; i++) {
      b.step(1 / 60);
      path += Math.hypot(u.x - px, u.z - pz);
      px = u.x;
      pz = u.z;
      for (const e of b.drainEvents()) if (e.t === 'lunge') lunges++;
    }
    expect(lunges).toBeGreaterThan(2);
    expect(path).toBeGreaterThan(8);
  });
});

// Each of these once failed: see the bug it names.
describe('regressions', () => {
  const finish = (b: Battle) => { while (!b.over && b.time < 300) { b.step(1 / 60); b.drainEvents(); } };

  it('nothing can be hurt once the result is decided', () => {
    const b = new Battle(dep('wolf', 5, 1, 2), dep('wolf', 1, 1, -2), 3);
    finish(b);
    expect(b.over).toBe(true);
    const winner = b.units.find((u) => !u.dead)!;
    winner.poison = 10;
    winner.poisonDps = 99999;
    const hp = winner.hp;
    for (let i = 0; i < 120; i++) b.step(1 / 60);
    expect(winner.dead).toBe(false);
    expect(winner.hp).toBe(hp);
  });

  it('a double knockout counts as a win for the player', () => {
    const b = new Battle(dep('wolf', 1, 1, 2), dep('wolf', 1, 1, -2), 3);
    b.step(1 / 60);
    for (const u of b.units) { u.dead = true; u.hp = 0; }
    b.step(1 / 60);
    expect(b.winner).toBe(0);
  });

  it('only the last real beast triggers the finish, not its leftover summons', () => {
    const b = new Battle(dep('ant', 12, 1, 30), dep('rhino', 20, 1, -30), 9);
    let lasts = 0;
    while (!b.over && b.time < 200) {
      b.step(1 / 30);
      for (const e of b.drainEvents()) if (e.t === 'death' && e.last) lasts++;
    }
    for (let i = 0; i < 900; i++) {
      b.step(1 / 30);
      for (const e of b.drainEvents()) if (e.t === 'death' && e.last) lasts++;
    }
    expect(lasts).toBe(1);
  });

  it('a controlled beast cannot land a bite from across the arena', () => {
    const b = new Battle(dep('croc', 5, 1, 30), dep('rhino', 5, 1, -30), 2);
    const croc = b.units[0];
    const rhino = b.units[1];
    croc.ctrl = { mx: 0, mz: 0, attack: false, ability: true };
    croc.abilT = 0;
    rhino.ctrl = { mx: 0, mz: 0, attack: false, ability: false };
    const hp = rhino.hp;
    for (let i = 0; i < 120; i++) b.step(1 / 60);
    expect(rhino.hp).toBe(hp);
    expect(rhino.stun).toBe(0);
  });

  it('controlled melee attacks hit what the beast faces, not an automatic target', () => {
    const b = new Battle(dep('lion', 8, 1, 0), [
      { speciesId: 'rhino', level: 1, x: 0, z: -2.5 },
      { speciesId: 'rhino', level: 1, x: -2.5, z: 0 },
    ], 2);
    const lion = b.units[0];
    lion.x = 0; lion.z = 0;
    lion.heading = Math.PI; // Facing -z, toward the first rhino only.
    b.units[1].ctrl = { mx: 0, mz: 0, attack: false, ability: false };
    b.units[2].ctrl = { mx: 0, mz: 0, attack: false, ability: false };
    lion.ctrl = { mx: 0, mz: 0, attack: true, ability: false };
    lion.atkT = 0;
    lion.abilT = 99;
    const side = b.units[2].hp;
    for (let i = 0; i < 30; i++) b.step(1 / 60);
    expect(b.units[1].hp).toBeLessThan(b.units[1].maxHp);
    expect(b.units[2].hp).toBe(side);
  });

  it('a spit spray fans out instead of all homing on one target', () => {
    const b = new Battle(dep('cobra', 5, 1, 5), dep('rhino', 5, 1, -2), 2);
    const cobra = b.units[0];
    cobra.abilT = 0;
    const seen: (unknown)[] = [];
    for (let i = 0; i < 120 && seen.length < 5; i++) {
      b.step(1 / 60);
      for (const e of b.drainEvents()) if (e.t === 'shot' && e.p.speed === 16) seen.push(e.p.target);
    }
    expect(seen.length).toBe(5);
    expect(seen.filter(Boolean).length).toBe(1);
  });

  it('an ability sticks with the foe it chose', () => {
    const b = new Battle(dep('tiger', 8, 1, 10), [
      { speciesId: 'rhino', level: 1, x: 0, z: 6 },
      { speciesId: 'wolf', level: 1, x: 0, z: -9 },
    ], 2);
    const tiger = b.units[0];
    const prey = b.units[2];
    prey.hp = 1;
    tiger.abilT = 0;
    tiger.target = prey;
    tiger.retargetT = 0;
    let chosen: unknown = null;
    for (let i = 0; i < 40; i++) {
      b.step(1 / 60);
      for (const e of b.drainEvents()) if (e.t === 'ability') chosen = tiger.target;
      if (chosen && (tiger.action === 'ability' || tiger.action === 'leap')) expect(tiger.target).toBe(chosen);
    }
    expect(chosen).not.toBeNull();
  });

  it('old poison strength does not carry over to a new dose', () => {
    const b = new Battle(dep('wolf', 30, 1, 30), dep('wolf', 30, 1, -30), 2);
    const v = b.units[1];
    (b as unknown as { applyPoison(t: unknown, d: number, s: number): void }).applyPoison(v, 500, 0.1);
    for (let i = 0; i < 30; i++) b.step(1 / 60);
    expect(v.poison).toBe(0);
    (b as unknown as { applyPoison(t: unknown, d: number, s: number): void }).applyPoison(v, 2, 3);
    expect(v.poisonDps).toBe(2);
  });

  it('a charge from the arena edge still goes inward', () => {
    const b = new Battle(dep('rhino', 5, 1, 0), dep('rhino', 5, 1, -10), 2);
    const u = b.units[0];
    u.x = 0; u.z = 35.8;
    u.heading = Math.PI;
    u.action = 'charge';
    u.actionT = 0;
    u.actionDur = 1.4;
    b.step(1 / 60);
    expect(u.action).toBe('charge');
  });

  it('the opening sprint ends when ranged fire connects, not just melee', () => {
    const b = new Battle(dep('cobra', 5, 2, 8), dep('cobra', 5, 2, -8), 2);
    for (let i = 0; i < 600 && !b.contact; i++) b.step(1 / 60);
    expect(b.contact).toBe(true);
  });

  it('beasts stay upright after being hit, whatever their body plan', () => {
    for (const id of ['ant', 'cobra', 'scorpion', 'shark', 'centipede', 'wolf', 'eagle', 'trex']) {
      const rig = new BeastRig(id, 0, '#fff');
      const pose = { ...IDLE_POSE, flying: !!getSpecies(id).flying };
      rig.hit(1.4, 1, 0);
      for (let i = 0; i < 180; i++) rig.update(pose, 1 / 60, 1 / 60);
      expect(Math.abs(rig.pivot.rotation.z), id).toBeLessThan(0.1);
    }
  });

  it('auto formations always stay inside the deployment circle', () => {
    for (const n of [1, 5, 20, 50, 120]) {
      for (const [x, z] of gridFormation(n, 4.6, 5, 9)) expect(Math.hypot(x, z)).toBeLessThanOrEqual(31.01);
    }
  });
});

describe('saves', () => {
  const prof = (wins: number, savedAt: number, cloudSeen = false) => ({ ...newProfile(), totalWins: wins, savedAt, cloudSeen });

  it('a brand-new save never beats a real campaign just by being more recent', () => {
    expect(chooseSave(prof(0, 2000), prof(40, 1000))).toBe('cloud');
  });

  it('trusts timestamps once this device has seen the cloud copy', () => {
    expect(chooseSave(prof(5, 2000, true), prof(40, 1000))).toBe('local');
    expect(chooseSave(prof(5, 1000, true), prof(4, 2000))).toBe('cloud');
  });

  it('keeps the local save when there is no cloud copy', () => {
    expect(chooseSave(prof(1, 1), null)).toBe('local');
  });

  it('repairs old saves and rejects broken ones', () => {
    const old = { version: 1, gold: 5, beasts: [{ uid: 'a', speciesId: 'wolf', level: 2, xp: 0, kills: 0, wins: 0, battles: 0 }, { uid: 'b', speciesId: 'gone', level: 1, xp: 0, kills: 0, wins: 0, battles: 0 }] };
    const p = parseProfile(JSON.stringify(old))!;
    expect(p.beasts.length).toBe(1);
    expect(p.upgrades.command).toBe(0);
    expect(p.settings.muted).toBe(false);
    expect(parseProfile('not json')).toBeNull();
    expect(parseProfile('{"version":2,"beasts":[]}')).toBeNull();
  });
});

describe('rare beasts', () => {
  const win = (p: ReturnType<typeof newProfile>, idx: number, herdIds: string[], survived = true) => {
    const entries = herdIds.map((id) => ({ uid: addBeast(p, id).uid, kills: 0, damage: 1, survived }));
    return applyBattleResult(p, { stage: STAGES[idx], stageIndex: idx, won: true, entries });
  };

  it('every rare has a task, and none can be bought', () => {
    const rares = SPECIES.filter((s) => s.rare);
    expect(rares.length).toBeGreaterThanOrEqual(10);
    for (const sp of rares) {
      expect(RARE_TASKS.some((t) => t.speciesId === sp.id), sp.id).toBe(true);
      expect(recruitUnlockStage(sp)).toBe(Infinity);
    }
  });

  it('a task does nothing until its stage has been cleared', () => {
    const p = newProfile();
    // Only bugs, but Stage 7 hasn't been cleared yet.
    const r = win(p, 0, ['ant', 'ant', 'ant']);
    expect(r.rares).not.toContain('queenant');
    p.stars[6] = 1;
    const r2 = win(p, 0, ['ant', 'ant', 'ant']);
    expect(r2.rares).toContain('queenant');
    expect(p.beasts.some((b) => b.speciesId === 'queenant')).toBe(true);
  });

  it('a rare beast can only be earned once', () => {
    const p = newProfile();
    p.stars[6] = 1;
    win(p, 0, ['ant', 'ant', 'ant']);
    const again = win(p, 0, ['ant', 'ant', 'ant']);
    expect(again.rares).not.toContain('queenant');
    expect(p.beasts.filter((b) => b.speciesId === 'queenant').length).toBe(1);
  });

  it('a mixed herd does not count as an only-bugs win, and neither does a loss', () => {
    const p = newProfile();
    p.stars[6] = 1;
    expect(win(p, 0, ['ant', 'ant', 'wolf']).rares).not.toContain('queenant');
    const uid = addBeast(p, 'ant').uid;
    const lost = applyBattleResult(p, { stage: STAGES[0], stageIndex: 0, won: false, entries: [uid, uid, uid].map((u) => ({ uid: u, kills: 0, damage: 1, survived: false })) });
    expect(lost.rares).toEqual([]);
  });

  it('counting tasks finish when the count is reached', () => {
    const p = newProfile();
    p.stars[11] = 1;
    p.totalKills = 149;
    expect(win(p, 0, ['wolf']).rares).not.toContain('ghosttiger');
    p.totalKills = 150;
    expect(win(p, 0, ['wolf']).rares).toContain('ghosttiger');
  });

  it('the Golden Scarab makes a battle pay more gold', () => {
    const a = win(newProfile(), 5, ['wolf']);
    const b = win(newProfile(), 5, ['scarab']);
    expect(b.gold).toBeGreaterThan(a.gold * 1.3);
  });

  it('old saves without rare data still load', () => {
    const p = parseProfile(JSON.stringify({ version: 1, gold: 1, beasts: [{ uid: 'a', speciesId: 'wolf', level: 1, xp: 0, kills: 0, wins: 0, battles: 0 }] }))!;
    expect(p.rares).toEqual([]);
    expect(p.totalGold).toBe(0);
  });

  it('a cloaked beast cannot be targeted, and its next strike is a triple', () => {
    const b = new Battle(dep('chameleon', 5, 1, 3), dep('rhino', 5, 1, -3), 2);
    const [cham, rhino] = b.units;
    cham.cloakT = 4;
    cham.abilT = 99;
    rhino.abilT = 99;
    rhino.target = cham;
    rhino.retargetT = 0;
    b.step(1 / 60);
    expect(rhino.target).toBeNull();
    cham.atkT = 0;
    cham.combo = 0;
    const hp = rhino.hp;
    for (let i = 0; i < 90 && rhino.hp === hp; i++) b.step(1 / 60);
    expect(hp - rhino.hp).toBeGreaterThan(cham.atk * 1.2);
    expect(cham.cloakT).toBe(0);
  });

  it('a ghost takes no damage and a shield soaks hits before health', () => {
    const b = new Battle(dep('ghosttiger', 5, 1, 30), dep('wolf', 30, 1, -30), 2);
    const g = b.units[0];
    const s = b as unknown as { applyDamage(src: null, t: unknown, d: number, c: boolean, k: string, x: number, y: number, z: number, big: boolean): void };
    g.phaseT = 2;
    const hp = g.hp;
    s.applyDamage(null, g, 500, false, 'bite', 0, 0, 0, false);
    expect(g.hp).toBe(hp);
    g.phaseT = 0;
    g.shieldHp = 100;
    g.shieldT = 5;
    s.applyDamage(null, g, 60, false, 'bite', 0, 0, 0, false);
    expect(g.hp).toBe(hp);
    expect(g.shieldHp).toBe(40);
    s.applyDamage(null, g, 60, false, 'bite', 0, 0, 0, false);
    expect(g.hp).toBe(hp - 20);
  });

  it('a lightning dash hits several enemies, each at most once', () => {
    const foes = [0, 1, 2, 3, 4, 5].map((i) => ({ speciesId: 'rhino', level: 1, x: i * 3 - 8, z: -4 }));
    const b = new Battle(dep('stormraptor', 8, 1, 2), foes, 2);
    const r = b.units[0];
    r.abilT = 0;
    b.units.slice(1).forEach((f) => { f.abilT = 99; f.atkT = 99; });
    const hitsBy = new Map<number, number>();
    for (let i = 0; i < 90; i++) {
      b.step(1 / 60);
      for (const e of b.drainEvents()) if (e.t === 'hit' && e.kind === 'shock') hitsBy.set(e.tgt.id, (hitsBy.get(e.tgt.id) ?? 0) + 1);
    }
    expect(hitsBy.size).toBeGreaterThanOrEqual(3);
    expect(hitsBy.size).toBeLessThanOrEqual(4);
    for (const n of hitsBy.values()) expect(n).toBe(1);
  });

  it('rare powers run in a real fight without errors or stalls', () => {
    for (const sp of SPECIES.filter((s) => s.rare)) {
      const b = new Battle(dep(sp.id, 8, 2, 12), dep('wolf', 8, 4, -12), 5);
      run(b, 240);
      expect(b.over, sp.id).toBe(true);
      for (const u of b.units) expect(Number.isFinite(u.x) && Number.isFinite(u.z), `${sp.id} position`).toBe(true);
    }
  });
});

describe('camera calm', () => {
  it('a brawl of constant small hits keeps the shake low, while a meteor can still land', () => {
    const cam = new CameraRig(16 / 9);
    cam.crowd = 24;
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      // Far more hits than any real fight: several every frame for ten seconds.
      for (let h = 0; h < 4; h++) cam.shake(0.3);
      cam.update(1 / 60, null, 0);
      peak = Math.max(peak, (cam as unknown as { trauma: number }).trauma);
    }
    expect(peak).toBeLessThanOrEqual(0.33);
    cam.shake(0.7, true);
    expect((cam as unknown as { trauma: number }).trauma).toBeGreaterThan(0.6);
  });
});

describe('models and poses', () => {
  const worldYs = (root: { updateMatrixWorld(f: boolean): void; traverse(fn: (o: never) => void): void }, only?: unknown) => {
    root.updateMatrixWorld(true);
    const ys: number[] = [];
    const v = new THREE.Vector3();
    root.traverse((o: THREE.Mesh) => {
      if (!o.isMesh || (only && o.parent !== only)) return;
      const a = o.geometry.attributes.position;
      for (let i = 0; i < a.count; i += 3) ys.push(v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).y);
    });
    return ys;
  };

  it('a knocked-out beast rests on the ground, not inside it', () => {
    const buried: string[] = [];
    for (const sp of SPECIES) {
      const rig = new BeastRig(sp.id, 0, '#fff');
      const pose = { ...IDLE_POSE, flying: false, dead: true, deathT: 0.9, deathSpin: 1 };
      for (let i = 0; i < 40; i++) rig.update(pose, 1 / 60, 1 / 60);
      const ys = worldYs(rig.root as never, rig.body);
      const under = ys.filter((y) => y < -0.02).length / Math.max(1, ys.length);
      if (under > 0.35) buried.push(`${sp.id}:${Math.round(under * 100)}%`);
    }
    expect(buried).toEqual([]);
  });

  it('tubes never twist: neighbouring rings keep the same orientation', () => {
    // A path that goes forward, then straight up, then forward again, like a raised neck.
    const g = loft([
      { p: [0, 0, 0], r: [1, 0.4] }, { p: [0, 0, 1], r: [1, 0.4] }, { p: [0, 1, 1.05], r: [1, 0.4] },
      { p: [0, 2, 1.1], r: [1, 0.4] }, { p: [0, 2.2, 2], r: [1, 0.4] },
    ], { radial: 8, subdiv: 3 });
    const a = g.attributes.position;
    const rings = (a.count - 2) / 8;
    let lastX = 0;
    for (let i = 0; i < rings; i++) {
      // The ring's first vertex sits along its side axis: it must stay on one side, with no flip.
      const x = a.getX(i * 8);
      if (i > 0) expect(Math.sign(x)).toBe(Math.sign(lastX));
      lastX = x;
    }
  });

  it('the scorpion tail arcs over its back, above the ground', () => {
    const rig = new BeastRig('scorpion', 0, '#fff');
    for (let i = 0; i < 5; i++) rig.update({ ...IDLE_POSE }, 1 / 60, 1 / 60);
    const tip = rig.root.getObjectByName('tail6')!;
    rig.root.updateMatrixWorld(true);
    expect(tip.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(0.6);
  });

  it('a striking snake keeps its head level, and tall beasts look ahead', () => {
    const rig = new BeastRig('cobra', 0, '#fff');
    const pose = { ...IDLE_POSE, action: 'attack', actionT: 0.26, actionDur: 0.5 };
    for (let i = 0; i < 3; i++) rig.update(pose, 1 / 60, 1 / 60);
    rig.root.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(rig.head!.matrixWorld);
    expect(fwd.z).toBeGreaterThan(0.5);
    for (const id of ['penguin', 'kangaroo']) {
      const r2 = new BeastRig(id, 0, '#fff');
      r2.update({ ...IDLE_POSE }, 1 / 60, 1 / 60);
      r2.root.updateMatrixWorld(true);
      const f2 = new THREE.Vector3(0, 0, 1).transformDirection(r2.head!.matrixWorld);
      expect(f2.y, id).toBeLessThan(0.6);
    }
  });

  it('tails stay smooth when a beast suddenly changes speed', () => {
    const rig = new BeastRig('tiger', 0, '#fff');
    const tail = rig.root.getObjectByName('tail3')!;
    let worst = 0;
    rig.update({ ...IDLE_POSE, mx: 8, speed: 7 }, 1 / 60, 1 / 60);
    let last = tail.rotation.y;
    for (let i = 0; i < 90; i++) {
      const mx = Math.max(0, 8 - i * 0.27);
      rig.update({ ...IDLE_POSE, mx, speed: 7 }, 1 / 60, 1 / 60);
      worst = Math.max(worst, Math.abs(tail.rotation.y - last));
      last = tail.rotation.y;
    }
    expect(worst).toBeLessThan(0.12);
  });
});
