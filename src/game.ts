// The game shell: state machine tying profile, 3D stage and screens together.
import * as THREE from 'three';
import { audio } from './audio';
import { connectCloud, enableCloudWrites, flushCloud } from './cloudSave';
import { BeastRig, IDLE_POSE } from './gfx/beast';
import { Stage } from './gfx/stage';
import { BattleView, TEAM_COLOR } from './gfx/view';
import { Battle, POWERS, type Deployment, type PowerId, type Unit } from './sim/battle';
import {
  addBeast, applyBattleResult, chooseSave, commandCap, hasRare, RARE_TASKS, taskRevealed, deriveStats, EVOLUTIONS, evoStage, grantXp, highestCleared, loadProfile, MAX_LEVEL,
  previewRewards, recruitPrice, recruitUnlockStage, resetProfile, saveProfile, trainCost, UPGRADE_DEFS, upgradeCost, xpToNext,
  type Beast, type BattleRewards, type Profile, type UpgradeId,
} from './sim/progression';
import { getSpecies, GROUPS, SPECIES, type Group } from './sim/species';
import { BIOMES, gridFormation, STAGES, stageFormation, type BiomeId, type Stage as CampaignStage } from './sim/stages';
import { fmt, goldTag, h, qs, starsHtml, TIER_COLOR } from './ui/dom';
import { portrait, portraitImg, watchPortraits } from './ui/portraits';

type Mode = 'title' | 'hub' | 'deploy' | 'battle' | 'results';
type HubTab = 'campaign' | 'herd' | 'market' | 'rare' | 'upgrades';

interface Placed {
  team: 0 | 1; speciesId: string; level: number; x: number; z: number; uid?: string; boss?: boolean;
  rig: BeastRig; ring: THREE.Mesh; flying: boolean;
}

const BIOME_ORDER: BiomeId[] = ['savanna', 'jungle', 'tundra', 'primeval', 'caldera', 'starfall'];
type GroupFilter = Group | 'All';
const GROUP_FILTERS: GroupFilter[] = ['All', ...GROUPS];
const DEPLOY_RADIUS = 32;
const SPEEDS = [0.5, 1, 2, 3];

export class Game {
  readonly stage: Stage;
  profile: Profile;
  mode: Mode = 'title';
  private ui = document.getElementById('ui')!;
  private fadeEl = document.getElementById('fade')!;
  private textLayer = document.getElementById('float-layer')!;
  private canvas: HTMLCanvasElement;
  view: BattleView | null = null;
  private last = performance.now();
  private keys = new Set<string>();

  // Hub state
  private hubTab: HubTab = 'campaign';
  private selectedStage = 0;
  private selectedBeast: string | null = null;
  private selectedSpecies: string | null = null;
  private hubBiome: BiomeId = 'savanna';
  private hubRig: BeastRig | null = null;
  private hubRigKey = '';
  private hubAngle = 0.7;

  // Deploy state
  private placed: Placed[] = [];
  private currentStage: CampaignStage | null = null;
  private sandbox = false;
  private sandboxTeam: 0 | 1 = 0;
  private sandboxLevel = 5;
  private zone: THREE.Mesh | null = null;
  private dragging:
    | { kind: 'new'; uid?: string; speciesId: string; level: number }
    | { kind: 'move'; p: Placed }
    | { kind: 'recall'; p: Placed }
    | null = null;
  private ghostEl: HTMLElement | null = null;
  private ghost: Placed | null = null;
  private dragMoved = false;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ptrDrag: { x: number; y: number; moved: boolean; button: number } | null = null;

