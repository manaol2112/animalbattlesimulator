// Headless battle simulation. Renders nothing: it emits events the view turns into spectacle.
import { deriveStats, evoStage } from './progression';
import { getSpecies, type AbilityId, type Species } from './species';

export const ARENA_RADIUS = 36;
const GRAVITY = 26;
const HOVER_HEIGHT = 3.4;

export interface Deployment {
  speciesId: string; level: number; x: number; z: number; uid?: string; boss?: boolean;
}

export type Action = 'ready' | 'attack' | 'ability' | 'charge' | 'leap' | 'breath' | 'roll' | 'ash';

/** Small summons live only this long. */
const MINION_LIFE = 13;

const WINDUPS: Partial<Record<AbilityId, number>> = {
  charge: 0.55, howl: 0.5, roar: 0.55, rage: 0.45, slam: 0.75, quake: 1.0, frostQuake: 1.0, pounce: 0.35,
  dive: 0.4, heal: 0.6, chain: 0.5, fireRain: 0.7, fireBreath: 0.7, frostBreath: 0.7, deathRoll: 0.3, sting: 0.4, spit: 0.4,
  tailWhip: 0.42, swarm: 0.5, cloak: 0.25, midas: 0.45, brood: 0.7, chainDash: 0.25, shield: 0.5, lance: 0.5, phase: 0.25, meteorStomp: 0.9, cosmicSong: 0.9,
};

export interface Unit {
  id: number; team: 0 | 1; sp: Species; level: number; evo: number; uid?: string; boss: boolean;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; mx: number; mz: number;
  heading: number; hp: number; maxHp: number; atk: number; armor: number; speed: number; range: number;
  mass: number; radius: number; scale: number; cooldown: number; abilityCd: number; critChance: number;
  flying: boolean; ranged: boolean;
  dead: boolean; deathT: number; deathSpin: number;
  action: Action; actionT: number; actionDur: number; struck: boolean;
  atkT: number; abilT: number; retargetT: number; target: Unit | null;
  stun: number; slow: number; slowMult: number; poison: number; poisonDps: number; burn: number; burnDps: number;
  buff: number; buffMult: number; rage: number; frozen: number;
  leapFrom: [number, number]; leapTo: [number, number]; leapH: number; hitSet: Set<number>; tick: number;
  rebirthReady: boolean;
  kills: number; damage: number; lastAttacker: Unit | null;
  ctrl: { mx: number; mz: number; attack: boolean; ability: boolean } | null;
  /** Position in the three-hit attack string. */
  combo: number;
  lunged: boolean;
  /** Reeling from a hard hit: can't act, briefly. */
  stagger: number;
  /** Which way this beast circles its opponent. */
  orbit: number;
  bumpT: number;
  spinT: number;
  /** Invisible: can't be targeted, and the next melee hit triples. */
  cloakT: number;
  /** Ghost form: immune, and walks through other beasts. */
  phaseT: number;
  shieldHp: number;
  shieldT: number;
  /** Turned to gold: frozen in place with a shine. */
  goldT: number;
  hops: number;
  minion: boolean;
  expire: number;
}

export type BattleEvent =
  | { t: 'lunge'; u: Unit; combo: number }
  | { t: 'clash'; a: Unit; b: Unit; x: number; y: number; z: number }
  | { t: 'bump'; a: Unit; b: Unit; x: number; z: number; force: number }
  | { t: 'spawned'; u: Unit; by: Unit }
  | { t: 'expire'; u: Unit }
  | { t: 'hit'; src: Unit | null; tgt: Unit; dmg: number; crit: boolean; x: number; y: number; z: number; kind: HitKind; big: boolean; finisher: boolean }
  | { t: 'death'; u: Unit; by: Unit | null; last: boolean }
  | { t: 'swing'; u: Unit }
  | { t: 'ability'; u: Unit; id: AbilityId; x: number; z: number }
  | { t: 'abilityFire'; u: Unit; id: AbilityId; x: number; z: number }
  | { t: 'shot'; p: Projectile }
  | { t: 'shotEnd'; p: Projectile; x: number; y: number; z: number }
  | { t: 'heal'; u: Unit; amount: number }
  | { t: 'land'; u: Unit; force: number }
  | { t: 'chain'; pts: [number, number, number][] }
  | { t: 'breathTick'; u: Unit; id: AbilityId; x: number; y: number; z: number; dx: number; dz: number; range: number }
  | { t: 'strike'; kind: 'firerain' | 'meteor' | 'lightning'; x: number; z: number; radius: number }
  | { t: 'incoming'; kind: 'firerain' | 'meteor' | 'lightning'; x: number; z: number; radius: number; delay: number }
  | { t: 'power'; kind: PowerId; x: number; z: number }
  | { t: 'rebirth'; u: Unit }
  | { t: 'ashes'; u: Unit }
  | { t: 'status'; u: Unit; s: 'stun' | 'poison' | 'burn' | 'freeze' | 'slow' | 'buff' | 'rage' | 'shield' | 'gold' }
  | { t: 'absorb'; u: Unit };

export type HitKind = 'bite' | 'claw' | 'horn' | 'venom' | 'fire' | 'ice' | 'shock' | 'earth' | 'dot';

export interface Projectile {
  id: number; kind: 'venom' | 'bolt' | 'flame' | 'ice'; team: 0 | 1; src: Unit; target: Unit | null;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; speed: number; life: number;
  dmg: number; splash: number; alive: boolean;
}

export type PowerId = 'rally' | 'meteor' | 'storm';
export const POWERS: Record<PowerId, { name: string; cost: number; desc: string; targeted: boolean; unlock: number; key: string }> = {
  rally: { name: 'Rally Bloom', cost: 35, desc: 'Heal your whole herd and boost their attack.', targeted: false, unlock: 0, key: '1' },
  meteor: { name: 'Meteor', cost: 60, desc: 'Call a meteor down on the battlefield.', targeted: true, unlock: 2, key: '2' },
  storm: { name: 'Sky Rend', cost: 45, desc: 'Lightning strikes every enemy around the target point.', targeted: true, unlock: 7, key: '3' },
};

interface Delayed { t: number; fn: () => void; }

class Rng {
  constructor(private s: number) {}
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
}