  // Battle state
  private selectedUnit: Unit | null = null;
  private possessed: Unit | null = null;
  private aiming: PowerId | null = null;
  private reticle: THREE.Mesh | null = null;
  private reticleTime = 0;
  private speedIdx = 1;
  private hudRefs: Record<string, HTMLElement> = {};
  private powerButtons: HTMLButtonElement[] = [];
  private finished = false;
  private actionPt = new THREE.Vector3();
  private mouse = { x: 0, y: 0 };
  private bossUnit: Unit | null = null;
  private lastCard = '';
  private resultTimers: number[] = [];
  private viewShift = 0;
  private marketFilter: GroupFilter = 'All';
  private selectedRare: string | null = null;
  private sandboxFilter: GroupFilter = 'Dinosaurs';
  private cloudPending = false;
  private readonly coarse = matchMedia('(pointer: coarse)').matches;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; x: number; y: number } | null = null;
  private dragStart = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  /** Bumped on every screen change, so animations from an old screen know to stop. */
  private screenGen = 0;
  private mouse0Pointer = -1;
  private crashShown = false;

  constructor() {
    this.profile = loadProfile();
    audio.muted = this.profile.settings.muted;
    audio.musicOff = !!this.profile.settings.musicOff;
    this.canvas = document.getElementById('view') as HTMLCanvasElement;
    // Phones and tablets start on a lighter budget until the player picks a level themselves.
    if (this.coarse && !this.profile.settings.qualityChosen) this.profile.settings.quality = 'medium';
    this.stage = new Stage(this.canvas, this.profile.settings.quality);
    this.bindInput();
    this.bindLifecycle();
    watchPortraits(this.ui);
    this.selectedStage = Math.min(STAGES.length - 1, highestCleared(this.profile) + 1);
    this.hubBiome = STAGES[this.selectedStage].biome;
    this.cloudPending = !!(window as unknown as { claude?: unknown }).claude;
    this.enterTitle();
    if (this.cloudPending) this.syncCloud();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** Picks the right save between this device and the cloud. Start waits for this, within reason. */
  private syncCloud(): void {
    const release = () => {
      this.cloudPending = false;
      // Only the button changes, so a Settings dialog that's open stays open.
      if (this.mode === 'title') this.refreshStartButton();
    };
    const timer = window.setTimeout(release, 6000);
    connectCloud()
      .then((cloud) => {
        if (chooseSave(this.profile, cloud) === 'cloud') {
          // A read that arrives mid-game can't be merged safely. Leave the cloud copy alone this
          // visit: this device hasn't seen it, so it still can't win on timestamp next time.
          if (this.mode !== 'title' && this.mode !== 'hub') return;
          cloud!.settings = this.profile.settings;
          this.profile = cloud!;
          this.selectedStage = Math.min(STAGES.length - 1, highestCleared(this.profile) + 1);
          this.hubBiome = STAGES[this.selectedStage].biome;
          if (this.mode === 'hub') this.enterHub();
        }
        this.profile.cloudSeen = true;
        saveProfile(this.profile);
        enableCloudWrites(this.profile);
      })
      .catch((e) => console.warn('Cloud save unavailable', e))
      .finally(() => {
        clearTimeout(timer);
        release();
      });
  }

  private bindLifecycle(): void {
    // Phones reclaim GPU memory from background tabs. A fresh start is the reliable recovery.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (document.querySelector('.ctx-lost')) return;
      const m = h(`<div class="modal-wrap ctx-lost"><div class="modal"><h2>Graphics reset</h2><p>Your phone paused the 3D graphics. Your progress is saved.</p><div class="acts"><button class="btn" data-reload>Reload</button></div></div></div>`);
      m.querySelector('[data-reload]')!.addEventListener('click', () => location.reload());
      this.ui.appendChild(m);
    });
    document.addEventListener('visibilitychange', () => {
      audio.setSuspended(document.hidden);
      if (document.hidden) this.keys.clear();
    });
    addEventListener('resize', () => {
      this.setViewShift(this.viewShift);
      if (this.mode === 'deploy') this.setupDeployCamera();
      if (this.mode === 'hub') this.frameHubRig();
    });
  }

  // ── Frame loop ──────────────────────────────────────────
  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    try {
      this.update(dt);
      this.stage.render(dt);
    } catch (e) {
      this.showCrash(e);
    }
  }

  /** If something breaks mid-game, say so once, with the details needed to report it. */
  private showCrash(e: unknown): void {
    console.error(e);
    if (this.crashShown) return;
    this.crashShown = true;
    const msg = e instanceof Error ? e.message : String(e);
    const m = h(`<div class="modal-wrap"><div class="modal"><h2>Oops!</h2><p>Something went wrong. Your progress is saved.</p><p class="err-text"></p><div class="acts"><button class="btn" data-reload>Reload</button></div></div></div>`);
    qs(m, '.err-text').textContent = msg;
    qs(m, '[data-reload]').addEventListener('click', () => location.reload());
    this.ui.appendChild(m);
  }

  private update(dt: number): void {
    const { cam, fx } = this.stage;
    switch (this.mode) {
      case 'title':
        this.view?.update(dt);
        if (this.view) {
          const { spread } = this.view.actionPoint(this.actionPt);
          cam.update(dt, this.actionPt, spread);
          if (this.view.battle.over) {
            this.view.finishT = Math.max(0, this.view.finishT) + dt;
            if (this.view.finishT > 3.2) this.spawnDemoBattle();
          }
        }
        break;
      case 'hub':
        if (this.hubRig) {
          this.hubRig.update({ ...IDLE_POSE, flying: !!getSpecies(this.hubRig.speciesId).flying }, dt, dt);
          this.hubAngle += dt * 0.18;
          this.hubRig.root.rotation.y = this.hubAngle;
        }
        fx.update(dt, dt);
        cam.update(dt, null, 0);
        break;
      case 'deploy':
        for (const p of this.placed) p.rig.update({ ...IDLE_POSE, flying: p.flying }, dt, dt);
        if (this.ghost) this.ghost.rig.update({ ...IDLE_POSE, flying: this.ghost.flying }, dt, dt);
        fx.update(dt, dt);
        cam.update(dt, null, 0);
        break;
      case 'battle':
      case 'results':
        this.updateBattle(dt);
        break;
    }
  }

  // ── Transitions ─────────────────────────────────────────
  private async fade(work: () => void): Promise<void> {
    this.fadeEl.classList.add('on');
    await new Promise((r) => setTimeout(r, 320));
    work();
    // Give the GPU a frame to absorb new shaders while the screen is still black.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    this.fadeEl.classList.remove('on');
  }

  private clearUi(): void {
    this.ui.innerHTML = '';
  }

  private clearScene(): void {
    this.view?.dispose();
    this.view = null;
    this.textLayer.innerHTML = '';
    this.placed.forEach((p) => this.removePlaced(p));
    this.placed = [];
    if (this.ghost) { this.removePlaced(this.ghost); this.ghost = null; }
    if (this.hubRig) {
      this.stage.scene.remove(this.hubRig.root);
      this.hubRig.dispose();
      this.hubRig = null;
      this.hubRigKey = '';
    }
    if (this.zone) {
      this.stage.scene.remove(this.zone);
      this.zone = null;
    }
    this.stage.fx.clear();
    this.stage.world?.setGrassClearing(0);
    this.selectedUnit = null;
    this.possessed = null;
    this.aiming = null;
    this.bossUnit = null;
    if (this.reticle) this.reticle.visible = false;
    this.resultTimers.forEach((t) => clearTimeout(t));
    this.resultTimers = [];
    this.screenGen++;
    this.stage.cam.reset();
    this.stage.post.setDesat(0);
    this.setViewShift(0);
  }

  /** Slides the 3D scene sideways so a panel doesn't cover the subject. */
  private setViewShift(requested: number): void {
    this.viewShift = requested;
    const cam = this.stage.cam.camera;
    // Panels stack on portrait phones and leave only a narrow gap on landscape ones.
    let xFraction = requested;
    if (innerWidth < innerHeight) xFraction = 0;
    else if (innerHeight <= 520 && requested > 0) xFraction = requested * 0.2;
    if (xFraction === 0) {
      cam.clearViewOffset();
    } else {
      cam.setViewOffset(innerWidth, innerHeight, -innerWidth * xFraction, 0, innerWidth, innerHeight);
    }
    cam.updateProjectionMatrix();
  }

  // ── Title ───────────────────────────────────────────────
  private enterTitle(): void {
    this.clearScene();
    this.mode = 'title';
    this.stage.setBiome('savanna');
    this.spawnDemoBattle();
    this.renderTitleUi();
    audio.setMusic('menu');
  }

  private refreshStartButton(): void {
    const btn = this.ui.querySelector<HTMLButtonElement>('[data-go=play]');
    if (!btn) return;
    const hasProgress = this.profile.totalWins > 0;
    btn.disabled = this.cloudPending;
    btn.textContent = this.cloudPending ? 'Loading save…' : hasProgress ? 'Continue' : 'Start Campaign';
    const foot = this.ui.querySelector('.title-foot');
    if (foot && hasProgress) foot.textContent = this.titleFoot();
  }

  private titleFoot(): string {
    const sideways = this.coarse && innerWidth < innerHeight ? ' Turn your phone sideways for the best view.' : '';
    const stats = this.profile.totalWins > 0
      ? `${fmt(this.profile.totalWins)} wins · ${fmt(this.profile.totalKills)} knockouts · ${fmt(this.profile.gold)} gold banked.`
      : 'Best with sound on.';
    return stats + sideways;
  }

  private renderTitleUi(): void {
    const hasProgress = this.profile.totalWins > 0;
    this.clearUi();
    const el = h(`
      <div class="title">
        <div class="logo">BEAST<span>FALL</span></div>
        <p class="tagline">Raise a war herd. Win battles, earn XP and gold, and evolve your beasts from wild pups into living legends.</p>
        <div class="title-actions">
          <button class="btn lg" data-go="play" ${this.cloudPending ? 'disabled' : ''}>${this.cloudPending ? 'Loading save…' : hasProgress ? 'Continue' : 'Start Campaign'}</button>
          <button class="btn alt" data-go="sandbox">Sandbox</button>
          <button class="btn alt" data-go="settings">Settings</button>
        </div>
        <p class="title-foot">${this.titleFoot()}</p>
      </div>`);
    this.ui.appendChild(el);
    el.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-go]');
      const go = btn?.dataset.go;
      if (!go || btn.disabled) return;
      audio.unlock();
      audio.ui();
      if (go === 'play') void this.fade(() => this.enterHub());
      if (go === 'sandbox') void this.fade(() => this.enterSandbox());
      if (go === 'settings') this.openSettings();
    });
  }

  private spawnDemoBattle(): void {
    this.view?.dispose();
    this.textLayer.innerHTML = '';
    this.stage.fx.clear();
    const pool = ['velociraptor', 'triceratops', 'trex', 'stegosaurus', 'lion', 'bear', 'tiger', 'gorilla', 'rhino', 'elephant', 'rhinobeetle', 'mantis', 'shark', 'ankylosaurus', 'pachy', 'bison'];
    const pickSquad = (z: number): Deployment[] => {
      const list: Deployment[] = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        list.push({ speciesId: id, level: 3 + Math.floor(Math.random() * 7), x: (i - (n - 1) / 2) * 4.2, z: z + (i % 2) * Math.sign(z) * 3 });
      }
      return list;
    };
    const b = new Battle(pickSquad(9), pickSquad(-9), Math.floor(Math.random() * 1e9));
    b.spirit = 0;
    b.spiritRate = 0;
    this.view = new BattleView(b, this.stage, this.textLayer);
    this.view.running = true;
    const { cam } = this.stage;
    cam.mode = 'orbit';
    cam.autoDirect = true;
    cam.driftSpeed = 0.05;
    cam.minDist = 8;
    cam.set(Math.random() * 6.28, 0.2, 26 * cam.fitScale(), true);
    cam.lookAt(0, 1.4, 0, true);
    cam.startDirecting();
  }

  private openSettings(): void {
    const q = this.profile.settings.quality;
    const m = h(`
      <div class="modal-wrap">
        <div class="modal">
          <h2>Settings</h2>
          <div class="row"><span>Graphics quality</span>
            <div class="seg">${(['low', 'medium', 'high'] as const).map((x) => `<button data-q="${x}" class="${q === x ? 'on' : ''}">${x}</button>`).join('')}</div>
          </div>
          <p>Changing quality reloads the game. Your progress is saved.</p>
          <div class="row"><span>Sound</span>
            <div class="seg"><button data-s="on" class="${audio.muted ? '' : 'on'}">On</button><button data-s="off" class="${audio.muted ? 'on' : ''}">Off</button></div>
          </div>
          <div class="row"><span>Music</span>
            <div class="seg"><button data-mu="on" class="${audio.musicOff ? '' : 'on'}">On</button><button data-mu="off" class="${audio.musicOff ? 'on' : ''}">Off</button></div>
          </div>
          <div class="row"><span>Erase all progress</span><button class="btn sm danger" data-reset>Reset</button></div>
          <div class="acts"><button class="btn sm alt" data-close>Close</button></div>
        </div>
      </div>`);
    this.ui.appendChild(m);
    m.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t === m || t.closest('[data-close]')) { audio.ui(); m.remove(); return; }
      const qb = t.closest<HTMLElement>('[data-q]');
      if (qb) {
        this.profile.settings.quality = qb.dataset.q as Profile['settings']['quality'];
        this.profile.settings.qualityChosen = true;
        saveProfile(this.profile);
        void flushCloud().then(() => location.reload());
      }
      const sb = t.closest<HTMLElement>('[data-s]');
      if (sb) {
        const muted = sb.dataset.s === 'off';
        audio.setMuted(muted);
        this.profile.settings.muted = muted;
        saveProfile(this.profile);
        m.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b === sb));
      }
      const mu = t.closest<HTMLElement>('[data-mu]');
      if (mu) {
        const off = mu.dataset.mu === 'off';
        audio.setMusicOff(off);
        this.profile.settings.musicOff = off;
        saveProfile(this.profile);
        m.querySelectorAll('[data-mu]').forEach((b) => b.classList.toggle('on', b === mu));
      }
      const reset = t.closest<HTMLElement>('[data-reset]');
      if (reset) {
        // Two taps rather than confirm(): some hosts silently disable browser dialogs.
        if (!reset.dataset.armed) {
          reset.dataset.armed = '1';
          reset.textContent = 'Tap again to erase';
          audio.uiDeny();
          return;
        }
        const settings = this.profile.settings;
        this.profile = resetProfile();
        this.profile.settings = settings;
        saveProfile(this.profile);
        void flushCloud().then(() => location.reload());
      }
    });
  }

  // ── Hub ─────────────────────────────────────────────────
  private enterHub(): void {
    this.clearScene();
    this.mode = 'hub';
    audio.setMusic('menu');
    this.selectedStage = Math.min(this.selectedStage, Math.min(STAGES.length - 1, highestCleared(this.profile) + 1));
    this.hubBiome = STAGES[this.selectedStage].biome;
    this.stage.setBiome(this.hubBiome);
    this.positionHubCamera();
    this.renderHub();
  }

  private positionHubCamera(): void {
    const { cam } = this.stage;
    cam.mode = 'orbit';
    cam.autoDirect = false;
    cam.minDist = 6;
    if (this.hubTab === 'campaign') {
      cam.set(0.35, 0.16, 62, true);
      cam.lookAt(0, 8, 0, true);
      this.setViewShift(0);
    } else {
      this.setViewShift(0.2);
    }
  }

  private frameHubRig(): void {
    if (!this.hubRig) return;
    const { cam } = this.stage;
    const h0 = this.hubRig.height;
    const sp = getSpecies(this.hubRig.speciesId);
    const L = Math.max(h0, this.hubRig.look.L + (this.hubRig.look.wingSpan ?? 0) * 0.5);
    const dist = (4.2 + L * 3.1) * cam.fitScale();
    cam.set(0.1, 0.17, dist, false);
    this.stage.world?.setGrassClearing(dist + 6);
    cam.lookAt(0, (sp.flying ? 2.1 : 0) + h0 * 0.48, 0, false);
  }

  private showHubBeast(speciesId: string, evo: number): void {
    const key = `${speciesId}:${evo}`;
    if (key === this.hubRigKey) return;
    if (this.hubRig) {
      this.stage.scene.remove(this.hubRig.root);
      this.hubRig.dispose();
    }
    this.hubRigKey = key;
    this.hubRig = new BeastRig(speciesId, evo, '#ffcf8f');
    const sp = getSpecies(speciesId);
    this.hubRig.root.position.y = sp.flying ? 2.1 : 0;
    this.hubRig.setScale(1 + 0.04 * evo);
    this.stage.scene.add(this.hubRig.root);
    this.frameHubRig();
    this.stage.fx.dust(0, 0, 10, 1.5, 1.2, 0.8);
  }

  private hideHubBeast(): void {
    this.stage.world?.setGrassClearing(0);
    if (!this.hubRig) return;
    this.stage.scene.remove(this.hubRig.root);
    this.hubRig.dispose();
    this.hubRig = null;
    this.hubRigKey = '';
  }

  private renderHub(): void {
    const p = this.profile;
    this.clearUi();
    const tab = this.hubTab;
    const el = h(`
      <div class="hub">
        <div class="topbar">
          <div class="mark">BEAST<span>FALL</span></div>
          <div class="tabs" role="tablist">
            ${(['campaign', 'herd', 'market', 'rare', 'upgrades'] as const).map((t) => `<button class="tab ${t === tab ? 'on' : ''}" data-tab="${t}" role="tab">${t === 'herd' ? `Herd (${p.beasts.length})` : t === 'rare' ? `★ Rare ${(p.rares ?? []).length}/${RARE_TASKS.length}` : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
          </div>
          <div class="top-right">
            <div class="stat minor"><small>Command</small><span class="gold-num" style="color:var(--ink)">${commandCap(p)}</span></div>
            <div class="stat minor"><small>Wins</small><span class="gold-num" style="color:var(--ink)">${fmt(p.totalWins)}</span></div>
            <div class="stat"><small>Gold</small><span class="gold-num" id="gold-amt">${goldTag(p.gold)}</span></div>
            <button class="icon-btn" data-act="sandbox">Sandbox</button>
            <button class="icon-btn" data-act="settings">Settings</button>
            <button class="icon-btn" data-act="title">Title</button>
          </div>
        </div>
        <div class="hub-body">
          <div class="hub-left" id="hub-left"></div>
          <div class="hub-right" id="hub-right"></div>
        </div>
      </div>`);
    this.ui.appendChild(el);
    el.addEventListener('click', (ev) => this.onHubClick(ev));
    switch (tab) {
      case 'campaign': this.renderCampaign(el); break;
      case 'herd': this.renderHerd(el); break;
      case 'market': this.renderMarket(el); break;
      case 'rare': this.renderRare(el); break;
      case 'upgrades': this.renderUpgrades(el); break;
    }
  }

  private onHubClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      audio.ui();
      this.hubTab = tabBtn.dataset.tab as HubTab;
      if (this.hubTab === 'campaign') {
        this.hideHubBeast();
        this.setBiomeForHub(STAGES[this.selectedStage].biome);
      }
      this.positionHubCamera();
      this.renderHub();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'settings') { audio.ui(); this.openSettings(); }
    if (act === 'title') { audio.ui(); void this.fade(() => this.enterTitle()); }
    if (act === 'sandbox') { audio.ui(); void this.fade(() => this.enterSandbox()); }
  }

  private setBiomeForHub(b: BiomeId): void {
    if (this.hubBiome === b && this.stage.world?.biome === b) return;
    this.hubBiome = b;
    this.stage.setBiome(b);
  }

  private renderCampaign(root: HTMLElement): void {
    const p = this.profile;
    const left = qs(root, '#hub-left');
    const right = qs(root, '#hub-right');
    const unlockedTo = Math.min(STAGES.length - 1, highestCleared(p) + 1);
    const biome = STAGES[this.selectedStage].biome;
    const tabs = BIOME_ORDER.map((b) => {
      const list = STAGES.filter((s) => s.biome === b);
      const firstIdx = list[0].index;
      const locked = firstIdx > unlockedTo;
      const stars = list.reduce((sum, s) => sum + (p.stars[s.index] ?? 0), 0);
      return `<button class="biome-tab ${b === biome ? 'on' : ''} ${locked ? 'lock' : ''}" style="--bc:${BIOMES[b].accent}" data-biome="${b}" ${locked ? 'disabled' : ''}>
        <b>${BIOMES[b].name}</b><small>${locked ? 'Locked' : `★ ${stars}/18`}</small></button>`;
    }).join('');
    const stages = STAGES.filter((s) => s.biome === biome).map((s) => {
      const locked = s.index > unlockedTo;
      return `<button class="stage-card ${s.index === this.selectedStage ? 'on' : ''}" data-stage="${s.index}" ${locked ? 'disabled' : ''}>
        <span class="stage-num">STAGE ${s.index + 1}</span>
        <span class="stage-name">${s.name}</span>
        ${starsHtml(p.stars[s.index] ?? 0)}
        ${s.boss ? '<span class="boss-tag">BOSS</span>' : ''}
      </button>`;
    }).join('');
    left.innerHTML = `
      <div class="campaign panel">
        <div class="biome-tabs">${tabs}</div>
        <div>
          <div class="section-h" style="color:${BIOMES[biome].accent}">${BIOMES[biome].name}</div>
          <div class="section-sub">${BIOMES[biome].blurb}</div>
        </div>
        <div class="stage-grid scroll" style="min-height:0">${stages}</div>
      </div>`;
    left.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-biome]');
      if (b && !(b as HTMLButtonElement).disabled) {
        audio.ui();
        const first = STAGES.filter((s) => s.biome === b.dataset.biome)[0];
        const list = STAGES.filter((s) => s.biome === b.dataset.biome && s.index <= unlockedTo);
        this.selectedStage = list.length ? list[list.length - 1].index : first.index;
        void this.fade(() => {
          this.setBiomeForHub(b.dataset.biome as BiomeId);
          this.renderHub();
        });
      }
      const st = t.closest<HTMLElement>('[data-stage]');
      if (st && !(st as HTMLButtonElement).disabled) {
        audio.ui();
        this.selectedStage = Number(st.dataset.stage);
        this.renderHub();
      }
    });
    const stage = STAGES[this.selectedStage];
    const grouped = stage.enemies.map((e) => `
      <div class="enemy-chip ${e.boss ? 'boss' : ''}" title="${getSpecies(e.id).name}">
        <img class="portrait" src="${portrait(e.id, evoStage(e.level))}" alt="${getSpecies(e.id).name}" />
        <span class="lv">${e.level}</span>
        ${(e.n ?? 1) > 1 ? `<span class="cnt">×${e.n}</span>` : ''}
      </div>`).join('');
    const firstClear = !p.stars[stage.index];
    const preview = previewRewards(p, stage, firstClear);
    right.innerHTML = `
      <div class="detail-card panel">
        <span class="stage-num">STAGE ${stage.index + 1}${stage.boss ? ' · BOSS' : ''}</span>
        <h2>${stage.name}</h2>
        ${starsHtml(p.stars[stage.index] ?? 0)}
        <div class="enemy-row">${grouped}</div>
        <div class="rewards">
          <span class="gold-num">${goldTag(preview.gold)}+<small>${firstClear ? 'first clear' : 'replay'}</small></span>
          <span class="xp">+${fmt(preview.xp)} XP<small>per beast</small></span>
        </div>
        <button class="btn lg" data-deploy style="text-align:center">Deploy</button>
      </div>`;
    qs(right, '[data-deploy]').addEventListener('click', () => {
      audio.unlock();
      audio.ui();
      void this.fade(() => this.enterDeploy(stage));
    });
  }

  private renderHerd(root: HTMLElement): void {
    const p = this.profile;
    const left = qs(root, '#hub-left');
    const right = qs(root, '#hub-right');
    const ordered = [...p.beasts].sort((a, b) => b.level - a.level || getSpecies(b.speciesId).tier - getSpecies(a.speciesId).tier);
    if (!this.selectedBeast || !p.beasts.some((b) => b.uid === this.selectedBeast)) this.selectedBeast = ordered[0]?.uid ?? null;
    left.innerHTML = `
      <div class="grid-panel panel scroll">
        <div class="beast-grid">${ordered.map((b) => this.beastCard(b, b.uid === this.selectedBeast)).join('')}</div>
      </div>`;
    left.addEventListener('click', (ev) => {
      const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-uid]');
      if (c) {
        audio.ui();
        this.selectedBeast = c.dataset.uid!;
        this.renderHub();
      }
    });
    const b = p.beasts.find((x) => x.uid === this.selectedBeast);
    if (!b) return;
    const sp = getSpecies(b.speciesId);
    const st = deriveStats(sp, b.level);
    const evo = evoStage(b.level);
    this.showHubBeast(b.speciesId, evo);
    const need = xpToNext(b.level);
    const nextEvo = EVOLUTIONS.find((e) => e.level > b.level);
    const cost = trainCost(b);
    right.innerHTML = `
      <div class="detail panel">
        <span class="evo-pill" style="color:${EVOLUTIONS[evo].color};align-self:flex-start">${EVOLUTIONS[evo].name} · Lv ${b.level}</span>
        <h2>${sp.name}</h2>
        <div class="ep">${sp.epithet} · ${sp.role} · Tier ${sp.tier} · ${sp.cp} CP</div>
        <div class="xp-line"><span>${b.level >= MAX_LEVEL ? 'Max level' : `${fmt(b.xp)} / ${fmt(need)} XP`}</span><span>${nextEvo ? `${nextEvo.name} at Lv ${nextEvo.level}` : 'Fully evolved'}</span></div>
        <div class="xpbar"><i style="width:${need ? (b.xp / need) * 100 : 100}%"></i></div>
        <div class="stat-table">
          <div><small>Health</small>${fmt(st.hp)}</div>
          <div><small>Attack</small>${fmt(st.atk)}</div>
          <div><small>Armor</small>${fmt(st.armor)}</div>
          <div><small>Speed</small>${st.speed.toFixed(1)}</div>
          <div><small>KOs</small>${fmt(b.kills)}</div>
          <div><small>Wins</small>${fmt(b.wins)}</div>
        </div>
        <div class="ability-box"><b>${sp.abilityName}</b><span>${sp.abilityDesc}</span></div>
        <button class="btn" data-train ${b.level >= MAX_LEVEL || p.gold < cost ? 'disabled' : ''} style="text-align:center">
          ${b.level >= MAX_LEVEL ? 'Max level' : `Train +1 level · ${fmt(cost)} gold`}
        </button>
      </div>`;
    const trainBtn = right.querySelector<HTMLButtonElement>('[data-train]');
    trainBtn?.addEventListener('click', () => {
      if (p.gold < cost || b.level >= MAX_LEVEL) { audio.uiDeny(); return; }
      p.gold -= cost;
      const r = grantXp(b, xpToNext(b.level) - b.xp);
      saveProfile(p);
      if (r.evolved) audio.evolve(); else audio.levelUp();
      this.stage.fx.levelUpBurst(0, 0, this.hubRig?.height ?? 1, r.evolved);
      this.renderHub();
    });
  }

  private beastCard(b: Beast, selected: boolean, deployed = false): string {
    const sp = getSpecies(b.speciesId);
    const evo = evoStage(b.level);
    const need = xpToNext(b.level);
    return `
      <button class="bcard evo${evo} ${sp.rare ? 'rare' : ''} ${selected ? 'on' : ''} ${deployed ? 'deployed' : ''}" data-uid="${b.uid}" style="--tc:${TIER_COLOR[sp.tier]}">
        ${portraitImg(b.speciesId, evo)}
        <span class="lv">${b.level}</span><span class="tier"></span>
        <span class="name">${sp.name}</span>
        <span class="cp">${sp.cp} CP · ${EVOLUTIONS[evo].name}</span>
        <div class="xpbar"><i style="width:${need ? (b.xp / need) * 100 : 100}%"></i></div>
      </button>`;
  }

  private renderMarket(root: HTMLElement): void {
    const p = this.profile;
    const left = qs(root, '#hub-left');
    const right = qs(root, '#hub-right');
    const reached = highestCleared(p) + 1;
    if (!this.selectedSpecies) this.selectedSpecies = 'compy';
    const shown = SPECIES
      .filter((sp) => !sp.rare && (this.marketFilter === 'All' || sp.group === this.marketFilter))
      .sort((a, b) => a.tier - b.tier || a.price - b.price);
    left.innerHTML = `
      <div class="grid-panel panel scroll">
        ${this.filterRow(this.marketFilter, GROUP_FILTERS.filter((g) => g !== 'Rare'))}
        <div class="market-grid">
          ${shown.map((sp) => {
            const locked = recruitUnlockStage(sp) > reached;
            const price = recruitPrice(p, sp);
            return `<button class="mcard ${locked ? 'lock' : ''} ${sp.id === this.selectedSpecies ? 'on' : ''}" data-sp="${sp.id}">
              ${portraitImg(sp.id)}
              <span class="name" style="font-family:var(--label);font-weight:600;font-size:16px">${locked ? 'Locked' : sp.name}</span>
              ${locked ? `<span class="cp" style="font-family:var(--label);color:var(--ink-3);font-size:13px">Clear stage ${recruitUnlockStage(sp)}</span>` : `<span class="price ${p.gold < price ? 'no' : ''}">${goldTag(price)}</span>`}
            </button>`;
          }).join('')}
        </div>
      </div>`;
    left.addEventListener('click', (ev) => {
      const f = (ev.target as HTMLElement).closest<HTMLElement>('[data-filter]');
      if (f) {
        audio.ui();
        this.marketFilter = f.dataset.filter as GroupFilter;
        this.renderHub();
        return;
      }
      const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-sp]');
      if (c) {
        audio.ui();
        this.selectedSpecies = c.dataset.sp!;
        const scroller = left.querySelector('.grid-panel');
        const top = scroller?.scrollTop ?? 0;
        this.renderHub();
        const next = this.ui.querySelector('.grid-panel');
        if (next) next.scrollTop = top;
      }
    });
    const sp = getSpecies(this.selectedSpecies);
    const locked = recruitUnlockStage(sp) > reached;
    const price = recruitPrice(p, sp);
    const st = deriveStats(sp, 1);
    const owned = p.beasts.filter((b) => b.speciesId === sp.id).length;
    if (locked) this.hideHubBeast();
    else this.showHubBeast(sp.id, 0);
    right.innerHTML = `
      <div class="detail panel">
        <h2>${locked ? '???' : sp.name}</h2>
        <div class="ep">${locked ? `Clear stage ${recruitUnlockStage(sp)} to unlock.` : `${sp.epithet} · ${sp.role} · Tier ${sp.tier} · ${sp.cp} CP · Owned: ${owned}`}</div>
        ${locked ? '' : `
          <div class="stat-table">
            <div><small>Health</small>${fmt(st.hp)}</div>
            <div><small>Attack</small>${fmt(st.atk)}</div>
            <div><small>Armor</small>${fmt(st.armor)}</div>
          </div>
          <div class="ability-box"><b>${sp.abilityName}</b><span>${sp.abilityDesc}</span></div>
          <button class="btn" data-buy ${p.gold < price ? 'disabled' : ''} style="text-align:center">Recruit · ${fmt(price)} gold</button>`}
      </div>`;
    right.querySelector<HTMLButtonElement>('[data-buy]')?.addEventListener('click', () => {
      if (p.gold < price) { audio.uiDeny(); return; }
      p.gold -= price;
      const b = addBeast(p, sp.id);
      saveProfile(p);
      audio.coin();
      audio.place();
      audio.voice(sp.id, sp.group, sp.radius, false);
      this.stage.fx.coinBurst(0, this.hubRig?.height ?? 1, 0, 34);
      this.stage.fx.ring(0, 0, 4, '#ffc53d', 0.7, 0.14, 0.14, 2.6);
      this.selectedBeast = b.uid;
      this.renderHub();
    });
  }

  private filterRow(active: GroupFilter, filters: GroupFilter[] = GROUP_FILTERS): string {
    const pool = this.availableSpecies();
    return `<div class="filter-row">${filters.map((g) => {
      const n = pool.filter((sp) => (g === 'All' ? !sp.rare || filters.includes('Rare') : sp.group === g)).length;
      return `<button class="filter ${g === active ? 'on' : ''}" data-filter="${g}">${g} <small>${n}</small></button>`;
    }).join('')}</div>`;
  }

  /** Every species the player may use freely: all of them, minus rare beasts they haven't earned. */
  private availableSpecies(): typeof SPECIES {
    return SPECIES.filter((sp) => !sp.rare || hasRare(this.profile, sp.id));
  }

  private renderRare(root: HTMLElement): void {
    const p = this.profile;
    const left = qs(root, '#hub-left');
    const right = qs(root, '#hub-right');
    const firstOpen = RARE_TASKS.find((t) => !hasRare(p, t.speciesId) && taskRevealed(p, t)) ?? RARE_TASKS[0];
    if (!this.selectedRare) this.selectedRare = firstOpen.speciesId;
    left.innerHTML = `
      <div class="grid-panel panel scroll">
        <div class="market-grid">
          ${RARE_TASKS.map((t) => {
            const sp = getSpecies(t.speciesId);
            const earned = hasRare(p, sp.id);
            const open = taskRevealed(p, t);
            return `<button class="mcard rare-card ${earned ? 'earned' : 'lock'} ${open && !earned ? 'open' : ''} ${sp.id === this.selectedRare ? 'on' : ''}" data-rare="${sp.id}">
              ${portraitImg(sp.id, earned ? 1 : 0)}
              <span class="name" style="font-family:var(--label);font-weight:600;font-size:16px">${earned ? sp.name : '???'}</span>
              <span class="cp" style="font-family:var(--label);font-size:13px;color:${earned ? 'var(--gold)' : open ? 'var(--green)' : 'var(--ink-3)'}">${earned ? '★ Earned' : open ? 'Task open!' : `After stage ${t.afterStage + 1}`}</span>
            </button>`;
          }).join('')}
        </div>
      </div>`;
    left.addEventListener('click', (ev) => {
      const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-rare]');
      if (c) {
        audio.ui();
        this.selectedRare = c.dataset.rare!;
        this.renderHub();
      }
    });
    const task = RARE_TASKS.find((t) => t.speciesId === this.selectedRare)!;
    const sp = getSpecies(task.speciesId);
    const earned = hasRare(p, sp.id);
    const open = taskRevealed(p, task);
    if (earned) {
      this.showHubBeast(sp.id, 1);
    } else {
      this.hideHubBeast();
    }
    const prog = task.progress?.(p);
    const pct = prog ? Math.min(100, (prog.have / prog.need) * 100) : 0;
    right.innerHTML = `
      <div class="detail panel rare-detail">
        <span class="evo-pill" style="color:var(--gold);align-self:flex-start">★ Rare beast</span>
        <h2>${earned ? sp.name : 'Mystery Beast'}</h2>
        ${earned ? `<div class="ep">${sp.epithet} · ${sp.role} · ${sp.cp} CP</div>` : ''}
        ${earned
          ? `<div class="ability-box"><b>${sp.abilityName}</b><span>${sp.abilityDesc}</span></div>`
          : open
            ? `<div class="ability-box task-box"><b>Your task</b><span>${task.text}</span></div>
               ${prog ? `<div class="xp-line"><span>${fmt(Math.min(prog.have, prog.need))} / ${fmt(prog.need)}</span></div><div class="xpbar"><i style="width:${pct}%"></i></div>` : ''}
               <div class="ep">Rare beasts can't be bought. Finish the task to win this one forever.</div>`
            : `<div class="ability-box task-box"><b>Task hidden</b><span>Clear Stage ${task.afterStage + 1} to reveal what you must do.</span></div>`}
      </div>`;
  }

  private renderUpgrades(root: HTMLElement): void {
    const p = this.profile;
    const left = qs(root, '#hub-left');
    const right = qs(root, '#hub-right');
    this.hideHubBeast();
    left.innerHTML = `<div class="grid-panel panel scroll"><div class="list-gap">
      ${(Object.keys(UPGRADE_DEFS) as UpgradeId[]).map((id) => {
        const d = UPGRADE_DEFS[id];
        const lv = p.upgrades[id];
        const maxed = lv >= d.max;
        const cost = upgradeCost(id, lv);
        return `<div class="upgrade">
          <div><h3>${d.name}</h3><p>${d.desc}</p></div>
          <button class="btn sm" data-up="${id}" ${maxed || p.gold < cost ? 'disabled' : ''}>${maxed ? 'Maxed' : `${fmt(cost)} gold`}</button>
          <div class="pips">${Array.from({ length: d.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        </div>`;
      }).join('')}
    </div></div>`;
    left.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-up]');
      if (!b || b.disabled) return;
      const id = b.dataset.up as UpgradeId;
      const cost = upgradeCost(id, p.upgrades[id]);
      if (p.gold < cost) { audio.uiDeny(); return; }
      p.gold -= cost;
      p.upgrades[id]++;
      saveProfile(p);
      audio.coin();
      audio.levelUp();
      this.renderHub();
    });
    right.innerHTML = `
      <div class="detail panel">
        <h2>War Camp</h2>
        <div class="ep">Permanent upgrades, paid for in battle gold. Command is how much beast you can field at once: it also grows with every new stage you clear.</div>
      </div>`;
  }

  // ── Deployment ──────────────────────────────────────────
  private enterDeploy(stage: CampaignStage): void {
    this.clearScene();
    this.mode = 'deploy';
    this.sandbox = false;
    this.currentStage = stage;
    this.stage.setBiome(stage.biome);
    this.setupDeployCamera();
    this.buildZone();
    audio.setMusic('menu');
    for (const f of stageFormation(stage)) {
      this.place({ team: 1, speciesId: f.speciesId, level: f.level, x: f.x, z: f.z, boss: f.boss });
    }
    // Restore the player's last formation for whatever still fits.
    const cap = commandCap(this.profile);
    let used = 0;
    for (const s of this.profile.lastSquad) {
      const b = this.profile.beasts.find((x) => x.uid === s.uid);
      if (!b) continue;
      const cp = getSpecies(b.speciesId).cp;
      if (used + cp > cap) continue;
      used += cp;
      this.place({ team: 0, speciesId: b.speciesId, level: b.level, x: s.x, z: s.z, uid: b.uid });
    }
    this.renderDeploy();
  }

  private enterSandbox(): void {
    this.clearScene();
    this.mode = 'deploy';
    this.sandbox = true;
    this.currentStage = null;
    this.sandboxTeam = 0;
    this.stage.setBiome(BIOME_ORDER[Math.floor(Math.random() * BIOME_ORDER.length)]);
    this.setupDeployCamera();
    this.buildZone();
    audio.setMusic('menu');
    this.renderDeploy();
  }

  private setupDeployCamera(): void {
    const { cam } = this.stage;
    cam.mode = 'orbit';
    cam.autoDirect = false;
    cam.minDist = 20;
    const portrait = innerWidth < innerHeight;
    // Short screens lose the bottom to the tray, so aim lower to keep the blue zone in view.
    const short = innerHeight <= 520;
    cam.set(0, portrait ? 0.95 : 0.68, portrait ? 88 : short ? 60 : 54, true);
    cam.lookAt(0, 0, portrait ? 8 : short ? 7 : 3.5, true);
  }

  private buildZone(): void {
    const geo = new THREE.CircleGeometry(DEPLOY_RADIUS, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uSandbox: { value: this.sandbox ? 1 : 0 } },
      vertexShader: `varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vP; uniform float uSandbox;
        void main(){
          float blueMask = smoothstep(2.9,3.2,vP.y);
          float redMask = smoothstep(-2.9,-3.2,vP.y);
          vec2 g = abs(fract(vP/4.0)-0.5);
          float grid = 1.0-smoothstep(0.0,0.03,min(g.x,g.y));
          float edge = smoothstep(${(DEPLOY_RADIUS - 0.5).toFixed(1)},${DEPLOY_RADIUS.toFixed(1)},length(vP));
          float line = smoothstep(0.14,0.0,abs(vP.y-3.0)) + smoothstep(0.14,0.0,abs(vP.y+3.0));
          vec3 col = vec3(0.0);
          float a = 0.0;
          col += vec3(0.22,0.72,1.0)*blueMask; a += blueMask*(0.1+grid*0.2+edge*0.5);
          float rs = uSandbox;
          col += vec3(1.0,0.29,0.24)*redMask; a += redMask*(0.03+rs*0.05+grid*0.07+edge*0.3);
          a += line*0.55;
          gl_FragColor = vec4(col*1.6+vec3(line*0.4),a);
        }`,
    });
    this.zone = new THREE.Mesh(geo, mat);
    this.zone.position.y = 0.1;
    this.zone.renderOrder = 1;
    this.stage.scene.add(this.zone);
  }

  private makeRing(team: 0 | 1, radius: number): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLOR[team]).multiplyScalar(1.5), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
    );
    ring.scale.setScalar(radius * 1.2);
    ring.renderOrder = 2;
    return ring;
  }

  private place(o: { team: 0 | 1; speciesId: string; level: number; x: number; z: number; uid?: string; boss?: boolean }): Placed {
    const sp = getSpecies(o.speciesId);
    const st = deriveStats(sp, o.level, o.boss);
    const rig = new BeastRig(o.speciesId, evoStage(o.level), TEAM_COLOR[o.team]);
    rig.setScale(st.scale);
    rig.root.rotation.y = o.team === 0 ? Math.PI : 0;
    const ring = this.makeRing(o.team, st.radius);
    const p: Placed = { ...o, rig, ring, flying: !!sp.flying };
    this.positionPlaced(p);
    this.stage.scene.add(rig.root, ring);
    this.placed.push(p);
    return p;
  }

  private positionPlaced(p: Placed): void {
    p.rig.root.position.set(p.x, p.flying ? 3.4 : 0, p.z);
    p.ring.position.set(p.x, 0.12, p.z);
  }

  private removePlaced(p: Placed): void {
    this.stage.scene.remove(p.rig.root, p.ring);
    p.rig.dispose();
    p.ring.geometry.dispose();
    (p.ring.material as THREE.Material).dispose();
  }

  /** Takes a beast off the field. Safe if it's already gone. */
  private dropPlaced(p: Placed): void {
    const i = this.placed.indexOf(p);
    if (i < 0) return;
    this.placed.splice(i, 1);
    this.removePlaced(p);
  }

  private usedCp(): number {
    return this.placed.filter((p) => p.team === 0).reduce((s, p) => s + getSpecies(p.speciesId).cp, 0);
  }

  private renderDeploy(): void {
    this.clearUi();
    const cap = this.sandbox ? Infinity : commandCap(this.profile);
    const used = this.usedCp();
    const stage = this.currentStage;
    const remove = this.coarse ? 'tap a beast on the field to remove it' : 'right-click to remove';
    const hint = this.sandbox
      ? `Tap or drag any beast onto either side; ${remove}. Sandbox battles pay no XP or gold.`
      : this.profile.totalWins === 0
        ? 'Tap a beast to add it, or tap Auto-Deploy. Every beast you field earns XP. Then hit Fight!'
        : `Tap or drag beasts into the blue zone; ${remove}.`;
    const el = h(`
      <div class="deploy">
        <div class="deploy-top">
          <div class="deploy-title">
            <h2>${stage ? stage.name : 'Sandbox'}</h2>
            <small>${stage ? `Stage ${stage.index + 1} · ${BIOMES[stage.biome].name}${stage.boss ? ' · Boss battle' : ''}` : 'Free battle: anything goes'}</small>
          </div>
          <div class="deploy-actions">
            <button class="btn sm alt" data-a="back">Back</button>
            <button class="btn sm alt" data-a="clear">Clear</button>
            <button class="btn sm alt" data-a="auto">Auto-Deploy</button>
            <div class="cp-meter">
              <b class="${used > cap ? 'over' : ''}" id="cp-val">${this.sandbox ? this.placed.length : `${used}/${cap}`}</b>
              <small>${this.sandbox ? 'Beasts' : 'Command'}</small>
            </div>
            <button class="btn lg" data-a="fight" id="fight-btn">Fight!</button>
          </div>
        </div>
        <div class="deploy-bottom">
          <div class="tray-head">
            <span class="hint">${hint}</span>
            ${this.sandbox ? `
              <div class="seg"><button class="blue ${this.sandboxTeam === 0 ? 'on' : ''}" data-team="0">Your Side</button><button class="red ${this.sandboxTeam === 1 ? 'on' : ''}" data-team="1">Enemy Side</button></div>
              <label class="slider">Level <input id="sbx-level" type="range" min="1" max="${MAX_LEVEL}" value="${this.sandboxLevel}" /> <span id="sbx-lv">${this.sandboxLevel}</span></label>` : ''}
          </div>
          ${this.sandbox ? this.filterRow(this.sandboxFilter) : ''}
          <div class="tray" id="tray">${this.trayHtml()}</div>
        </div>
      </div>`);
    this.ui.appendChild(el);
    el.addEventListener('click', (ev) => this.onDeployClick(ev));
    el.addEventListener('pointerdown', (ev) => this.onTrayDown(ev as PointerEvent));
    if (this.sandbox) {
      const slider = qs<HTMLInputElement>(el, '#sbx-level');
      slider.addEventListener('input', () => {
        this.sandboxLevel = Number(slider.value);
        qs(el, '#sbx-lv').textContent = slider.value;
      });
    }
    this.updateFightButton();
  }

  private trayHtml(): string {
    if (this.sandbox) {
      const shown = this.availableSpecies().filter((sp) => this.sandboxFilter === 'All' || sp.group === this.sandboxFilter);
      if (!shown.length) return '<p class="tray-note">Earn rare beasts by finishing their tasks. See the Rare tab at camp.</p>';
      return shown.map((sp) => `
        <button class="bcard" data-sp="${sp.id}" style="--tc:${TIER_COLOR[sp.tier]}">
          ${portraitImg(sp.id)}
          <span class="tier"></span>
          <span class="name">${sp.name}</span>
          <span class="cp">Tier ${sp.tier}</span>
        </button>`).join('');
    }
    const deployed = new Set(this.placed.map((p) => p.uid));
    const ordered = [...this.profile.beasts].sort((a, b) => Number(deployed.has(a.uid)) - Number(deployed.has(b.uid)) || b.level - a.level);
    return ordered.map((b) => this.beastCard(b, false, deployed.has(b.uid))).join('');
  }

  private refreshDeployUi(): void {
    if (this.mode !== 'deploy') return;
    const tray = document.getElementById('tray');
    if (tray) {
      const sc = tray.scrollLeft;
      if (!this.sandbox) tray.innerHTML = this.trayHtml();
      tray.scrollLeft = sc;
    }
    const cpEl = document.getElementById('cp-val');
    if (cpEl) {
      const used = this.usedCp();
      const cap = this.sandbox ? Infinity : commandCap(this.profile);
      cpEl.textContent = this.sandbox ? String(this.placed.length) : `${used}/${cap}`;
      cpEl.classList.toggle('over', used > cap);
    }
    this.updateFightButton();
  }

  private updateFightButton(): void {
    const btn = document.getElementById('fight-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const a = this.placed.some((p) => p.team === 0);
    const b = this.placed.some((p) => p.team === 1);
    btn.disabled = !a || !b || (!this.sandbox && this.usedCp() > commandCap(this.profile));
  }

  private onDeployClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    const filter = t.closest<HTMLElement>('[data-filter]');
    if (filter) {
      audio.ui();
      this.sandboxFilter = filter.dataset.filter as GroupFilter;
      filter.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === filter));
      const tray = document.getElementById('tray');
      if (tray) { tray.innerHTML = this.trayHtml(); tray.scrollLeft = 0; }
      return;
    }
    const team = t.closest<HTMLElement>('[data-team]');
    if (team) {
      audio.ui();
      this.sandboxTeam = Number(team.dataset.team) as 0 | 1;
      team.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === team));
      return;
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    audio.unlock();
    audio.ui();
    if (a === 'back') {
      void this.fade(() => (this.sandbox ? this.enterTitle() : this.enterHub()));
    } else if (a === 'clear') {
      for (const p of [...this.placed]) {
        if (p.team === 0 || this.sandbox) {
          this.dropPlaced(p);
        }
      }
      this.refreshDeployUi();
    } else if (a === 'auto') {
      this.autoDeploy();
    } else if (a === 'fight') {
      this.startBattle();
    }
  }

  private autoDeploy(): void {
    if (this.sandbox) {
      // Fill both sides with a surprise from the chosen group, replacing what was there.
      for (const p of [...this.placed]) this.dropPlaced(p);
      const pool = this.availableSpecies().filter((sp) => this.sandboxFilter === 'All' || sp.group === this.sandboxFilter);
      if (!pool.length) { audio.uiDeny(); return; }
      for (const team of [0, 1] as const) {
        for (let i = 0; i < 6; i++) {
          const sp = pool[Math.floor(Math.random() * pool.length)];
          const z = (team === 0 ? 1 : -1) * (10 + (i % 2) * 5);
          this.place({ team, speciesId: sp.id, level: this.sandboxLevel, x: (i - 2.5) * 5, z });
        }
      }
      this.refreshDeployUi();
      audio.place();
      return;
    }
    for (const p of [...this.placed]) {
      if (p.team === 0) {
        this.dropPlaced(p);
      }
    }
    const cap = commandCap(this.profile);
    const score = (b: Beast) => {
      const st = deriveStats(getSpecies(b.speciesId), b.level);
      return Math.sqrt(st.hp * st.atk);
    };
    const ranked = [...this.profile.beasts].sort((a, b) => score(b) - score(a));
    const squad: Beast[] = [];
    let used = 0;
    for (const b of ranked) {
      const cp = getSpecies(b.speciesId).cp;
      if (used + cp > cap) continue;
      used += cp;
      squad.push(b);
    }
    // Tanks front, shooters back.
    squad.sort((a, b) => {
      const A = getSpecies(a.speciesId);
      const B = getSpecies(b.speciesId);
      return Number(!!A.ranged) - Number(!!B.ranged) || B.radius - A.radius;
    });
    const spots = gridFormation(squad.length, 4.6, 5, 9);
    squad.forEach((b, i) => {
      this.place({ team: 0, speciesId: b.speciesId, level: b.level, uid: b.uid, x: spots[i][0], z: spots[i][1] });
    });
    audio.place();
    this.refreshDeployUi();
  }

  private onTrayDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const card = (ev.target as HTMLElement).closest<HTMLElement>('.bcard');
    if (!card) return;
    let speciesId: string;
    let level: number;
    let uid: string | undefined;
    if (this.sandbox) {
      speciesId = card.dataset.sp!;
      level = this.sandboxLevel;
    } else {
      uid = card.dataset.uid!;
      const b = this.profile.beasts.find((x) => x.uid === uid);
      if (!b) return;
      const already = this.placed.find((p) => p.uid === uid);
      if (already) {
        // Recalls on a completed tap, so swiping the tray across this card doesn't remove it.
        this.dragging = { kind: 'recall', p: already };
        this.dragMoved = false;
        this.dragStart = { x: ev.clientX, y: ev.clientY };
        return;
      }
      speciesId = b.speciesId;
      level = b.level;
    }
    audio.unlock();
    this.dragging = { kind: 'new', speciesId, level, uid };
    this.dragMoved = false;
    this.dragStart = { x: ev.clientX, y: ev.clientY };
    this.ghostEl = h(`<img class="drag-ghost" src="${portrait(speciesId, evoStage(level))}" alt="" style="display:none" />`);
    document.body.appendChild(this.ghostEl);
    this.moveGhost(ev.clientX, ev.clientY);
  }

  /** The first open spot in a beast's zone, for tap-to-place. */
  private freeSlot(team: 0 | 1): [number, number] {
    const sign = team === 0 ? 1 : -1;
    for (let row = 0; row < 5; row++) {
      for (let c = 0; c < 9; c++) {
        const x = (c % 2 ? 1 : -1) * Math.ceil(c / 2) * 4.6;
        const z = sign * (9 + row * 5);
        if (Math.hypot(x, z) > DEPLOY_RADIUS - 2) continue;
        if (!this.placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) return [x, z];
      }
    }
    return [(Math.random() - 0.5) * 20, sign * 12];
  }

  private tapPlace(d: { speciesId: string; level: number; uid?: string }): void {
    const sp = getSpecies(d.speciesId);
    const team: 0 | 1 = this.sandbox ? this.sandboxTeam : 0;
    if (!this.sandbox && this.usedCp() + sp.cp > commandCap(this.profile)) {
      audio.uiDeny();
      this.flashCp();
      return;
    }
    const [x, z] = this.freeSlot(team);
    this.place({ team, speciesId: d.speciesId, level: d.level, x, z, uid: d.uid });
    audio.place();
    this.stage.fx.dust(x, z, 12, 1.2, 1.1, 0.8);
    this.stage.fx.ring(x, z, 2 + sp.radius, TEAM_COLOR[team], 0.4, 0.2, 0.14, 2.6);
    this.refreshDeployUi();
  }

  private moveGhost(x: number, y: number): void {
    if (this.ghostEl) this.ghostEl.style.transform = `translate(${x - 44}px,${y - 44}px)`;
  }

  private groundPoint(cx: number, cy: number, out: THREE.Vector3): boolean {
    const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.stage.cam.camera);
    return !!this.ray.ray.intersectPlane(this.plane, out);
  }

  /** Keeps placements in the arena and on the correct side of the midline. */
  private clampPlacement(x: number, z: number, team: 0 | 1): [number, number] {
    let zz = team === 0 ? Math.max(3.2, z) : Math.min(-3.2, z);
    let xx = x;
    const r = Math.hypot(xx, zz);
    if (r > DEPLOY_RADIUS - 1) { xx *= (DEPLOY_RADIUS - 1) / r; zz *= (DEPLOY_RADIUS - 1) / r; }
    return [xx, zz];
  }

  private placedAt(cx: number, cy: number): Placed | null {
    const cam = this.stage.cam.camera;
    const v = new THREE.Vector3();
    let best: Placed | null = null;
    let bestD = 58;
    for (const p of this.placed) {
      if (!this.sandbox && p.team !== 0) continue;
      v.set(p.x, (p.flying ? 3.4 : 0) + p.rig.height * 0.5, p.z).project(cam);
      const sx = (v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // ── Battle ──────────────────────────────────────────────
  private startBattle(): void {
    const team = (t: 0 | 1): Deployment[] => this.placed
      .filter((p) => p.team === t)
      .map((p) => ({ speciesId: p.speciesId, level: p.level, x: p.x, z: p.z, uid: p.uid, boss: p.boss }));
    const a = team(0);
    const b = team(1);
    if (!a.length || !b.length) { audio.uiDeny(); return; }
    if (!this.sandbox) {
      this.profile.lastSquad = this.placed.filter((p) => p.team === 0 && p.uid).map((p) => ({ uid: p.uid!, x: p.x, z: p.z }));
      saveProfile(this.profile);
    }
    this.placed.forEach((p) => this.removePlaced(p));
    this.placed = [];
    if (this.zone) { this.stage.scene.remove(this.zone); this.zone = null; }

    const battle = new Battle(a, b, Math.floor(Math.random() * 1e9));
    battle.spiritRate = 2.6 * (1 + 0.2 * (this.sandbox ? 0 : this.profile.upgrades.spirit));
    this.view = new BattleView(battle, this.stage, this.textLayer);
    this.view.running = true;
    this.view.onKill = (victim, by) => this.pushFeed(victim, by);
    this.view.onShout = (text, tier) => this.shout(text, tier);
    this.bossUnit = battle.units.find((u) => u.boss) ?? null;
    this.finished = false;
    this.mode = 'battle';
    this.speedIdx = 1;
    const { cam } = this.stage;
    cam.mode = 'orbit';
    cam.autoDirect = true;
    cam.driftSpeed = 0.035;
    cam.minDist = 8;
    // Open low behind the herd as both lines charge.
    cam.set(0.25, 0.14, 24 * cam.fitScale());
    cam.lookAt(0, 1.2, 2);
    cam.startDirecting();
    this.renderHud();
    this.showBanner('FIGHT!');
    audio.horn();
    audio.setMusic('battle');
  }

  private showBanner(text: string): void {
    const b = h(`<div class="banner">${text}</div>`);
    this.ui.appendChild(b);
    setTimeout(() => b.remove(), 1350);
  }

  private shout(text: string, tier: number): void {
    const hud = this.ui.querySelector('.hud');
    if (!hud) return;
    hud.querySelector('.shout')?.remove();
    const el = h(`<div class="shout t${Math.min(4, tier)}">${text}</div>`);
    hud.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  private pushFeed(victim: Unit, by: Unit | null): void {
    const feed = this.hudRefs.feed;
    if (!feed) return;
    const killer = by ? by.sp.name : 'Spirit';
    const line = h(`<div class="${victim.team === 1 ? 'ka' : 'kb'}">${killer} ▸ ${victim.sp.name}</div>`);
    feed.prepend(line);
    while (feed.children.length > 5) feed.lastElementChild?.remove();
    setTimeout(() => line.remove(), 3600);
  }

  private renderHud(): void {
    this.clearUi();
    const highest = this.sandbox ? 999 : Math.max(highestCleared(this.profile) + 1, this.currentStage?.index ?? 0);
    const ids = Object.keys(POWERS) as PowerId[];
    const el = h(`
      <div class="hud ${this.bossUnit ? 'has-boss' : ''}">
        <div class="hud-top">
          <div class="versus">
            <div class="team-bar a"><i id="bar-a"></i><span class="team-count" id="cnt-a"></span></div>
            <div class="clock" id="clock">0:00</div>
            <div class="team-bar b"><i id="bar-b"></i><span class="team-count" id="cnt-b"></span></div>
          </div>
          ${this.bossUnit ? `<div class="boss-bar"><div class="label">${this.bossUnit.sp.name} · ${this.currentStage?.name ?? ''}</div><div class="track"><i id="boss-hp"></i></div></div>` : ''}
        </div>
        <div class="hud-corner">
          <button class="icon-btn" data-h="menu" title="Pause menu (Esc)" aria-label="Pause menu">II</button>
        </div>
        <div class="feed" id="feed"></div>
        <div class="powers-wrap">
          <div class="spirit" title="Spirit: charges over time and with each kill"><i id="spirit"></i></div>
          <div class="powers">
            ${ids.map((id) => {
              const pw = POWERS[id];
              const locked = pw.unlock > highest;
              return `<button class="power" data-power="${id}" title="${pw.desc}" ${locked ? 'disabled data-locked="1"' : ''}>
                <span class="key">${pw.key}</span><b>${locked ? 'Locked' : pw.name}</b><small>${locked ? `Stage ${pw.unlock + 1}` : `${pw.cost} spirit`}</small>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="speed">
          <div class="seg" id="speed-seg">${SPEEDS.map((s, i) => `<button data-speed="${i}" class="${i === this.speedIdx ? 'on' : ''}">${s}×</button>`).join('')}</div>
        </div>
        <div class="unit-card panel none" id="unit-card"></div>
        <div class="control-tip none" id="ctip"></div>
        <div class="stick none" id="stick" aria-label="Move"><i id="stick-knob"></i></div>
        <div class="act-btns none" id="act-btns">
          <button class="act release" data-h="possess">Release</button>
          <button class="act ability" data-hold="e">Ability</button>
          <button class="act attack" data-hold="btn-attack">Attack</button>
        </div>
      </div>`);
    this.ui.appendChild(el);
    el.addEventListener('click', (ev) => this.onHudClick(ev));
    this.hudRefs = {
      barA: qs(el, '#bar-a'), barB: qs(el, '#bar-b'), cntA: qs(el, '#cnt-a'), cntB: qs(el, '#cnt-b'),
      clock: qs(el, '#clock'), spirit: qs(el, '#spirit'), feed: qs(el, '#feed'), unit: qs(el, '#unit-card'), ctip: qs(el, '#ctip'),
    };
    const boss = el.querySelector<HTMLElement>('#boss-hp');
    if (boss) this.hudRefs.boss = boss;
    this.powerButtons = [...el.querySelectorAll<HTMLButtonElement>('[data-power]:not([data-locked])')];
    this.bindTouchControls(el);
  }

  private bindTouchControls(el: HTMLElement): void {
    const stick = qs(el, '#stick');
    const knob = qs(el, '#stick-knob');
    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const reach = r.width / 2;
      let dx = (e.clientX - (r.left + reach)) / reach;
      let dy = (e.clientY - (r.top + reach)) / reach;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.stick = len < 0.15 ? { x: 0, y: 0 } : { x: dx, y: dy };
      knob.style.transform = `translate(${dx * reach * 0.6}px,${dy * reach * 0.6}px)`;
    };
    const end = () => {
      this.stick = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', (e) => {
      stick.setPointerCapture(e.pointerId);
      move(e);
    });
    stick.addEventListener('pointermove', (e) => { if (stick.hasPointerCapture(e.pointerId)) move(e); });
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    el.querySelectorAll<HTMLElement>('[data-hold]').forEach((b) => {
      const key = b.dataset.hold!;
      b.addEventListener('pointerdown', (e) => {
        b.setPointerCapture(e.pointerId);
        this.keys.add(key);
      });
      const up = () => this.keys.delete(key);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    });
  }

  private showTouchControls(on: boolean): void {
    const show = on && this.coarse;
    document.getElementById('stick')?.classList.toggle('none', !show);
    document.getElementById('act-btns')?.classList.toggle('none', !show);
    document.querySelector('.hud')?.classList.toggle('possessing', show);
    if (!on) this.stick = { x: 0, y: 0 };
  }

  private onHudClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    const pw = t.closest<HTMLButtonElement>('[data-power]');
    if (pw && !pw.disabled) { this.usePower(pw.dataset.power as PowerId); return; }
    const sp = t.closest<HTMLElement>('[data-speed]');
    if (sp) { audio.ui(); this.setSpeed(Number(sp.dataset.speed)); return; }
    const act = t.closest<HTMLElement>('[data-h]')?.dataset.h;
    if (act === 'menu') { audio.ui(); this.openPause(); }
    if (act === 'follow') { audio.ui(); this.toggleFollow(); }
    if (act === 'possess') { audio.ui(); this.togglePossess(); }
  }

  private setSpeed(i: number): void {
    this.speedIdx = THREE.MathUtils.clamp(i, 0, SPEEDS.length - 1);
    if (this.view) this.view.speed = SPEEDS[this.speedIdx];
    document.querySelectorAll('#speed-seg button').forEach((b, idx) => b.classList.toggle('on', idx === this.speedIdx));
  }

  private usePower(id: PowerId): void {
    const v = this.view;
    if (!v) return;
    const def = POWERS[id];
    if (!v.battle.canCast(id)) { audio.uiDeny(); return; }
    if (!def.targeted) {
      v.battle.castPower(id, 0, 0);
      return;
    }
    // Clicks are attacks while steering a beast, so aimed powers strike whatever it's facing off against.
    if (this.possessed) {
      const t = this.possessed.target;
      if (t && !t.dead) v.battle.castPower(id, t.x, t.z);
      else audio.uiDeny();
      return;
    }
    this.aiming = this.aiming === id ? null : id;
    audio.ui();
    this.ensureReticle();
    if (this.aiming && this.coarse) {
      // With no cursor to follow, start the aim on the thick of the fight.
      const pt = this.actionPt.clone().setY(0).project(this.stage.cam.camera);
      this.mouse.x = (pt.x * 0.5 + 0.5) * innerWidth;
      this.mouse.y = (-pt.y * 0.5 + 0.5) * innerHeight;
    }
    this.refreshPowerAim();
  }

  private refreshPowerAim(): void {
    document.querySelectorAll<HTMLElement>('[data-power]').forEach((b) => b.classList.toggle('aim', b.dataset.power === this.aiming));
    if (this.reticle) this.reticle.visible = !!this.aiming;
    const tip = this.hudRefs.ctip;
    if (tip && this.coarse && !this.possessed) {
      tip.classList.toggle('none', !this.aiming);
      tip.textContent = 'Tap the ground to strike. Tap the power again to cancel.';
    }
  }

  private ensureReticle(): void {
    if (this.reticle) return;
    const geo = new THREE.RingGeometry(0.92, 1, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 4, 6), transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
    this.reticle = new THREE.Mesh(geo, mat);
    this.reticle.renderOrder = 30;
    this.reticle.visible = false;
    this.stage.scene.add(this.reticle);
  }

  private selectUnit(u: Unit | null): void {
    this.selectedUnit = u;
    this.lastCard = '';
    if (!u) {
      this.hudRefs.unit?.classList.add('none');
      if (this.stage.cam.mode === 'follow') {
        this.stage.cam.mode = 'orbit';
        this.stage.cam.followPos = null;
      }
    }
  }

  private toggleFollow(): void {
    if (this.possessed) return;
    const { cam } = this.stage;
    if (cam.mode === 'follow') {
      cam.mode = 'orbit';
      cam.followPos = null;
      cam.autoDirect = true;
    } else if (this.selectedUnit) {
      cam.mode = 'follow';
      cam.followPos = new THREE.Vector3();
      cam.set(cam.azimuth, 0.3, Math.max(14, 11 + this.selectedUnit.radius * 5));
    }
    this.lastCard = '';
  }

  private togglePossess(): void {
    const { cam } = this.stage;
    if (this.possessed) {
      this.possessed.ctrl = null;
      this.possessed = null;
      cam.mode = 'orbit';
      cam.followPos = null;
      cam.autoDirect = true;
      this.hudRefs.ctip?.classList.add('none');
      this.lastCard = '';
      this.showTouchControls(false);
      return;
    }
    const u = this.selectedUnit;
    if (!u || u.team !== 0 || u.dead) return;
    u.ctrl = { mx: 0, mz: 0, attack: false, ability: false };
    this.possessed = u;
    cam.mode = 'chase';
    cam.followPos = new THREE.Vector3(u.x, u.y, u.z);
    cam.chaseHeading = u.heading;
    cam.chaseHeight = (this.view?.rigOf(u.id)?.height ?? 1) * u.scale;
    cam.camera.position.set(u.x, 6, u.z + 12);
    const tip = this.hudRefs.ctip;
    tip.classList.remove('none');
    if (this.coarse) tip.classList.add('none');
    else tip.innerHTML = '<b>WASD</b> move · <b>Click / Space</b> attack · <b>E</b> ability · <b>G</b> release';
    this.showTouchControls(true);
    this.lastCard = '';
  }

  private openPause(): void {
    if (!this.view || document.querySelector('.modal-wrap') || this.view.battle.over) return;
    this.view.paused = true;
    const m = h(`
      <div class="modal-wrap pause-modal">
        <div class="modal">
          <h2>Paused</h2>
          <p>Retreating ends the battle with no XP or gold.</p>
          <div class="acts">
            <button class="btn sm danger" data-m="quit">Retreat</button>
            <button class="btn sm" data-m="resume">Resume</button>
          </div>
        </div>
      </div>`);
    this.ui.appendChild(m);
    m.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m;
      if (a === 'resume') {
        audio.ui();
        this.closePause();
      }
      if (a === 'quit') {
        audio.ui();
        void this.fade(() => (this.sandbox ? this.enterSandbox() : this.enterHub()));
      }
    });
  }

  private closePause(): void {
    this.ui.querySelector('.pause-modal')?.remove();
    if (this.view) this.view.paused = false;
  }

  private updateBattle(dt: number): void {
    const v = this.view;
    if (!v) return;
    const { cam } = this.stage;

    // Possessed input before the sim steps.
    if (this.possessed) {
      const u = this.possessed;
      if (u.dead || v.battle.over) {
        this.togglePossess();
      } else {
        // WASD relative to the chase camera's heading.
        let fw = 0; let st = 0;
        if (this.keys.has('w') || this.keys.has('arrowup')) fw += 1;
        if (this.keys.has('s') || this.keys.has('arrowdown')) fw -= 1;
        if (this.keys.has('a') || this.keys.has('arrowleft')) st += 1;
        if (this.keys.has('d') || this.keys.has('arrowright')) st -= 1;
        fw -= this.stick.y;
        st -= this.stick.x;
        const h0 = cam.chaseHeading;
        const c = u.ctrl!;
        c.mx = Math.sin(h0) * fw + Math.cos(h0) * st;
        c.mz = Math.cos(h0) * fw - Math.sin(h0) * st;
        c.attack = this.keys.has(' ') || this.keys.has('mouse0') || this.keys.has('btn-attack');
        c.ability = this.keys.has('e');
        if (Math.abs(st) > 0 || fw !== 0) {
          const target = Math.atan2(c.mx, c.mz);
          let d = target - cam.chaseHeading;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (fw >= 0) cam.chaseHeading += d * Math.min(1, dt * 1.6);
        }
      }
    }

    v.update(dt);

    // Camera.
    if (this.possessed || cam.mode === 'follow') {
      const u = this.possessed ?? this.selectedUnit;
      if (u && !u.dead && cam.followPos) {
        cam.followPos.set(u.x, u.y + 1 * u.scale, u.z);
      } else if (cam.mode === 'follow') {
        cam.mode = 'orbit';
        cam.followPos = null;
        cam.autoDirect = true;
      }
    }
    if (!this.possessed) {
      const pan = dt * 26;
      let px = 0; let pz = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) px -= pan;
      if (this.keys.has('d') || this.keys.has('arrowright')) px += pan;
      if (this.keys.has('w') || this.keys.has('arrowup')) pz -= pan;
      if (this.keys.has('s') || this.keys.has('arrowdown')) pz += pan;
      if (px || pz) {
        cam.panBy(px, pz);
        if (cam.mode === 'follow') { cam.mode = 'orbit'; cam.followPos = null; }
      }
    }
    const { spread } = v.actionPoint(this.actionPt);
    cam.update(dt, this.actionPt, spread);

    if (this.aiming && this.reticle) {
      this.reticleTime += dt;
      const pt = new THREE.Vector3();
      if (this.groundPoint(this.mouse.x, this.mouse.y, pt)) {
        const r = this.aiming === 'meteor' ? 8 : 13;
        this.reticle.position.set(pt.x, 0.2, pt.z);
        this.reticle.scale.setScalar(r * (1 + 0.02 * Math.sin(this.reticleTime * 7)));
      }
    }

    if (this.mode === 'battle') {
      this.updateHud();
      if (v.battle.over && v.finishT >= 0) {
        v.finishT += dt;
        if (!this.finished && v.finishT > 2.4) {
          this.finished = true;
          this.finishBattle();
        }
      } else if (v.battle.over && v.finishT < 0) {
        // A timeout end has no final kill moment: roll straight to results.
        v.finishT = 0;
      }
    }
  }

  private updateHud(): void {
    const v = this.view;
    const r = this.hudRefs;
    if (!v || !r.barA) return;
    const b = v.battle;
    r.barA.style.width = `${b.teamHealth(0) * 100}%`;
    r.barB.style.width = `${b.teamHealth(1) * 100}%`;
    r.cntA.textContent = String(b.alive(0).length);
    r.cntB.textContent = String(b.alive(1).length);
    const t = Math.floor(b.time);
    r.clock.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    r.spirit.style.width = `${b.spirit}%`;
    if (r.boss && this.bossUnit) r.boss.style.width = `${(this.bossUnit.hp / this.bossUnit.maxHp) * 100}%`;
    for (const btn of this.powerButtons) {
      const ok = b.canCast(btn.dataset.power as PowerId);
      if (btn.disabled === ok) {
        btn.disabled = !ok;
        btn.classList.toggle('ready', ok);
      }
    }
    // Selected unit panel.
    const u = this.selectedUnit;
    if (u && u.dead && !this.possessed) this.selectUnit(null);
    if (u && !u.dead) {
      const card = r.unit;
      const follow = this.stage.cam.mode === 'follow';
      const key = `${u.id}:${follow}:${!!this.possessed}`;
      if (key !== this.lastCard) {
        this.lastCard = key;
        const canCtl = u.team === 0;
        card.classList.remove('none');
        card.innerHTML = `
          ${portraitImg(u.sp.id, u.evo)}
          <div>
            <h3>${u.sp.name}</h3>
            <small>Lv ${u.level} ${EVOLUTIONS[u.evo].name}${u.boss ? ' · Boss' : ''}</small>
            <div class="hpline"><i id="sel-hp" style="background:${TEAM_COLOR[u.team]}"></i></div>
            <small id="sel-hp-txt"></small>
          </div>
          <div class="unit-actions">
            ${this.possessed ? '' : `<button class="btn sm alt" data-h="follow">${follow ? 'Free cam' : 'Follow'}${this.coarse ? '' : ' (F)'}</button>`}
            ${canCtl ? `<button class="btn sm" data-h="possess">${this.possessed ? 'Release' : 'Control'}${this.coarse ? '' : ' (G)'}</button>` : ''}
          </div>`;
      }
      const hpEl = card.querySelector<HTMLElement>('#sel-hp');
      const txt = card.querySelector<HTMLElement>('#sel-hp-txt');
      if (hpEl) hpEl.style.width = `${(u.hp / u.maxHp) * 100}%`;
      if (txt) txt.textContent = `${fmt(u.hp)} / ${fmt(u.maxHp)} HP · ${u.kills} KOs`;
    }
  }

  // ── Results ─────────────────────────────────────────────
  private finishBattle(): void {
    const v = this.view!;
    const b = v.battle;
    const won = b.winner === 0;
    this.mode = 'results';
    v.paused = false;
    this.selectedUnit = null;
    this.aiming = null;
    if (this.reticle) this.reticle.visible = false;
    if (this.possessed) this.togglePossess();
    audio.setMusic('none');
    const { cam } = this.stage;
    cam.mode = 'orbit';
    cam.autoDirect = true;
    cam.driftSpeed = 0.09;
    this.setViewShift(-0.14);

    let rewards: BattleRewards | null = null;
    if (!this.sandbox && this.currentStage) {
      rewards = applyBattleResult(this.profile, {
        stage: this.currentStage,
        stageIndex: this.currentStage.index,
        won,
        entries: b.units.filter((u) => u.team === 0 && u.uid).map((u) => ({ uid: u.uid!, kills: u.kills, damage: u.damage, survived: !u.dead || u.action === 'ash' })),
      });
      saveProfile(this.profile);
    }
    if (won) audio.victory(); else audio.defeat();
    if (!won) this.stage.post.setDesat(0.5);
    this.renderResults(won, rewards);
  }

  private renderResults(won: boolean, rewards: BattleRewards | null): void {
    this.clearUi();
    const stage = this.currentStage;
    const nextStage = stage && stage.index + 1 < STAGES.length ? STAGES[stage.index + 1] : null;
    const canNext = won && nextStage && !this.sandbox;
    const newTask = won && rewards?.firstClear && stage && RARE_TASKS.some((t) => t.afterStage === stage.index);
    const sub = this.sandbox
      ? 'Sandbox battles pay no XP or gold.'
      : newTask ? 'A new rare beast task is open! See the Rare tab at camp.'
      : won
        ? rewards?.firstClear ? 'First clear bonus earned.' : 'Your herd grows stronger.'
        : 'Your herd still learned something. Train them, recruit, and try again.';
    const rows = (rewards?.beasts ?? []).map((r) => {
      const sp = getSpecies(r.speciesId);
      return `<div class="xp-row ${r.survived ? '' : 'fallen'}" data-row="${r.uid}">
        <img class="portrait" src="${portrait(r.speciesId, evoStage(r.levelBefore))}" alt="" />
        <div>
          <div class="nm">${sp.name}${r.mvp ? '<span class="tag mvp">MVP</span>' : ''}${r.survived ? '' : '<span class="tag fall">FELL</span>'}</div>
          <div class="xpbar"><i data-bar style="width:${(r.xpBefore / Math.max(1, xpToNext(r.levelBefore))) * 100}%"></i></div>
          <div class="gain">+<span data-gain>0</span> XP${r.kills ? ` · ${r.kills} KO${r.kills > 1 ? 's' : ''}` : ''}${r.goldEarned ? ` · <span style="color:var(--gold)">+${fmt(r.goldEarned)} gold</span>` : ''}</div>
        </div>
        <div class="lvl" data-lvl>${r.levelBefore}</div>
      </div>`;
    }).join('');
    const el = h(`
      <div class="results">
        <div class="results-hero">
          <div class="results-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</div>
          ${rewards && won ? `<div class="big-stars">${[0, 1, 2].map((i) => `<span data-star="${i}">★</span>`).join('')}</div>` : ''}
          <div class="results-sub">${sub}</div>
        </div>
        <div class="results-panel">
          ${rewards ? `
            <div class="gold-earn panel">
              <div><span class="label">Gold earned</span><small>${rewards.bonusGold ? `Includes ${fmt(rewards.bonusGold)} bounty from knockouts` : '&nbsp;'}</small></div>
              <span class="num"><span class="coin"></span><span id="gold-count">0</span></span>
            </div>
            <div class="xp-list scroll">${rows}</div>` : '<div style="flex:1"></div>'}
          <div class="results-actions">
            ${this.sandbox ? `<button class="btn" data-r="sandbox">New Battle</button>` : ''}
            ${canNext ? `<button class="btn" data-r="next">Next: ${nextStage!.name}</button>` : ''}
            ${!this.sandbox ? `<button class="btn ${canNext ? 'alt' : ''}" data-r="replay">${won ? 'Replay' : 'Try Again'}</button>` : ''}
            <button class="btn alt" data-r="camp">${this.sandbox ? 'Title' : 'Camp'}</button>
          </div>
        </div>
      </div>`);
    this.ui.appendChild(el);
    el.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
      if (!a) return;
      audio.ui();
      if (a === 'next' && nextStage) {
        this.selectedStage = nextStage.index;
        void this.fade(() => this.enterDeploy(nextStage));
      }
      if (a === 'replay' && stage) void this.fade(() => this.enterDeploy(stage));
      if (a === 'camp') void this.fade(() => (this.sandbox ? this.enterTitle() : this.enterHub()));
      if (a === 'sandbox') void this.fade(() => this.enterSandbox());
    });
    if (rewards) this.playRewards(el, rewards);
  }

  /** Paces the payoff: stars, gold counting up, then each beast's XP bar with level-ups in the world. */
  private playRewards(el: HTMLElement, r: BattleRewards): void {
    const later = (ms: number, fn: () => void) => this.resultTimers.push(window.setTimeout(fn, ms));
    for (let i = 0; i < r.stars; i++) {
      later(450 + i * 300, () => {
        el.querySelector(`[data-star="${i}"]`)?.classList.add('lit');
        audio.coin();
      });
    }
    const goldEl = el.querySelector<HTMLElement>('#gold-count');
    const goldStart = 900 + r.stars * 300;
    later(goldStart, () => this.countUp(goldEl, r.gold, 900, () => audio.coin()));
    if (r.won) later(goldStart, () => this.celebrateAll(r));

    let at = goldStart + 500;
    r.beasts.forEach((b) => {
      const row = el.querySelector<HTMLElement>(`[data-row="${b.uid}"]`);
      if (!row) return;
      const dur = 760 + Math.min(600, b.levelsGained * 280);
      later(at, () => this.animateXp(row, b, dur));
      at += 260;
    });
    if (r.rares.length) later(at + 900, () => this.revealRares([...r.rares]));
  }

  /** The big moment: one card at a time for each rare beast this battle earned. */
  private revealRares(queue: string[]): void {
    const id = queue.shift();
    if (!id || this.mode !== 'results') return;
    const sp = getSpecies(id);
    audio.rareReveal();
    this.stage.post.flashScreen(0.3, '#ffe9a8');
    this.stage.cam.shake(0.3);
    const { x, z } = this.stage.cam.target;
    this.stage.fx.levelUpBurst(x, z, 3, true);
    this.stage.fx.coinBurst(x, 2, z, 60);
    const m = h(`
      <div class="modal-wrap rare-reveal">
        <div class="modal">
          <div class="rare-rays"></div>
          <span class="evo-pill" style="color:var(--gold)">★ Rare beast earned!</span>
          <div class="rare-portrait">${portraitImg(id, 1, sp.name)}</div>
          <h2>${sp.name}</h2>
          <p class="ep">${sp.epithet}</p>
          <div class="ability-box"><b>${sp.abilityName}</b><span>${sp.abilityDesc}</span></div>
          <button class="btn lg" data-ok>Awesome!</button>
        </div>
      </div>`);
    this.ui.appendChild(m);
    qs(m, '[data-ok]').addEventListener('click', () => {
      audio.ui();
      m.remove();
      this.revealRares(queue);
    });
  }

  private celebrateAll(r: BattleRewards): void {
    r.beasts.forEach((b, i) => {
      if (!b.survived) return;
      this.resultTimers.push(window.setTimeout(() => this.view?.celebrate(b.uid, false, false), i * 90));
    });
  }

  private countUp(target: HTMLElement | null, value: number, dur: number, tick: () => void): void {
    if (!target) return;
    const start = performance.now();
    let lastTick = 0;
    const gen = this.screenGen;
    const step = (now: number) => {
      if (gen !== this.screenGen) return;
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - k) * (1 - k);
      target.textContent = fmt(value * e);
      if (now - lastTick > 70 && k < 1) { lastTick = now; tick(); }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private animateXp(row: HTMLElement, b: BattleRewards['beasts'][number], dur: number): void {
    const bar = row.querySelector<HTMLElement>('[data-bar]');
    const gain = row.querySelector<HTMLElement>('[data-gain]');
    const lvlEl = row.querySelector<HTMLElement>('[data-lvl]');
    const img = row.querySelector<HTMLImageElement>('img');
    if (!bar || !gain || !lvlEl) return;
    // Express progress as a continuous number across level boundaries.
    const total = b.xpGained;
    let shownLevel = b.levelBefore;
    const start = performance.now();
    const gen = this.screenGen;
    const step = (now: number) => {
      if (gen !== this.screenGen) return;
      const k = Math.min(1, (now - start) / dur);
      const e = k * (2 - k);
      let remaining = total * e + b.xpBefore;
      let lv = b.levelBefore;
      while (lv < MAX_LEVEL && remaining >= xpToNext(lv)) {
        remaining -= xpToNext(lv);
        lv++;
      }
      const need = xpToNext(lv);
      bar.style.width = `${need ? Math.min(100, (remaining / need) * 100) : 100}%`;
      gain.textContent = fmt(total * e);
      audio.xpTick(need ? remaining / need : 1);
      if (lv !== shownLevel) {
        // Compared with the level last shown, because one slow frame can skip several levels.
        const evolvedNow = evoStage(lv) > evoStage(shownLevel);
        shownLevel = lv;
        lvlEl.textContent = String(lv);
        row.classList.add(evolvedNow ? 'evolving' : 'leveling');
        const nm = row.querySelector('.nm');
        if (nm) {
          // An evolution outranks a plain level-up tag from earlier in the same animation.
          if (evolvedNow) {
            nm.querySelector('.tag.up')?.remove();
            nm.querySelector('.tag.ev')?.remove();
            nm.insertAdjacentHTML('beforeend', `<span class="tag ev">${EVOLUTIONS[evoStage(lv)].name.toUpperCase()}!</span>`);
          } else if (!nm.querySelector('.tag.up,.tag.ev')) {
            nm.insertAdjacentHTML('beforeend', '<span class="tag up">LEVEL UP</span>');
          }
        }
        if (evolvedNow) {
          if (img) img.src = portrait(b.speciesId, evoStage(lv));
          audio.evolve();
        } else {
          audio.levelUp();
        }
        this.view?.celebrate(b.uid, true, evolvedNow);
      }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Input ───────────────────────────────────────────────
  private bindInput(): void {
    const c = this.canvas;
    // iOS only unlocks sound at the end of a tap, so listen for all of these.
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) {
      addEventListener(ev, () => audio.unlock(), { passive: true });
    }
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2 && !this.dragging) {
          // A second finger turns the gesture into pinch-zoom and pan.
          this.ptrDrag = null;
          this.pinch = this.pinchState();
          return;
        }
        if (this.touches.size > 1) return;
      }
      this.ptrDrag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      if (this.mode === 'deploy' && e.button === 0) {
        const p = this.placedAt(e.clientX, e.clientY);
        if (p) {
          this.dragging = { kind: 'move', p };
          this.dragMoved = false;
          this.dragStart = { x: e.clientX, y: e.clientY };
          this.ptrDrag = null;
        }
      }
      if (this.mode === 'battle' && this.possessed && e.button === 0) {
        this.keys.add('mouse0');
        this.mouse0Pointer = e.pointerId;
      }
    });

    addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) {
        const next = this.pinchState();
        if (next) {
          const { cam } = this.stage;
          cam.zoomBy((this.pinch.d - next.d) * 4);
          const k = cam.distance * 0.0016;
          cam.panBy(-(next.x - this.pinch.x) * k, -(next.y - this.pinch.y) * k);
          this.pinch = next;
        }
        return;
      }
      // Touches on buttons and sliders must not move the aiming point.
      if (e.pointerType !== 'touch' || this.touches.has(e.pointerId)) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      }
      if (this.dragging) { this.onDragMove(e); return; }
      if (this.ptrDrag && this.touches.size <= 1) {
        const dx = e.clientX - this.ptrDrag.x;
        const dy = e.clientY - this.ptrDrag.y;
        if (Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'touch' ? 10 : 4)) this.ptrDrag.moved = true;
        if (this.ptrDrag.moved && ['battle', 'deploy', 'results', 'title', 'hub'].includes(this.mode) && !this.possessed) {
          this.stage.cam.rotateBy(dx, dy);
          this.ptrDrag.x = e.clientX;
          this.ptrDrag.y = e.clientY;
        }
      }
    });

    addEventListener('pointercancel', (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      // Only the finger that started the attack can end it, not one lifted from the joystick.
      if (e.pointerId === this.mouse0Pointer) this.keys.delete('mouse0');
      this.ptrDrag = null;
      // A sideways swipe on the tray hands the gesture to the browser as a scroll.
      this.cancelDrag();
    });

    addEventListener('pointerup', (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      // Only the finger that started the attack can end it, not one lifted from the joystick.
      if (e.pointerId === this.mouse0Pointer) this.keys.delete('mouse0');
      if (this.dragging) { this.onDragEnd(e); return; }
      const drag = this.ptrDrag;
      this.ptrDrag = null;
      if (!drag || drag.moved) return;
      if ((e.target as HTMLElement) !== c) return;
      if (this.mode === 'deploy' && e.button === 2) {
        const p = this.placedAt(e.clientX, e.clientY);
        if (p) {
          this.dropPlaced(p);
          audio.ui();
          this.refreshDeployUi();
        }
      }
      if (this.mode === 'battle' && e.button === 0 && !this.possessed) {
        if (this.aiming && this.view) {
          const pt = new THREE.Vector3();
          if (this.groundPoint(e.clientX, e.clientY, pt)) {
            this.view.battle.castPower(this.aiming, pt.x, pt.z);
            this.aiming = null;
            this.refreshPowerAim();
          }
          return;
        }
        const u = this.view?.pick(e.clientX, e.clientY) ?? null;
        if (u) audio.ui();
        this.selectUnit(u);
      }
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.stage.cam.zoomBy(e.deltaY);
    }, { passive: false });

    addEventListener('keydown', (e) => {
      // Browser shortcuts aren't game input. macOS also never sends keyup for keys pressed with Cmd held.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (this.mode !== 'battle') return;
      if (k === ' ' || k === 'tab') e.preventDefault();
      // One press, one action: holding a key must not flicker toggles or burn spirit.
      if (e.repeat) return;
      const paused = !!this.ui.querySelector('.pause-modal');
      if (paused) {
        if (k === 'escape' || k === ' ') this.closePause();
        return;
      }
      if (k === ' ' && !this.possessed) this.openPause();
      if (k === 'escape') {
        if (this.aiming) { this.aiming = null; this.refreshPowerAim(); }
        else if (this.possessed) this.togglePossess();
        else this.openPause();
      }
      if (k === '1') this.tryPowerKey('rally');
      if (k === '2') this.tryPowerKey('meteor');
      if (k === '3') this.tryPowerKey('storm');
      if (k === 'f') this.toggleFollow();
      if (k === 'g') this.togglePossess();
      if (k === 'tab') this.cycleUnit();
      if (k === '=' || k === '+') this.setSpeed(this.speedIdx + 1);
      if (k === '-') this.setSpeed(this.speedIdx - 1);
    });
    addEventListener('keyup', (e) => {
      if (e.key === 'Meta') this.keys.clear();
      this.keys.delete(e.key.toLowerCase());
    });
    addEventListener('blur', () => this.keys.clear());
  }

  /** Finger separation and midpoint, or null unless exactly two fingers are down. */
  private pinchState(): { d: number; x: number; y: number } | null {
    if (this.touches.size !== 2) return null;
    const [a, b] = [...this.touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private tryPowerKey(id: PowerId): void {
    const b = document.querySelector<HTMLButtonElement>(`[data-power="${id}"]`);
    if (b && !b.dataset.locked) this.usePower(id);
  }

  private cycleUnit(): void {
    const v = this.view;
    if (!v) return;
    const list = v.battle.alive(0);
    if (!list.length) return;
    const i = this.selectedUnit ? list.indexOf(this.selectedUnit) : -1;
    this.selectUnit(list[(i + 1) % list.length]);
  }

  private onDragMove(e: PointerEvent): void {
    // A finger always wobbles a little: under this distance it's still a tap.
    if (!this.dragMoved && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 10) return;
    this.dragMoved = true;
    const d = this.dragging;
    if (!d || d.kind === 'recall') return;
    if (this.ghostEl && !this.ghost) this.ghostEl.style.display = '';
    this.moveGhost(e.clientX, e.clientY);
    const pt = new THREE.Vector3();
    const trayTop = document.querySelector('.deploy-bottom')?.getBoundingClientRect().top ?? innerHeight;
    const onField = e.clientY < trayTop;
    if (!this.groundPoint(e.clientX, e.clientY, pt)) return;
    if (d.kind === 'move') {
      const [x, z] = this.clampPlacement(pt.x, pt.z, d.p.team);
      d.p.x = x;
      d.p.z = z;
      this.positionPlaced(d.p);
      return;
    }
    // New placement: show a live 3D ghost once over the field.
    const team: 0 | 1 = this.sandbox ? this.sandboxTeam : 0;
    if (onField) {
      if (!this.ghost) {
        this.ghost = this.makeGhost(d.speciesId, d.level, team, d.uid);
        if (this.ghostEl) this.ghostEl.style.display = 'none';
      }
      const [x, z] = this.clampPlacement(pt.x, pt.z, team);
      this.ghost.x = x;
      this.ghost.z = z;
      this.positionPlaced(this.ghost);
    } else if (this.ghost) {
      this.removePlaced(this.ghost);
      this.ghost = null;
      if (this.ghostEl) this.ghostEl.style.display = '';
    }
  }

  private makeGhost(speciesId: string, level: number, team: 0 | 1, uid?: string): Placed {
    const before = this.placed.length;
    const p = this.place({ team, speciesId, level, x: 0, z: team === 0 ? 10 : -10, uid });
    this.placed.length = before;
    return p;
  }

  private cancelDrag(): void {
    this.dragging = null;
    this.ghostEl?.remove();
    this.ghostEl = null;
    if (this.ghost) {
      this.removePlaced(this.ghost);
      this.ghost = null;
    }
  }

  private onDragEnd(e: PointerEvent): void {
    const d = this.dragging;
    this.dragging = null;
    this.ghostEl?.remove();
    this.ghostEl = null;
    if (!d) return;
    if (d.kind === 'recall') {
      if (!this.dragMoved) {
        this.dropPlaced(d.p);
        audio.ui();
        this.refreshDeployUi();
      }
      return;
    }
    if (d.kind === 'move') {
      if (this.dragMoved) {
        audio.place();
        this.stage.fx.dust(d.p.x, d.p.z, 8, 1, 1, 0.7);
      } else if (e.pointerType === 'touch') {
        // Phones have no right-click, so tapping a placed beast removes it.
        this.dropPlaced(d.p);
        audio.ui();
        this.refreshDeployUi();
      }
      return;
    }
    if (!this.dragMoved) {
      this.tapPlace(d);
      return;
    }
    if (this.ghost) {
      const g = this.ghost;
      this.ghost = null;
      const sp = getSpecies(g.speciesId);
      if (!this.sandbox && this.usedCp() + sp.cp > commandCap(this.profile)) {
        this.removePlaced(g);
        audio.uiDeny();
        this.flashCp();
        return;
      }
      this.placed.push(g);
      audio.place();
      this.stage.fx.dust(g.x, g.z, 12, 1.2, 1.1, 0.8);
      this.stage.fx.ring(g.x, g.z, 2 + sp.radius, TEAM_COLOR[g.team], 0.4, 0.2, 0.14, 2.6);
      this.refreshDeployUi();
    }
  }

  private flashCp(): void {
    const el = document.getElementById('cp-val');
    if (!el) return;
    el.classList.add('over');
    setTimeout(() => this.refreshDeployUi(), 500);
  }

  /** Lets tooling or tests jump straight into a stage. */
  debugStart(stageIndex: number): void {
    this.enterDeploy(STAGES[stageIndex]);
  }
}