const hypot = (x: number, z: number) => Math.sqrt(x * x + z * z);
/** Per-frame decay expressed so it behaves the same at any frame rate (`k` is the factor at 60fps). */
const decay = (k: number, dt: number) => Math.pow(k, dt * 60);
/** The matching per-frame blend amount, for easing toward a target. */
const blend = (k: number, dt: number) => 1 - Math.pow(1 - k, dt * 60);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angleTo = (dx: number, dz: number) => Math.atan2(dx, dz);
/** Shortest signed turn from angle `a` to angle `b`. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Battle {
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  events: BattleEvent[] = [];
  time = 0;
  over = false;
  winner: 0 | 1 | null = null;
  spirit = 25;
  spiritRate = 2.6;
  /** Everyone sprints until the two lines first collide. */
  contact = false;
  private delayed: Delayed[] = [];
  private rng: Rng;
  private nextId = 1;

  constructor(teamA: Deployment[], teamB: Deployment[], seed = 12345) {
    this.rng = new Rng(seed);
    teamA.forEach((d) => this.spawn(d, 0));
    teamB.forEach((d) => this.spawn(d, 1));
  }

  private spawn(d: Deployment, team: 0 | 1): Unit {
    const sp = getSpecies(d.speciesId);
    const st = deriveStats(sp, d.level, d.boss);
    const u: Unit = {
      id: this.nextId++, team, sp, level: d.level, evo: evoStage(d.level), uid: d.uid, boss: !!d.boss,
      x: d.x, y: sp.flying ? HOVER_HEIGHT : 0, z: d.z, vx: 0, vy: 0, vz: 0, mx: 0, mz: 0,
      heading: team === 0 ? Math.PI : 0, hp: st.hp, maxHp: st.hp, atk: st.atk, armor: st.armor, speed: st.speed,
      range: st.range, mass: st.mass, radius: st.radius, scale: st.scale, cooldown: st.cooldown, abilityCd: st.abilityCd,
      critChance: st.critChance, flying: !!sp.flying, ranged: !!sp.ranged,
      dead: false, deathT: 0, deathSpin: 0, action: 'ready', actionT: 0, actionDur: 0, struck: false,
      atkT: this.rng.range(0, 0.5), abilT: st.abilityCd * this.rng.range(0.35, 0.8), retargetT: 0, target: null,
      stun: 0, slow: 0, slowMult: 1, poison: 0, poisonDps: 0, burn: 0, burnDps: 0, buff: 0, buffMult: 1, rage: 0, frozen: 0,
      leapFrom: [0, 0], leapTo: [0, 0], leapH: 0, hitSet: new Set(), tick: 0,
      rebirthReady: sp.ability === 'fireRain',
      kills: 0, damage: 0, lastAttacker: null, ctrl: null,
      combo: 0, lunged: false, stagger: 0, orbit: this.rng.next() < 0.5 ? 1 : -1, bumpT: 0, spinT: 0, cloakT: 0, phaseT: 0, shieldHp: 0, shieldT: 0, goldT: 0, hops: 0, minion: false, expire: 0,
    };
    this.units.push(u);
    return u;
  }

  drainEvents(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  alive(team: 0 | 1): Unit[] {
    return this.units.filter((u) => u.team === team && !u.dead);
  }

  /** Living strength of a team (0–1) relative to how it started. */
  teamHealth(team: 0 | 1): number {
    let hp = 0;
    let max = 0;
    for (const u of this.units) {
      if (u.team !== team || u.minion) continue;
      max += u.maxHp;
      if (!u.dead) hp += u.hp;
    }
    return max ? hp / max : 0;
  }

  // ── Player spirit powers ────────────────────────────────
  canCast(power: PowerId): boolean {
    return !this.over && this.spirit >= POWERS[power].cost;
  }

  castPower(power: PowerId, x: number, z: number): boolean {
    if (!this.canCast(power)) return false;
    this.spirit -= POWERS[power].cost;
    this.events.push({ t: 'power', kind: power, x, z });
    const power10 = 40 + this.avgLevel(0) * 12;
    if (power === 'rally') {
      for (const u of this.alive(0)) {
        const amount = u.maxHp * 0.3;
        this.healUnit(u, amount);
        u.buff = 6;
        u.buffMult = 1.3;
      }
    } else if (power === 'meteor') {
      const radius = 8;
      this.events.push({ t: 'incoming', kind: 'meteor', x, z, radius, delay: 1.0 });
      this.after(1.0, () => {
        this.events.push({ t: 'strike', kind: 'meteor', x, z, radius });
        this.areaDamage(null, 1, x, z, radius, power10 * 5, { kb: 26, lift: 14, kind: 'fire', falloff: true, burn: power10 * 0.3 });
      });
    } else {
      const targets = this.alive(1)
        .map((u) => ({ u, d: hypot(u.x - x, u.z - z) }))
        .filter((o) => o.d < 13)
        .sort((a, b) => a.d - b.d)
        .slice(0, 8);
      targets.forEach((o, i) => {
        const delay = 0.12 + i * 0.12;
        this.events.push({ t: 'incoming', kind: 'lightning', x: o.u.x, z: o.u.z, radius: 2.4, delay });
        this.after(delay, () => {
          const px = o.u.dead ? x : o.u.x;
          const pz = o.u.dead ? z : o.u.z;
          this.events.push({ t: 'strike', kind: 'lightning', x: px, z: pz, radius: 2.4 });
          this.areaDamage(null, 1, px, pz, 2.4, power10 * 2.6, { kb: 8, lift: 6, kind: 'shock', stun: 0.8 });
        });
      });
    }
    return true;
  }

  private avgLevel(team: 0 | 1): number {
    const list = this.units.filter((u) => u.team === team);
    return list.length ? list.reduce((s, u) => s + u.level, 0) / list.length : 1;
  }

  private after(t: number, fn: () => void): void {
    this.delayed.push({ t: this.time + t, fn });
  }

  // ── Main step ───────────────────────────────────────────
  step(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;

    if (this.over) {
      // The result is final: bodies keep falling and winners settle, but nothing can hurt anyone now.
      for (const u of this.units) {
        if (u.dead) {
          if (u.action === 'ash') {
            u.actionT += dt;
            if (u.actionT >= u.actionDur) this.rebirth(u);
          }
          u.deathT += dt;
        } else {
          u.mx *= decay(0.9, dt);
          u.mz *= decay(0.9, dt);
          if (u.action !== 'ready' && u.action !== 'leap') u.action = 'ready';
        }
        this.integrate(u, dt, u.dead);
      }
      return;
    }

    this.spirit = Math.min(100, this.spirit + this.spiritRate * dt);

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if (this.delayed[i].t <= this.time) {
        const d = this.delayed[i];
        this.delayed.splice(i, 1);
        d.fn();
      }
    }

    for (const u of this.units) this.updateUnit(u, dt);
    this.separate(dt);
    this.updateProjectiles(dt);
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.over) return;
    const a = this.units.some((u) => u.team === 0 && !u.minion && (!u.dead || u.action === 'ash'));
    const b = this.units.some((u) => u.team === 1 && !u.minion && (!u.dead || u.action === 'ash'));
    if (a && b && this.time < 240) return;
    this.over = true;
    // Any tie goes to the player: a double knockout or an even timeout both count as a win.
    this.winner = !b ? 0 : !a ? 1 : this.teamHealth(0) >= this.teamHealth(1) ? 0 : 1;
    this.delayed = [];
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.alive = false;
      this.events.push({ t: 'shotEnd', p, x: p.x, y: p.y, z: p.z });
    }
    for (const u of this.units) if (u.minion && !u.dead) this.expireMinion(u);
  }

  private updateUnit(u: Unit, dt: number): void {
    if (u.dead) {
      if (u.action === 'ash') {
        u.actionT += dt;
        if (u.actionT >= u.actionDur) this.rebirth(u);
      }
      u.deathT += dt;
      this.integrate(u, dt, true);
      return;
    }

    this.tickStatuses(u, dt);
    if (u.dead) return;
    u.stagger = Math.max(0, u.stagger - dt);
    u.bumpT = Math.max(0, u.bumpT - dt);
    u.spinT = Math.max(0, u.spinT - dt);
    u.cloakT = Math.max(0, u.cloakT - dt);
    u.phaseT = Math.max(0, u.phaseT - dt);
    u.goldT = Math.max(0, u.goldT - dt);
    u.shieldT = Math.max(0, u.shieldT - dt);
    if (u.shieldT <= 0) u.shieldHp = 0;
    if (u.minion && this.time > u.expire) {
      this.expireMinion(u);
      return;
    }

    u.atkT -= dt;
    u.abilT -= dt;
    u.retargetT -= dt;
    if (u.buff <= 0) u.buffMult = 1;

    const reeling = u.stagger > 0 && u.action !== 'leap' && u.action !== 'charge';
    const stunned = u.stun > 0 || u.frozen > 0 || reeling;
    if (stunned) {
      if (u.action !== 'leap') { u.action = 'ready'; u.actionT = 0; }
      u.mx *= decay(0.8, dt);
      u.mz *= decay(0.8, dt);
    }
    const airborne = !u.flying && u.y > 0.05 && u.action !== 'leap';

    if (!stunned && !airborne) {
      // An ability commits to the foe it chose, so only a beast that's free to act looks for a new one.
      if (u.action === 'ready' && (u.retargetT <= 0 || !u.target || u.target.dead || u.target.cloakT > 0)) this.pickTarget(u);
      switch (u.action) {
        case 'ready': this.think(u, dt); break;
        case 'attack': this.doAttack(u, dt); break;
        case 'ability': this.doAbilityWindup(u, dt); break;
        case 'charge': this.doCharge(u, dt); break;
        case 'leap': this.doLeap(u, dt); break;
        case 'breath': this.doBreath(u, dt); break;
        case 'roll': this.doRoll(u, dt); break;
      }
    } else if (u.action === 'leap') {
      this.doLeap(u, dt);
    }

    this.integrate(u, dt, false);
  }

  /** A summon whose time is up fades away. It wasn't defeated, so nobody scores it. */
  private expireMinion(u: Unit): void {
    u.hp = 0;
    u.dead = true;
    u.deathT = 1.1;
    u.mx = u.mz = 0;
    this.events.push({ t: 'expire', u });
  }

  private tickStatuses(u: Unit, dt: number): void {
    u.stun = Math.max(0, u.stun - dt);
    u.frozen = Math.max(0, u.frozen - dt);
    u.slow = Math.max(0, u.slow - dt);
    u.buff = Math.max(0, u.buff - dt);
    u.rage = Math.max(0, u.rage - dt);
    if (u.slow <= 0) u.slowMult = 1;
    u.tick += dt;
    if (u.tick >= 0.5) {
      const dot = (u.poison > 0 ? u.poisonDps : 0) + (u.burn > 0 ? u.burnDps : 0);
      if (dot > 0) {
        this.applyDamage(u.lastAttacker, u, dot * u.tick, false, 'dot', u.x, u.y + 1, u.z, false);
      }
      u.tick = 0;
    }
    u.poison = Math.max(0, u.poison - dt);
    u.burn = Math.max(0, u.burn - dt);
  }

  private pickTarget(u: Unit): void {
    u.retargetT = 0.4 + this.rng.next() * 0.3;
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const o of this.units) {
      if (o.team === u.team || o.dead || o.cloakT > 0) continue;
      let score = hypot(o.x - u.x, o.z - u.z) - o.radius;
      if (o === u.target) score -= 3; // Stick with a target unless a much better one appears.
      // Melee ground units can't chase flyers too eagerly when ground targets exist.
      if (o.flying && !u.flying && !u.ranged) score += 6;
      if (u.sp.role === 'Hunter') score += (o.hp / o.maxHp) * 4;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    u.target = best;
  }

  private think(u: Unit, dt: number): void {
    if (u.ctrl) { this.thinkControlled(u, dt); return; }
    const t = u.target;
    if (!t) { u.mx *= decay(0.9, dt); u.mz *= decay(0.9, dt); return; }

    const dx = t.x - u.x;
    const dz = t.z - u.z;
    const dist = hypot(dx, dz) || 0.01;
    const nx = dx / dist;
    const nz = dz / dist;
    const reach = u.range + u.radius * 0.6 + t.radius * 0.8;
    // Melee beasts spring at their target from a little way out, rather than standing nose to nose.
    const lungeReach = u.ranged ? reach : reach + 1.1 + u.radius * 0.9 + u.speed * 0.1;
    const face = angleTo(dx, dz);
    u.heading += angleDelta(u.heading, face) * Math.min(1, dt * this.turnRate(u));

    if (u.abilT <= 0 && this.tryAbility(u, t, dist)) return;

    const speed = this.currentSpeed(u) * (this.contact ? 1 : 1.35);
    if (dist > lungeReach) {
      const strafe = Math.sin(this.time * 0.9 + u.id) * 0.18;
      this.steer(u, nx - nz * strafe, nz + nx * strafe, speed, dt);
    } else if (u.ranged) {
      if (!u.flying && dist < reach * 0.4) this.steer(u, -nx, -nz, speed * 0.45, dt);
      else this.steer(u, -nz * u.orbit, nx * u.orbit, speed * 0.4, dt);
    } else {
      // The dance: circle the opponent, keeping just out of reach until the next strike.
      if (this.rng.next() < dt * 0.35) u.orbit = -u.orbit;
      const heavy = Math.min(1, Math.log10(Math.max(10, u.mass)) / 4);
      const want = reach + 0.7 + u.radius * 0.4;
      const radial = clamp((dist - want) * 1.2, -1, 1);
      this.steer(u, nx * radial - nz * u.orbit, nz * radial + nx * u.orbit, speed * (1 - heavy * 0.55), dt);
    }

    if (dist <= lungeReach && u.atkT <= 0 && Math.abs(angleDelta(u.heading, face)) < 1.1) {
      this.startAttack(u);
    }
  }

  private thinkControlled(u: Unit, dt: number): void {
    const c = u.ctrl!;
    const speed = this.currentSpeed(u) * 1.1;
    const len = hypot(c.mx, c.mz);
    if (len > 0.01) {
      const face = angleTo(c.mx, c.mz);
      u.heading += angleDelta(u.heading, face) * blend(0.25, dt);
      const k = blend(0.2, dt);
      u.mx += (c.mx / len * speed - u.mx) * k;
      u.mz += (c.mz / len * speed - u.mz) * k;
    } else {
      u.mx *= decay(0.8, dt);
      u.mz *= decay(0.8, dt);
    }
    if (c.ability && u.abilT <= 0 && u.target) {
      this.tryAbility(u, u.target, hypot(u.target.x - u.x, u.target.z - u.z), true);
    }
    if (u.action === 'ready' && c.attack && u.atkT <= 0) this.startAttack(u);
  }

  private currentSpeed(u: Unit): number {
    return u.speed * u.slowMult * (u.rage > 0 ? 1.2 : 1) * (u.phaseT > 0 ? 1.5 : 1);
  }

  private turnRate(u: Unit): number {
    return Math.max(3, 11 - Math.log10(u.mass) * 2.5);
  }

  private steer(u: Unit, nx: number, nz: number, speed: number, dt: number): void {
    const accel = Math.min(1, dt * Math.max(2.5, 11 - Math.log10(u.mass) * 2.6));
    u.mx += (nx * speed - u.mx) * accel;
    u.mz += (nz * speed - u.mz) * accel;
  }

  private startAttack(u: Unit): void {
    const atkSpeed = (u.rage > 0 ? 1.55 : 1) * (u.buff > 0 ? 1.12 : 1);
    u.action = 'attack';
    u.actionT = 0;
    u.actionDur = Math.min(0.85, 0.34 + u.cooldown * 0.26) / atkSpeed;
    u.struck = false;
    u.lunged = false;
    u.combo = (u.combo + 1) % 3;
    // A fast two-hit opener, then a pause after the big finisher. The average rate stays the same.
    const pacing = u.combo === 2 ? 1.8 : 0.6;
    u.atkT = (u.cooldown * pacing) / atkSpeed;
    this.events.push({ t: 'swing', u });
  }

  private doAttack(u: Unit, dt: number): void {
    u.actionT += dt;
    const t = u.target && !u.target.dead ? u.target : null;
    const strikeAt = u.actionDur * 0.42;

    if (u.ranged) {
      this.steer(u, 0, 0, 0, dt);
      if (!u.struck && u.actionT >= strikeAt) {
        u.struck = true;
        if (t) this.fireProjectile(u, t);
      }
    } else if (u.ctrl) {
      // A controlled beast goes where it's pointed, and hits whatever is in front of it.
      if (!u.struck && u.actionT >= strikeAt) {
        u.struck = true;
        const fx = Math.sin(u.heading);
        const fz = Math.cos(u.heading);
        u.vx += fx * 9;
        u.vz += fz * 9;
        this.events.push({ t: 'lunge', u, combo: u.combo });
        this.meleeArc(u);
      }
    } else if (u.actionT < strikeAt) {
      // Anticipation: weight back before springing forward.
      if (t) {
        const d = hypot(t.x - u.x, t.z - u.z) || 1;
        this.steer(u, -(t.x - u.x) / d, -(t.z - u.z) / d, u.speed * 0.3, dt);
        u.heading += angleDelta(u.heading, angleTo(t.x - u.x, t.z - u.z)) * Math.min(1, dt * 14);
      }
    } else if (!u.struck) {
      u.mx *= decay(0.7, dt);
      u.mz *= decay(0.7, dt);
      if (!t) {
        u.struck = true;
      } else {
        const dx = t.x - u.x;
        const dz = t.z - u.z;
        const d = hypot(dx, dz) || 0.01;
        const contact = u.radius * 0.7 + t.radius * 0.7 + u.range * 0.35;
        if (!u.lunged) {
          u.lunged = true;
          // Friction bleeds velocity at a known rate, so this speed carries it about the right distance.
          const v = clamp((d - contact) * 7.5 + 3, 4, 30);
          u.vx += (dx / d) * v;
          u.vz += (dz / d) * v;
          if (!u.flying && u.mass < 2000) u.vy = Math.max(u.vy, Math.min(3.6, v * 0.16));
          this.events.push({ t: 'lunge', u, combo: u.combo });
        }
        const late = u.actionT > strikeAt + 0.17;
        if (d <= contact + 0.25 || late) {
          u.struck = true;
          if (d <= u.range + u.radius + t.radius + 2.6) this.landMelee(u, t, dx / d, dz / d);
        }
      }
    }
    if (u.actionT >= u.actionDur) u.action = 'ready';
  }

  private landMelee(u: Unit, t: Unit, nx: number, nz: number): void {
    // Two beasts striking in the same instant collide head on.
    if (t.action === 'attack' && t.lunged && !t.struck && t.target === u && !t.ranged && this.rng.next() < 0.3) {
      t.struck = true;
      const force = 7 + Math.min(u.mass, t.mass) ** 0.2;
      u.vx = -nx * force * (t.mass / (u.mass + t.mass)) * 2;
      u.vz = -nz * force * (t.mass / (u.mass + t.mass)) * 2;
      t.vx = nx * force * (u.mass / (u.mass + t.mass)) * 2;
      t.vz = nz * force * (u.mass / (u.mass + t.mass)) * 2;
      this.events.push({ t: 'clash', a: u, b: t, x: (u.x + t.x) / 2, y: 0.8 * Math.max(u.scale, t.scale), z: (u.z + t.z) / 2 });
      this.strike(u, t, u.atk * 0.7, { kb: 2, lift: 0, kind: this.meleeKind(u), noCrit: true });
      this.strike(t, u, t.atk * 0.7, { kb: 2, lift: 0, kind: this.meleeKind(t), noCrit: true });
      return;
    }
    const finisher = u.combo === 2;
    const kind = this.meleeKind(u);
    this.strike(u, t, u.atk * (finisher ? 1.25 : 0.88), {
      kb: finisher ? 13 : 7, lift: finisher ? 5.5 : 1.2, kind, dirX: nx, dirZ: nz, finisher,
    });
    if (kind === 'venom') this.applyPoison(t, u.atk * 0.25, 3);
    // Bounce off the target, so the pair break apart and have to come back together.
    const heavier = t.mass / (u.mass + t.mass);
    const rebound = 2.5 + heavier * 7;
    u.vx = -nx * rebound;
    u.vz = -nz * rebound;
  }

  /** Controlled units can swing at whatever is in front of them. */
  private meleeArc(u: Unit): void {
    const fx = Math.sin(u.heading);
    const fz = Math.cos(u.heading);
    for (const o of this.units) {
      if (o.team === u.team || o.dead) continue;
      const dx = o.x - u.x;
      const dz = o.z - u.z;
      const d = hypot(dx, dz);
      if (d < u.range + u.radius + o.radius + 0.5 && (dx * fx + dz * fz) / (d || 1) > 0.2) {
        this.strike(u, o, u.atk, { kb: 6, lift: 0, kind: this.meleeKind(u) });
      }
    }
  }

  private meleeKind(u: Unit): HitKind {
    return u.sp.hit ?? 'bite';
  }

  private fireProjectile(u: Unit, t: Unit, opts: Partial<Projectile> = {}): void {
    const shotKind = u.sp.shot ?? 'bolt';
    const fx = Math.sin(u.heading);
    const fz = Math.cos(u.heading);
    const y = u.y + 1.1 * u.scale;
    const speed = 22;
    const p: Projectile = {
      id: this.nextId++, kind: shotKind, team: u.team, src: u, target: t,
      x: u.x + fx * u.radius, y, z: u.z + fz * u.radius, vx: fx * speed, vy: 0, vz: fz * speed, speed, life: 3,
      dmg: u.atk, splash: 0, alive: true, ...opts,
    };
    this.projectiles.push(p);
    this.events.push({ t: 'shot', p });
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      const tgt = p.target;
      if (tgt && !tgt.dead) {
        const dx = tgt.x - p.x;
        const dy = tgt.y + 0.7 * tgt.scale - p.y;
        const dz = tgt.z - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const k = Math.min(1, dt * 12);
        p.vx += (dx / d * p.speed - p.vx) * k;
        p.vy += (dy / d * p.speed - p.vy) * k;
        p.vz += (dz / d * p.speed - p.vz) * k;
      } else {
        p.vy -= 18 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      let impact = p.life <= 0 || p.y <= 0;
      let victim: Unit | null = null;
      for (const o of this.units) {
        if (o.team === p.team || o.dead) continue;
        const dx = o.x - p.x;
        const dy = o.y + 0.7 * o.scale - p.y;
        const dz = o.z - p.z;
        const r = o.radius + 0.5;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 1.5 * o.scale + 0.8) {
          victim = o;
          impact = true;
          break;
        }
      }
      if (impact) {
        p.alive = false;
        this.events.push({ t: 'shotEnd', p, x: p.x, y: p.y, z: p.z });
        const kind: HitKind = p.kind === 'venom' ? 'venom' : p.kind === 'bolt' ? 'shock' : p.kind === 'ice' ? 'ice' : 'fire';
        if (victim) {
          this.strike(p.src, victim, p.dmg, { kb: 3, lift: 0, kind });
          if (p.kind === 'venom') this.applyPoison(victim, p.src.atk * 0.3, 3);
          if (p.kind === 'flame') this.applyBurn(victim, p.src.atk * 0.2, 2);
          if (p.kind === 'ice') this.applySlow(victim, 0.6, 2);
        }
        if (p.splash > 0) {
          this.areaDamage(p.src, p.src.team === 0 ? 1 : 0, p.x, p.z, p.splash, p.dmg * 0.5, { kb: 4, lift: 2, kind });
        }
      }
    }
    if (this.projectiles.length > 64) this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // ── Abilities ───────────────────────────────────────────
  private tryAbility(u: Unit, t: Unit, dist: number, forced = false): boolean {
    const id = u.sp.ability;
    const near = (r: number) => this.units.filter((o) => o.team !== u.team && !o.dead && hypot(o.x - u.x, o.z - u.z) < r + o.radius).length;

    const usable = forced || (() => {
      switch (id) {
        case 'charge': case 'lance': return dist > 5 && dist < 26 && (u.flying || !t.flying);
        case 'cloak': return near(10) >= 1 && u.cloakT <= 0;
        case 'midas': return this.inReach(u, t);
        case 'brood': return dist < 22 && this.units.filter((o) => o.team === u.team && o.minion && !o.dead).length < 12;
        case 'chainDash': return dist < 18;
        case 'shield': return near(14) >= 1;
        case 'phase': return near(9) >= 1;
        case 'meteorStomp': return dist < 34;
        case 'cosmicSong': return dist < 34;
        case 'howl': return this.units.some((o) => o.team === u.team && !o.dead && o !== u && hypot(o.x - u.x, o.z - u.z) < 10) && dist < 14;
        case 'spit': return dist < u.range + 3;
        case 'rage': return dist < 6 && u.hp < u.maxHp * 0.85;
        case 'roar': return near(9) >= 1;
        case 'deathRoll': case 'sting': return dist < u.range + u.radius + t.radius + 0.8;
        case 'dive': return dist < 22;
        case 'slam': case 'quake': case 'frostQuake': return near(5 * u.scale) >= 1;
        case 'pounce': return dist > 4 && dist < 22;
        case 'heal': return this.units.some((o) => o.team === u.team && !o.dead && o.hp < o.maxHp * 0.8 && hypot(o.x - u.x, o.z - u.z) < 12);
        case 'chain': case 'fireRain': return dist < u.range + 6;
        case 'fireBreath': case 'frostBreath': return dist < 12;
        case 'tailWhip': return near(4.5 * u.scale + u.radius) >= 1;
        case 'swarm': return dist < 18 && !u.minion && this.units.filter((o) => o.team === u.team && o.minion && !o.dead).length < 10;
      }
    })();
    if (!usable) return false;

    u.abilT = u.abilityCd;
    u.action = 'ability';
    u.actionT = 0;
    u.struck = false;
    u.hitSet.clear();
    u.actionDur = WINDUPS[id] ?? 0.5;
    if (id === 'pounce' || id === 'dive') {
      const prey = this.weakestNear(u, 22) ?? t;
      u.target = prey;
    }
    this.events.push({ t: 'ability', u, id, x: u.target?.x ?? u.x, z: u.target?.z ?? u.z });
    return true;
  }

  private inReach(u: Unit, t: Unit): boolean {
    return hypot(t.x - u.x, t.z - u.z) <= u.range + u.radius + t.radius + 1.5;
  }

  private weakestNear(u: Unit, r: number): Unit | null {
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const o of this.units) {
      if (o.team === u.team || o.dead || o.cloakT > 0) continue;
      const d = hypot(o.x - u.x, o.z - u.z);
      if (d > r) continue;
      const score = o.hp + d * 2;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  private doAbilityWindup(u: Unit, dt: number): void {
    u.actionT += dt;
    this.steer(u, 0, 0, 0, dt);
    const t = u.target;
    if (t && !t.dead) {
      const face = angleTo(t.x - u.x, t.z - u.z);
      u.heading += angleDelta(u.heading, face) * Math.min(1, dt * 8);
    }
    if (u.actionT < u.actionDur) return;
    u.action = 'ready';
    this.fireAbility(u);
  }

  private fireAbility(u: Unit): void {
    const id = u.sp.ability;
    const t = u.target && !u.target.dead ? u.target : null;
    const enemy: 0 | 1 = u.team === 0 ? 1 : 0;
    this.events.push({ t: 'abilityFire', u, id, x: t?.x ?? u.x, z: t?.z ?? u.z });
    switch (id) {
      case 'charge': {
        u.action = 'charge';
        u.actionT = 0;
        u.actionDur = 1.4;
        u.hitSet.clear();
        if (t) u.heading = angleTo(t.x - u.x, t.z - u.z);
        break;
      }
      case 'howl': {
        for (const o of this.units) {
          if (o.team === u.team && !o.dead && hypot(o.x - u.x, o.z - u.z) < 11) {
            o.buff = 6;
            o.buffMult = Math.max(o.buffMult, 1.3);
            this.events.push({ t: 'status', u: o, s: 'buff' });
          }
        }
        break;
      }
      case 'spit': {
        if (t) {
          const base = angleTo(t.x - u.x, t.z - u.z);
          for (const off of [-0.32, -0.16, 0, 0.16, 0.32]) {
            const a = base + off;
            // Only the middle glob homes in. The rest fly straight, so the spray can catch other foes.
            this.fireProjectile(u, t, {
              target: off === 0 ? t : null,
              kind: 'venom', vx: Math.sin(a) * 16, vz: Math.cos(a) * 16, vy: 3, dmg: u.atk * 0.8, speed: 16,
            });
          }
        }
        break;
      }
      case 'rage': {
        u.rage = 6;
        this.events.push({ t: 'status', u, s: 'rage' });
        break;
      }
      case 'roar': {
        const r = 9 * u.scale;
        this.areaEffect(u, enemy, r, (o, d) => {
          o.stun = Math.max(o.stun, 1.3 * (1 - d / r / 2));
          this.events.push({ t: 'status', u: o, s: 'stun' });
        });
        for (const o of this.units) {
          if (o.team === u.team && !o.dead && hypot(o.x - u.x, o.z - u.z) < r) {
            o.buff = 5;
            o.buffMult = Math.max(o.buffMult, 1.25);
          }
        }
        break;
      }
      case 'deathRoll': {
        // A beast steered by the player can press this at any distance, so reach is checked here.
        if (t && this.inReach(u, t)) {
          u.action = 'roll';
          u.actionT = 0;
          u.actionDur = 0.9;
          u.struck = false;
          t.stun = Math.max(t.stun, 1.1);
        }
        break;
      }
      case 'dive':
      case 'pounce': {
        if (t) {
          u.action = 'leap';
          u.actionT = 0;
          u.leapFrom = [u.x, u.z];
          u.leapTo = [t.x, t.z];
          const d = hypot(t.x - u.x, t.z - u.z);
          u.actionDur = Math.min(0.85, 0.3 + d * 0.035);
          u.leapH = id === 'dive' ? 4 : 1.5 + d * 0.16;
          u.heading = angleTo(t.x - u.x, t.z - u.z);
        }
        break;
      }
      case 'sting': {
        if (t && this.inReach(u, t)) {
          this.strike(u, t, u.atk * 1.8, { kb: 6, lift: 0, kind: 'venom', crit: true });
          this.applyPoison(t, u.atk * 0.55, 5);
        }
        break;
      }
      case 'cloak':
        u.cloakT = 4;
        break;
      case 'phase':
        u.phaseT = 3.2;
        break;
      case 'midas': {
        if (t && this.inReach(u, t)) {
          t.frozen = Math.max(t.frozen, 2.4);
          t.goldT = 2.4;
          this.strike(u, t, u.atk * 1.2, { kb: 2, lift: 0, kind: 'horn', noCrit: true });
          this.events.push({ t: 'status', u: t, s: 'gold' });
        }
        break;
      }
      case 'brood': {
        for (let i = 0; i < 3 + Math.floor(u.level / 10); i++) this.summon(u, 'ant');
        break;
      }
      case 'chainDash': {
        if (t) {
          u.hops = 3;
          this.startDash(u, t);
        }
        break;
      }
      case 'shield': {
        for (const o of this.units) {
          if (o.team === u.team && !o.dead && hypot(o.x - u.x, o.z - u.z) < 15) {
            o.shieldHp = o.maxHp * 0.3;
            o.shieldT = 7;
            this.events.push({ t: 'status', u: o, s: 'shield' });
          }
        }
        break;
      }
      case 'lance': {
        u.action = 'charge';
        u.actionT = 0;
        u.actionDur = 1.3;
        u.hitSet.clear();
        if (t) u.heading = angleTo(t.x - u.x, t.z - u.z);
        break;
      }
      case 'meteorStomp': {
        const foes = this.units.filter((o) => o.team !== u.team && !o.dead).sort((a, b) => b.hp - a.hp).slice(0, 3);
        foes.forEach((f, i) => {
          const delay = 0.8 + i * 0.32;
          const x = f.x;
          const z = f.z;
          this.events.push({ t: 'incoming', kind: 'meteor', x, z, radius: 5, delay });
          this.after(delay, () => {
            this.events.push({ t: 'strike', kind: 'meteor', x, z, radius: 5 });
            this.areaDamage(u, enemy, x, z, 5, u.atk * 2, { kb: 18, lift: 11, kind: 'fire', falloff: true, burn: u.atk * 0.12 });
          });
        });
        break;
      }
      case 'cosmicSong': {
        for (const o of this.units) {
          if (o.dead) continue;
          if (o.team === u.team) this.healUnit(o, o.maxHp * 0.2);
          else {
            this.applySlow(o, 0.5, 4);
            o.stun = Math.max(o.stun, 0.6);
          }
        }
        break;
      }
      case 'tailWhip': {
        u.spinT = 0.55;
        this.groundBlast(u, (4.5 * u.scale) + u.radius, u.atk * 1.7, 20, 11, 'horn');
        break;
      }
      case 'swarm': {
        const n = 2 + Math.floor(u.level / 8);
        for (let i = 0; i < n; i++) this.summon(u);
        break;
      }
      case 'slam':
        this.groundBlast(u, 5.5 * u.scale, u.atk * 1.7, 14, 10, 'earth');
        break;
      case 'quake':
        this.groundBlast(u, 8 * u.scale, u.atk * 1.9, 18, 13, 'earth');
        break;
      case 'frostQuake': {
        this.groundBlast(u, 8.5 * u.scale, u.atk * 1.8, 16, 12, 'ice');
        this.areaEffect(u, enemy, 8.5 * u.scale, (o) => this.applySlow(o, 0.45, 4));
        break;
      }
      case 'heal': {
        for (const o of this.units) {
          if (o.team === u.team && !o.dead && hypot(o.x - u.x, o.z - u.z) < 13) {
            this.healUnit(o, o.maxHp * 0.12 + u.atk * 2.4);
          }
        }
        break;
      }
      case 'chain': {
        if (t) this.chainLightning(u, t);
        break;
      }
      case 'fireRain': {
        const cx = t?.x ?? u.x;
        const cz = t?.z ?? u.z;
        for (let i = 0; i < 9; i++) {
          const a = this.rng.range(0, Math.PI * 2);
          const r = this.rng.range(0, 8);
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          const delay = 0.25 + i * 0.13;
          this.events.push({ t: 'incoming', kind: 'firerain', x, z, radius: 2.6, delay });
          this.after(delay, () => {
            if (u.dead && u.action !== 'ash') return;
            this.events.push({ t: 'strike', kind: 'firerain', x, z, radius: 2.6 });
            this.areaDamage(u, enemy, x, z, 2.6, u.atk * 0.9, { kb: 7, lift: 5, kind: 'fire', burn: u.atk * 0.15 });
          });
        }
        break;
      }
      case 'fireBreath':
      case 'frostBreath': {
        u.action = 'breath';
        u.actionT = 0;
        u.actionDur = 2.2;
        u.tick = 0;
        break;
      }
    }
  }

  /** Starts one hop of a lightning dash at `t`. */
  private startDash(u: Unit, t: Unit): void {
    u.target = t;
    u.action = 'leap';
    u.actionT = 0;
    u.leapFrom = [u.x, u.z];
    u.leapTo = [t.x, t.z];
    const d = hypot(t.x - u.x, t.z - u.z);
    u.actionDur = 0.1 + d * 0.012;
    u.leapH = 0.5;
    u.heading = angleTo(t.x - u.x, t.z - u.z);
  }

  private summon(u: Unit, speciesId = u.sp.id): void {
    const a = this.rng.range(0, Math.PI * 2);
    const m = this.spawn({ speciesId, level: u.level, x: u.x + Math.cos(a) * 2, z: u.z + Math.sin(a) * 2 }, u.team);
    m.minion = true;
    m.expire = this.time + MINION_LIFE;
    m.hp = m.maxHp = m.maxHp * 0.3;
    m.atk *= 0.45;
    m.scale *= 0.72;
    m.radius *= 0.72;
    m.abilT = 999;
    this.events.push({ t: 'spawned', u: m, by: u });
  }

  private doCharge(u: Unit, dt: number): void {
    u.actionT += dt;
    const fx = Math.sin(u.heading);
    const fz = Math.cos(u.heading);
    const speed = u.speed * 3;
    u.mx = fx * speed;
    u.mz = fz * speed;
    for (const o of this.units) {
      if (o.team === u.team || o.dead || u.hitSet.has(o.id) || (o.flying && !u.flying)) continue;
      const d = hypot(o.x - u.x, o.z - u.z);
      if (d < u.radius + o.radius + 0.6) {
        u.hitSet.add(o.id);
        const lance = u.sp.ability === 'lance';
        this.strike(u, o, u.atk * 1.5, { kb: lance ? 12 : 20, lift: lance ? 4 : 11, kind: lance ? 'ice' : 'horn', dirX: fx, dirZ: fz });
        o.stun = Math.max(o.stun, 0.6);
        if (lance && !o.dead) {
          o.frozen = Math.max(o.frozen, 1.6);
          this.events.push({ t: 'status', u: o, s: 'freeze' });
        }
      }
    }
    // Stops at the wall only when heading into it. A beast knocked to the edge can still charge back in.
    if (u.actionT >= u.actionDur || (hypot(u.x, u.z) > ARENA_RADIUS - 1 && u.x * fx + u.z * fz > 0)) {
      u.action = 'ready';
      u.atkT = Math.max(u.atkT, 0.3);
    }
  }

  private doLeap(u: Unit, dt: number): void {
    u.actionT += dt;
    const k = Math.min(1, u.actionT / u.actionDur);
    const [fx, fz] = u.leapFrom;
    const t = u.target;
    if (t && !t.dead) u.leapTo = [t.x, t.z];
    const [tx, tz] = u.leapTo;
    u.x = fx + (tx - fx) * k;
    u.z = fz + (tz - fz) * k;
    if (u.flying) {
      const dip = k < 0.8 ? 1 + (HOVER_HEIGHT + 2 - 1) * (1 - k / 0.8) : 1;
      u.y = dip;
    } else {
      u.y = Math.sin(k * Math.PI) * u.leapH;
    }
    if (k >= 1) {
      u.action = 'ready';
      u.y = u.flying ? 1 : 0;
      if (u.sp.ability === 'chainDash') {
        u.y = 0;
        if (t && !t.dead) {
          u.hitSet.add(t.id);
          this.strike(u, t, u.atk * 1.35, { kb: 8, lift: 3, kind: 'shock', noCrit: true });
          t.stun = Math.max(t.stun, 0.5);
        }
        const from: [number, number, number] = [fx, 0.8, fz];
        // On to the next nearest foe it hasn't hit, if any are close.
        let next: Unit | null = null;
        let best = 13;
        for (const o of this.units) {
          if (o.team === u.team || o.dead || o.cloakT > 0 || u.hitSet.has(o.id)) continue;
          const d = hypot(o.x - u.x, o.z - u.z);
          if (d < best) { best = d; next = o; }
        }
        this.events.push({ t: 'chain', pts: [from, [u.x, 0.8, u.z]] });
        u.hops--;
        if (next && u.hops >= 0) this.startDash(u, next);
        return;
      }
      this.events.push({ t: 'land', u, force: 1 });
      if (u.sp.ability === 'dive') {
        const prey = t && !t.dead ? t : null;
        if (prey) this.strike(u, prey, u.atk * 2.4, { kb: 10, lift: 5, kind: 'claw', crit: true });
      } else {
        const enemy: 0 | 1 = u.team === 0 ? 1 : 0;
        this.areaDamage(u, enemy, u.x, u.z, 3 * u.scale, u.atk * 2.1, { kb: 11, lift: 6, kind: 'claw' });
      }
    }
  }

  private doRoll(u: Unit, dt: number): void {
    u.actionT += dt;
    const t = u.target;
    this.steer(u, 0, 0, 0, dt);
    if (t && !t.dead && u.actionT > u.actionDur * 0.7 && !u.struck && this.inReach(u, t)) {
      u.struck = true;
      this.strike(u, t, u.atk * 3, { kb: 12, lift: 4, kind: 'bite', crit: true });
    }
    if (u.actionT >= u.actionDur) u.action = 'ready';
  }

  private doBreath(u: Unit, dt: number): void {
    u.actionT += dt;
    this.steer(u, 0, 0, 0, dt);
    const t = u.target;
    if (t && !t.dead) {
      const face = angleTo(t.x - u.x, t.z - u.z);
      u.heading += angleDelta(u.heading, face) * Math.min(1, dt * 2.5);
    }
    const fx = Math.sin(u.heading);
    const fz = Math.cos(u.heading);
    const id = u.sp.ability;
    const range = 13 * Math.min(1.4, u.scale);
    // Use actionT buckets for damage ticks so DoT status ticks never interfere.
    const bucket = Math.floor(u.actionT / 0.15);
    const prev = Math.floor((u.actionT - dt) / 0.15);
    if (bucket !== prev) {
      this.events.push({ t: 'breathTick', u, id, x: u.x + fx * u.radius, y: u.y + 1.2 * u.scale, z: u.z + fz * u.radius, dx: fx, dz: fz, range });
      for (const o of this.units) {
        if (o.team === u.team || o.dead) continue;
        const dx = o.x - u.x;
        const dz = o.z - u.z;
        const d = hypot(dx, dz) || 1;
        if (d > range + o.radius) continue;
        const dot = (dx * fx + dz * fz) / d;
        if (dot < 0.72) continue;
        if (id === 'fireBreath') {
          this.strike(u, o, u.atk * 0.4, { kb: 2.2, lift: 0, kind: 'fire', noCrit: true, quiet: true });
          this.applyBurn(o, u.atk * 0.15, 2);
        } else {
          this.strike(u, o, u.atk * 0.34, { kb: 1.6, lift: 0, kind: 'ice', noCrit: true, quiet: true });
          this.applySlow(o, 0.5, 2.5);
          if (this.rng.next() < 0.05) {
            o.frozen = Math.max(o.frozen, 1.4);
            this.events.push({ t: 'status', u: o, s: 'freeze' });
          }
        }
      }
    }
    if (u.actionT >= u.actionDur) u.action = 'ready';
  }

  private chainLightning(u: Unit, first: Unit): void {
    const pts: [number, number, number][] = [[u.x, u.y + 1, u.z]];
    const seen = new Set<number>();
    let cur: Unit | null = first;
    let dmg = u.atk * 1.6;
    for (let i = 0; i < 5 && cur; i++) {
      seen.add(cur.id);
      pts.push([cur.x, cur.y + 0.8 * cur.scale, cur.z]);
      this.strike(u, cur, dmg, { kb: 3, lift: 2, kind: 'shock', noCrit: true });
      cur.stun = Math.max(cur.stun, 0.5);
      dmg *= 0.78;
      let next: Unit | null = null;
      let nd = 11;
      for (const o of this.units) {
        if (o.team === u.team || o.dead || seen.has(o.id)) continue;
        const d = hypot(o.x - cur.x, o.z - cur.z);
        if (d < nd) { nd = d; next = o; }
      }
      cur = next;
    }
    this.events.push({ t: 'chain', pts });
  }

  private groundBlast(u: Unit, r: number, dmg: number, kb: number, lift: number, kind: HitKind): void {
    const enemy: 0 | 1 = u.team === 0 ? 1 : 0;
    this.areaDamage(u, enemy, u.x, u.z, r, dmg, { kb, lift, kind, falloff: true });
  }

  private areaEffect(u: Unit, team: 0 | 1, r: number, fn: (o: Unit, d: number) => void): void {
    for (const o of this.units) {
      if (o.team !== team || o.dead) continue;
      const d = hypot(o.x - u.x, o.z - u.z);
      if (d < r + o.radius) fn(o, d);
    }
  }

  private areaDamage(
    src: Unit | null, team: 0 | 1, x: number, z: number, r: number, dmg: number,
    o: { kb: number; lift: number; kind: HitKind; falloff?: boolean; burn?: number; stun?: number },
  ): void {
    for (const t of this.units) {
      if (t.team !== team || t.dead) continue;
      const dx = t.x - x;
      const dz = t.z - z;
      const d = hypot(dx, dz);
      if (d > r + t.radius) continue;
      const fall = o.falloff ? Math.max(0.35, 1 - d / (r + t.radius)) : 1;
      const nx = d > 0.01 ? dx / d : Math.cos(t.id);
      const nz = d > 0.01 ? dz / d : Math.sin(t.id);
      this.strike(src, t, dmg * fall, { kb: o.kb * fall, lift: t.flying ? 0 : o.lift * fall, kind: o.kind, dirX: nx, dirZ: nz, noCrit: true });
      if (o.burn) this.applyBurn(t, o.burn, 3);
      if (o.stun) t.stun = Math.max(t.stun, o.stun);
    }
  }

  // ── Damage plumbing ─────────────────────────────────────
  private strike(
    src: Unit | null, t: Unit, raw: number,
    o: { kb: number; lift: number; kind: HitKind; dirX?: number; dirZ?: number; crit?: boolean; noCrit?: boolean; quiet?: boolean; finisher?: boolean },
  ): void {
    if (t.dead) return;
    // Springing out of the cloak is a guaranteed heavy blow.
    const ambush = !!src && src.cloakT > 0;
    if (ambush) src.cloakT = 0;
    const buffed = raw * (src && src.buff > 0 ? src.buffMult : 1) * this.rng.range(0.9, 1.1) * (ambush ? 3 : 1);
    const crit = !!o.crit || ambush || (!o.noCrit && !!src && this.rng.next() < src.critChance);
    const dealt = buffed * (crit ? 1.9 : 1);
    const dmg = dealt * (100 / (100 + t.armor));

    const dx = o.dirX ?? (src ? t.x - src.x : 0);
    const dz = o.dirZ ?? (src ? t.z - src.z : 1);
    const len = hypot(dx, dz) || 1;
    const srcMass = src ? src.mass : 1200;
    const ratio = srcMass / (srcMass + t.mass);
    const force = o.kb * ratio * 2 * (crit ? 1.4 : 1);
    t.vx += (dx / len) * force;
    t.vz += (dz / len) * force;
    if (o.lift > 0 && !t.flying) t.vy = Math.max(t.vy, o.lift * ratio * 2 * (crit ? 1.3 : 1));
    // Hard hits knock a beast off its stride. Light ones just push it around.
    const stagger = Math.min(0.5, force * 0.035);
    if (stagger > 0.1 && !o.quiet) t.stagger = Math.max(t.stagger, stagger);

    const big = crit || !!o.finisher || force > 8 || dmg > t.maxHp * 0.25;
    this.applyDamage(src, t, dmg, crit, o.kind, t.x, t.y + 0.9 * t.scale, t.z, big, !!o.finisher);
  }

  private applyDamage(
    src: Unit | null, t: Unit, dmg: number, crit: boolean, kind: HitKind,
    x: number, y: number, z: number, big: boolean, finisher = false,
  ): void {
    if (t.dead || this.over) return;
    if (src && src.team !== t.team && kind !== 'dot') this.contact = true;
    if (t.phaseT > 0) return;
    if (t.shieldHp > 0) {
      const soaked = Math.min(t.shieldHp, dmg);
      t.shieldHp -= soaked;
      dmg -= soaked;
      if (kind !== 'dot') this.events.push({ t: 'absorb', u: t });
      if (dmg <= 0) return;
    }
    t.hp -= dmg;
    if (src) {
      t.lastAttacker = src;
      src.damage += dmg;
      if (src.rage > 0 && !src.dead && kind !== 'dot') this.healUnit(src, dmg * 0.35, true);
    }
    this.events.push({ t: 'hit', src, tgt: t, dmg, crit, x, y, z, kind, big, finisher });
    if (t.hp <= 0) this.kill(t, src);
  }

  private kill(t: Unit, src: Unit | null): void {
    t.hp = 0;
    t.dead = true;
    t.deathT = 0;
    t.deathSpin = (src ? Math.sign(src.x - t.x + 0.01) : 1) * 1;
    t.stun = t.poison = t.burn = t.slow = t.frozen = t.buff = t.rage = 0;
    if (src && src.team !== t.team) {
      src.kills += 1;
      if (src.team === 0) this.spirit = Math.min(100, this.spirit + 5);
    }
    if (t.rebirthReady) {
      t.rebirthReady = false;
      t.action = 'ash';
      t.actionT = 0;
      t.actionDur = 3;
      this.events.push({ t: 'ashes', u: t });
      return;
    }
    t.action = 'ready';
    // The final blow always sends a beast flying, scaled by how outweighed it was.
    if (src) {
      const dx = t.x - src.x;
      const dz = t.z - src.z;
      const d = hypot(dx, dz) || 1;
      const ratio = src.mass / (src.mass + t.mass);
      const launch = 3 + ratio * 13;
      t.vx += (dx / d) * launch;
      t.vz += (dz / d) * launch;
      t.vy = Math.max(t.vy, 3 + ratio * 9);
    }
    t.mx = 0;
    t.mz = 0;
    const last = !t.minion && !this.units.some((u) => u.team === t.team && !u.minion && (!u.dead || u.action === 'ash'));
    this.events.push({ t: 'death', u: t, by: src, last });
  }

  private rebirth(u: Unit): void {
    u.dead = false;
    u.hp = u.maxHp * 0.55;
    u.action = 'ready';
    u.actionT = 0;
    u.y = HOVER_HEIGHT;
    u.vx = u.vy = u.vz = 0;
    u.deathT = 0;
    this.events.push({ t: 'rebirth', u });
    const enemy: 0 | 1 = u.team === 0 ? 1 : 0;
    this.areaDamage(u, enemy, u.x, u.z, 7, u.atk * 1.5, { kb: 14, lift: 8, kind: 'fire', falloff: true });
  }

  private healUnit(u: Unit, amount: number, quiet = false): void {
    if (u.dead) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    if (!quiet && u.hp > before) this.events.push({ t: 'heal', u, amount: u.hp - before });
  }

  private applyPoison(t: Unit, dps: number, dur: number): void {
    if (t.dead) return;
    // The strongest active dose wins. Once a dose has worn off, its strength is gone too.
    t.poisonDps = t.poison > 0 ? Math.max(t.poisonDps, dps) : dps;
    t.poison = Math.max(t.poison, dur);
    this.events.push({ t: 'status', u: t, s: 'poison' });
  }

  private applyBurn(t: Unit, dps: number, dur: number): void {
    if (t.dead) return;
    t.burnDps = t.burn > 0 ? Math.max(t.burnDps, dps) : dps;
    t.burn = Math.max(t.burn, dur);
    this.events.push({ t: 'status', u: t, s: 'burn' });
  }

  private applySlow(t: Unit, mult: number, dur: number): void {
    if (t.dead) return;
    t.slow = Math.max(t.slow, dur);
    t.slowMult = Math.min(t.slowMult, mult);
    this.events.push({ t: 'status', u: t, s: 'slow' });
  }

  // ── Physics ─────────────────────────────────────────────
  private integrate(u: Unit, dt: number, dead: boolean): void {
    const onGround = u.y <= 0.001;
    const friction = onGround || u.flying ? 7 : 0.6;
    const f = Math.exp(-friction * dt);
    u.vx *= f;
    u.vz *= f;

    if (u.action !== 'leap') {
      const moveK = dead ? 0 : 1;
      u.x += (u.mx * moveK + u.vx) * dt;
      u.z += (u.mz * moveK + u.vz) * dt;

      if (u.flying && !dead) {
        // Melee flyers swoop down to strike, then climb away.
        const swoop = u.action === 'charge' || (!u.ranged && u.action === 'attack' && u.actionT > u.actionDur * 0.15);
        const wanted = swoop ? 1 + u.radius * 0.3 : HOVER_HEIGHT * Math.min(1.4, u.scale);
        u.y += (wanted - u.y) * Math.min(1, dt * (swoop ? 9 : 2.6));
        u.vy = 0;
      } else if (u.y > 0 || u.vy > 0) {
        u.vy -= GRAVITY * dt;
        u.y += u.vy * dt;
        if (u.y <= 0) {
          const impact = -u.vy;
          u.y = 0;
          u.vy = impact > 5 ? impact * (dead ? 0.42 : 0.3) : 0;
          if (impact > 6) this.events.push({ t: 'land', u, force: impact / 12 });
        }
      }
    }

    const r = hypot(u.x, u.z);
    if (r > ARENA_RADIUS) {
      u.x *= ARENA_RADIUS / r;
      u.z *= ARENA_RADIUS / r;
    }
  }

  private separate(dt: number): void {
    const list = this.units;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.action === 'leap' || a.phaseT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.action === 'leap' || b.phaseT > 0 || a.flying !== b.flying) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = (a.radius + b.radius) * 0.92;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const overlap = min - d;
        const nx = d2 > 0 ? dx / d : Math.cos(i);
        const nz = d2 > 0 ? dz / d : Math.sin(i);
        const total = a.mass + b.mass;
        // A beast thrown into another bowls it over.
        const fast = hypot(a.vx, a.vz) > 7 ? a : hypot(b.vx, b.vz) > 7 ? b : null;
        if (fast && fast.bumpT <= 0) {
          const other = fast === a ? b : a;
          const speed = hypot(fast.vx, fast.vz);
          fast.bumpT = other.bumpT = 0.3;
          const share = fast.mass / total;
          other.vx += fast.vx * share * 1.1;
          other.vz += fast.vz * share * 1.1;
          if (!other.flying) other.vy = Math.max(other.vy, speed * share * 0.5);
          fast.vx *= 0.55;
          fast.vz *= 0.55;
          if (fast.team !== other.team) other.stagger = Math.max(other.stagger, 0.2);
          this.events.push({ t: 'bump', a: fast, b: other, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, force: speed });
        }
        const push = Math.min(overlap, dt * 14);
        // The heavier beast shoulders the lighter one aside.
        a.x -= nx * push * (b.mass / total);
        a.z -= nz * push * (b.mass / total);
        b.x += nx * push * (a.mass / total);
        b.z += nz * push * (a.mass / total);
      }
    }
  }
}
