// A cartoon toy box of sound, for kids: bonks, boings, slide whistles, silly animal voices and bouncy
// marimba tunes. Everything is synthesised at runtime, so there are no sound files to download or license.
import type { Group } from './sim/species';
import type { HitKind } from './sim/battle';

type Bus = 'sfx' | 'music';

interface ToneOpts {
  freq: number; freqEnd?: number; dur: number; gain: number; type?: OscillatorType; delay?: number; attack?: number;
  bus?: Bus; detune?: number; wet?: number; vibRate?: number; vibDepth?: number; priority?: boolean; filter?: number;
  /** How much of the length to stay at full volume. Plucks leave this at 0; whistles and horns hold. */
  hold?: number;
}
interface NoiseOpts {
  dur: number; gain: number; freq: number; freqEnd?: number; q?: number; type?: BiquadFilterType; delay?: number; attack?: number; bus?: Bus; wet?: number;
}
interface VowelOpts {
  pitch: number; pitchEnd?: number; dur: number; f1: number; f2: number; f1End?: number; f2End?: number; gain: number;
  delay?: number; vibRate?: number; vibDepth?: number; type?: OscillatorType; wet?: number; attack?: number;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C5' to a MIDI note number. */
const note = (s: string) => NOTE[s[0]] + (Number(s[1]) + 1) * 12;
/** One bar of eighth notes per string, with '.' for rests. */
const bars = (...lines: string[]) => lines.map((l) => l.split(' ').map((x) => (x === '.' ? 0 : note(x))));

// Original melodies. Each row is one bar of eight steps.
const MENU_TUNE = bars(
  'E5 . G5 . A5 G5 E5 .', 'C5 . E5 . D5 C5 A4 .', 'F5 . A5 . G5 F5 D5 .', 'G5 F5 E5 D5 G5 . . .',
  'E5 G5 C6 . G5 E5 . C5', 'F5 A5 C6 . A5 F5 . .', 'G5 . B5 . D6 C6 B5 G5', 'C6 . G5 . C6 . . .',
);
const MENU_CHORDS = ['C', 'Am', 'F', 'G', 'C', 'F', 'G', 'C'];
const BATTLE_TUNE = bars(
  'A4 C5 E5 . E5 D5 C5 .', 'F4 A4 C5 . C5 A4 G4 .', 'G4 C5 E5 . G5 E5 C5 .', 'D5 . B4 . G4 B4 D5 G5',
  'A5 . G5 E5 . C5 D5 E5', 'F5 E5 C5 . A4 C5 F5 .', 'E5 G5 C6 . B5 G5 E5 .', 'D5 E5 F5 G5 A5 . . .',
);
const BATTLE_CHORDS = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
const CHORD: Record<string, number[]> = {
  C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62],
};
const PENTATONIC = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88];

type VoiceName =
  | 'moo' | 'baa' | 'neigh' | 'oink' | 'trumpet' | 'rawr' | 'woof' | 'mew' | 'hoo' | 'giggle' | 'dino' | 'chirp' | 'chitter' | 'buzz'
  | 'twinkle' | 'tweet' | 'hoot' | 'honk' | 'hiss' | 'rattle' | 'blub' | 'arf' | 'squeak' | 'magicRoar' | 'whale';

const VOICES: Record<string, VoiceName> = {
  bull: 'moo', bison: 'moo', hippo: 'moo', goat: 'baa', ram: 'baa', llama: 'baa', deer: 'baa', stag: 'baa', camel: 'moo', moose: 'moo',
  horse: 'neigh', zebra: 'neigh', unicorn: 'neigh', pig: 'oink', boar: 'oink', elephant: 'trumpet', mammoth: 'trumpet', parasaur: 'trumpet',
  lion: 'rawr', tiger: 'rawr', bear: 'rawr', polarbear: 'rawr', panda: 'rawr', jaguar: 'rawr', panther: 'rawr', leopard: 'rawr', sabertooth: 'rawr',
  wolf: 'woof', dog: 'woof', fox: 'woof', hyena: 'giggle', lynx: 'mew', cheetah: 'mew', badger: 'squeak',
  gorilla: 'hoo', chimp: 'hoo', orangutan: 'hoo', kangaroo: 'squeak', rabbit: 'squeak', armadillo: 'squeak', porcupine: 'squeak', skunk: 'squeak', rhino: 'moo',
  compy: 'chirp', microraptor: 'chirp', velociraptor: 'chirp', gallimimus: 'chirp', protoceratops: 'chirp', pachy: 'chirp',
  bee: 'buzz', wasp: 'buzz', dragonfly: 'buzz', firefly: 'twinkle', butterfly: 'twinkle',
  owl: 'hoot', penguin: 'honk', flamingo: 'honk', ostrich: 'honk', rattlesnake: 'rattle', seal: 'arf', walrus: 'arf',
  dragon: 'magicRoar', wyrm: 'magicRoar', phoenix: 'magicRoar', roc: 'tweet',
  chameleon: 'squeak', jackalope: 'squeak', scarab: 'chitter', queenant: 'chitter', stormraptor: 'chirp', narwhal: 'blub',
  ghosttiger: 'rawr', aurorafox: 'twinkle', sunfirerex: 'dino', starwhale: 'whale',
};
const GROUP_VOICES: Record<Group, VoiceName> = {
  Dinosaurs: 'dino', Bugs: 'chitter', Predators: 'rawr', Herd: 'moo', Reptiles: 'hiss', Birds: 'tweet', Sea: 'blub', Mythic: 'magicRoar', Rare: 'magicRoar',
};

class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private wetBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;
  musicOff = false;
  private lastPlayed = new Map<string, number>();
  private active = 0;
  private musicTimer: number | null = null;
  private musicStepN = 0;
  private musicNext = 0;
  private musicMode: 'none' | 'menu' | 'battle' = 'none';
  private intensity = 0.3;

  /** Browsers only allow audio after a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      const c = this.ctx as AudioContext;
      if (c.state !== 'running' && !document.hidden && c.resume) void c.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.attach(new Ctor());
    if (this.musicMode !== 'none') this.startScheduler();
  }

  /** Builds the mixer on any audio context. A test can pass an offline one and measure the result. */
  attach(c: BaseAudioContext): void {
    this.ctx = c;
    this.active = 0;
    this.lastPlayed.clear();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.85;
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicOff ? 0 : 0.42;
    this.wetBus = c.createGain();
    this.wetBus.gain.value = 0.28;
    // A short, bright room makes everything sound like toys in a playroom rather than dry beeps.
    const rev = c.createConvolver();
    const irLen = Math.floor(c.sampleRate * 0.7);
    const ir = c.createBuffer(2, irLen, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    rev.buffer = ir;
    this.sfxBus.connect(comp);
    this.musicBus.connect(comp);
    this.wetBus.connect(rev);
    rev.connect(comp);
    comp.connect(this.master);
    // Last stage: a soft limiter rounds off any peak, so nothing crackles on small phone speakers.
    const limiter = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.15) * 0.94;
    }
    limiter.curve = curve;
    limiter.oversample = '2x';
    this.master.connect(limiter);
    limiter.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setMusicOff(off: boolean): void {
    this.musicOff = off;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(off ? 0 : 0.42, this.ctx.currentTime, 0.05);
  }

  /** Silences everything while the page is in the background. */
  setSuspended(hidden: boolean): void {
    const c = this.ctx as AudioContext | null;
    if (!c?.suspend) return;
    if (hidden) void c.suspend();
    else void c.resume();
  }

  setIntensity(v: number): void { this.intensity = v; }

  // ── Building blocks ─────────────────────────────────────
  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -1e9) < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  /** Big brawls could stack hundreds of sounds, turning into mud and straining phones. */
  private full(priority?: boolean): boolean {
    return !priority && this.active > 46;
  }

  private tone(o: ToneOpts): void {
    const c = this.ctx;
    if (!c || this.full(o.priority || o.bus === 'music')) return;
    const t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.freqEnd), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const end = t + o.dur + 0.03;
    if (o.vibRate) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vibRate;
      const depth = c.createGain();
      depth.gain.value = o.vibDepth ?? o.freq * 0.03;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const attack = o.attack ?? 0.006;
    g.gain.exponentialRampToValueAtTime(o.gain, t + attack);
    if (o.hold) g.gain.setValueAtTime(o.gain, t + Math.max(attack, o.dur * o.hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let last: AudioNode = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      osc.connect(f);
      last = f;
    }
    last.connect(g);
    g.connect(o.bus === 'music' ? this.musicBus : this.sfxBus);
    if (o.wet) {
      const send = c.createGain();
      send.gain.value = o.wet;
      g.connect(send).connect(this.wetBus);
    }
    this.active++;
    osc.onended = () => { this.active--; };
    osc.start(t);
    osc.stop(end);
  }

  private noise(o: NoiseOpts): void {
    const c = this.ctx;
    if (!c || this.full(o.bus === 'music')) return;
    const t = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(o.bus === 'music' ? this.musicBus : this.sfxBus);
    if (o.wet) {
      const send = c.createGain();
      send.gain.value = o.wet;
      g.connect(send).connect(this.wetBus);
    }
    this.active++;
    src.onended = () => { this.active--; };
    src.start(t, Math.random());
    src.stop(t + o.dur + 0.03);
  }

  /** A mouth-shaped sound: a buzzy pitch through two moving resonances, which is what makes vowels. */
  private vowel(o: VowelOpts): void {
    const c = this.ctx;
    if (!c || this.full()) return;
    const t = c.currentTime + (o.delay ?? 0);
    const end = t + o.dur + 0.03;
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sawtooth';
    osc.frequency.setValueAtTime(o.pitch, t);
    if (o.pitchEnd) osc.frequency.exponentialRampToValueAtTime(o.pitchEnd, t + o.dur);
    if (o.vibRate) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vibRate;
      const dep = c.createGain();
      dep.gain.value = o.vibDepth ?? o.pitch * 0.05;
      lfo.connect(dep).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.03));
    out.gain.setValueAtTime(o.gain, t + o.dur * 0.65);
    out.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    for (const [from, to, level] of [[o.f1, o.f1End ?? o.f1, 1], [o.f2, o.f2End ?? o.f2, 0.6]] as const) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 5;
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(to, t + o.dur);
      const lv = c.createGain();
      lv.gain.value = level * 3;
      osc.connect(f).connect(lv).connect(out);
    }
    out.connect(this.sfxBus);
    if (o.wet) {
      const send = c.createGain();
      send.gain.value = o.wet;
      out.connect(send).connect(this.wetBus);
    }
    this.active++;
    osc.onended = () => { this.active--; };
    osc.start(t);
    osc.stop(end);
  }

  private mallet(freq: number, dur: number, gain: number, delay = 0, bus: Bus = 'sfx'): void {
    this.tone({ freq, dur, gain, delay, bus, wet: 0.35, priority: bus === 'music' });
    this.tone({ freq: freq * 4, dur: dur * 0.22, gain: gain * 0.28, delay, bus, priority: bus === 'music' });
  }

  private bell(freq: number, dur: number, gain: number, delay = 0): void {
    this.tone({ freq, dur, gain, delay, wet: 0.7 });
    this.tone({ freq: freq * 2.76, dur: dur * 0.5, gain: gain * 0.3, delay, wet: 0.7 });
  }

  // ── Hits ────────────────────────────────────────────────
  /** Different attacks make different silly noises: a chomp, a swish, a bonk, a splat. */
  hit(kind: HitKind, strength = 1, crit = false): void {
    if (!this.ctx || kind === 'dot' || !this.throttle('hit', 65)) return;
    const low = 1 / Math.max(0.6, strength);
    switch (kind) {
      case 'bite':
        this.tone({ freq: 420 * low, freqEnd: 170 * low, dur: 0.08, gain: 0.55, type: 'triangle', hold: 0.5 });
        this.tone({ freq: 320 * low, freqEnd: 130 * low, dur: 0.09, gain: 0.5, type: 'triangle', delay: 0.08, hold: 0.5 });
        break;
      case 'claw':
        this.noise({ dur: 0.12, gain: 0.8, freq: 2400, freqEnd: 6400, type: 'bandpass', q: 1.2, attack: 0.02 });
        this.tone({ freq: 1000 * low, freqEnd: 560, dur: 0.08, gain: 0.32, type: 'triangle', delay: 0.05, hold: 0.4 });
        break;
      case 'horn':
        this.tone({ freq: 640 * low, freqEnd: 500 * low, dur: 0.12, gain: 0.6, hold: 0.25 });
        this.tone({ freq: 1320 * low, dur: 0.06, gain: 0.2, hold: 0.3 });
        this.tone({ freq: 150, freqEnd: 75, dur: 0.12, gain: 0.45, type: 'triangle', hold: 0.3 });
        break;
      case 'venom':
        this.tone({ freq: 280, freqEnd: 950, dur: 0.12, gain: 0.45, hold: 0.5 });
        this.noise({ dur: 0.1, gain: 0.5, freq: 1300, type: 'bandpass', q: 1.5 });
        break;
      case 'fire':
        this.noise({ dur: 0.24, gain: 1.2, freq: 700, freqEnd: 2200, type: 'bandpass', attack: 0.03 });
        this.tone({ freq: 180, freqEnd: 90, dur: 0.14, gain: 0.2, type: 'triangle' });
        break;
      case 'ice':
        this.bell(2400 + Math.random() * 600, 0.24, 0.26);
        break;
      case 'shock':
        this.tone({ freq: 1300, freqEnd: 500, dur: 0.13, gain: 0.26, type: 'sawtooth', vibRate: 90, vibDepth: 500, hold: 0.7, filter: 4000 });
        break;
      case 'earth':
        this.tone({ freq: 170 * low, freqEnd: 60, dur: 0.18, gain: 0.7, type: 'triangle', hold: 0.3 });
        this.noise({ dur: 0.08, gain: 0.4, freq: 700 });
        break;
    }
    if (crit) {
      // BAM! A comic crash plus a spring.
      this.noise({ dur: 0.28, gain: 0.5, freq: 5200, type: 'highpass', wet: 0.5 });
      this.boing(260, 0.3, 0.32);
    }
  }

  private boing(freq: number, dur: number, gain: number, delay = 0): void {
    this.tone({ freq, freqEnd: freq * 1.45, dur, gain, delay, vibRate: 26, vibDepth: freq * 0.32, wet: 0.2, hold: 0.45 });
  }

  /** Slide whistle up: something just got sent flying. */
  launch(): void {
    if (!this.ctx || !this.throttle('launch', 300)) return;
    this.tone({ freq: 520, freqEnd: 2100, dur: 0.42, gain: 0.16, attack: 0.02, vibRate: 11, vibDepth: 22, wet: 0.45, hold: 0.8 });
  }

  /** Slide whistle down, a plop, and little stars circling. */
  knockout(size = 1): void {
    if (!this.ctx || !this.throttle('ko', 90)) return;
    const k = 1 / Math.pow(Math.max(0.5, size), 0.5);
    this.tone({ freq: 1600 * k, freqEnd: 240 * k, dur: 0.46, gain: 0.18, attack: 0.012, vibRate: 12, vibDepth: 28, wet: 0.45, priority: true, hold: 0.85 });
    this.tone({ freq: 190 * k, freqEnd: 70, dur: 0.17, gain: 0.5, type: 'triangle', delay: 0.42, priority: true, hold: 0.3 });
    this.bell(2093, 0.26, 0.1, 0.5);
    this.bell(2637, 0.26, 0.09, 0.6);
    this.bell(3136, 0.34, 0.08, 0.7);
  }

  bump(strength = 1): void {
    if (!this.ctx || !this.throttle('bump', 110)) return;
    this.tone({ freq: 520, freqEnd: 380, dur: 0.1, gain: 0.5 * strength, hold: 0.3 });
    this.tone({ freq: 1250, freqEnd: 1800, dur: 0.08, gain: 0.1, type: 'square', delay: 0.03, hold: 0.5, filter: 3000 });
  }

  /** Two beasts collide head on: cymbal crash and a big spring. */
  clash(): void {
    if (!this.ctx) return;
    this.noise({ dur: 0.5, gain: 0.34, freq: 6200, type: 'highpass', wet: 0.6 });
    this.tone({ freq: 240, freqEnd: 90, dur: 0.2, gain: 0.6, type: 'triangle', priority: true });
    this.boing(180, 0.42, 0.3, 0.03);
  }

  // ── Movement ────────────────────────────────────────────
  whoosh(): void {
    if (!this.ctx || !this.throttle('whoosh', 120)) return;
    this.tone({ freq: 420, freqEnd: 980, dur: 0.15, gain: 0.08, attack: 0.03, hold: 0.5 });
    this.noise({ dur: 0.14, gain: 0.26, freq: 900, freqEnd: 2600, type: 'bandpass', q: 1, attack: 0.04 });
  }

  /** A cartoon engine revving: "brrrm!" */
  charge(): void {
    if (!this.ctx || !this.throttle('charge', 180)) return;
    this.tone({ freq: 90, freqEnd: 420, dur: 0.42, gain: 0.22, type: 'sawtooth', vibRate: 34, vibDepth: 24, filter: 1200, hold: 0.8 });
  }

  jump(): void {
    if (!this.ctx || !this.throttle('jump', 140)) return;
    this.tone({ freq: 300, freqEnd: 1100, dur: 0.18, gain: 0.2, hold: 0.7 });
  }

  pop(): void {
    if (!this.ctx || !this.throttle('pop', 70)) return;
    this.tone({ freq: 380, freqEnd: 1200, dur: 0.07, gain: 0.3, hold: 0.6 });
  }

  // ── Powers and abilities ────────────────────────────────
  explosion(size = 1): void {
    if (!this.ctx || !this.throttle('boom', 100)) return;
    this.tone({ freq: 130, freqEnd: 36, dur: 0.5 + size * 0.25, gain: 0.8, priority: true });
    this.noise({ dur: 0.5 + size * 0.3, gain: 0.34, freq: 1500, freqEnd: 170, wet: 0.5 });
    if (size > 0.8) [1568, 2093, 2637, 3136].forEach((f, i) => this.bell(f, 0.3, 0.07, 0.34 + i * 0.07));
  }

  /** A giant foot stomps: boom, then everything rattles like toys on a shelf. */
  quake(): void {
    if (!this.ctx || !this.throttle('quake', 170)) return;
    this.tone({ freq: 90, freqEnd: 34, dur: 0.55, gain: 0.8, priority: true });
    this.boing(95, 0.4, 0.3, 0.05);
    for (let i = 0; i < 6; i++) this.tone({ freq: 700 + Math.random() * 900, dur: 0.05, gain: 0.05, type: 'triangle', delay: 0.1 + i * 0.06 });
  }

  thunder(): void {
    if (!this.ctx || !this.throttle('thunder', 110)) return;
    this.tone({ freq: 1500, freqEnd: 260, dur: 0.2, gain: 0.14, type: 'sawtooth', vibRate: 80, vibDepth: 600 });
    this.tone({ freq: 95, freqEnd: 42, dur: 0.34, gain: 0.45, delay: 0.04 });
    this.noise({ dur: 0.16, gain: 0.16, freq: 5200, type: 'highpass' });
  }

  fire(): void {
    if (!this.ctx || !this.throttle('fire', 130)) return;
    this.noise({ dur: 0.32, gain: 0.7, freq: 500, freqEnd: 2100, type: 'bandpass', q: 0.8, attack: 0.05 });
  }

  ice(): void {
    if (!this.ctx || !this.throttle('ice', 130)) return;
    const b = 2200 + Math.random() * 500;
    this.bell(b, 0.24, 0.2);
    this.bell(b * 1.34, 0.26, 0.16, 0.05);
  }

  zap(): void {
    if (!this.ctx || !this.throttle('zap', 110)) return;
    this.tone({ freq: 1100, freqEnd: 300, dur: 0.13, gain: 0.2, type: 'sawtooth', vibRate: 70, vibDepth: 300, hold: 0.7, filter: 4000 });
  }

  /** "Ptooey!" */
  spit(): void {
    if (!this.ctx || !this.throttle('spit', 110)) return;
    this.noise({ dur: 0.06, gain: 0.6, freq: 3000, type: 'bandpass', q: 1.5 });
    this.tone({ freq: 760, freqEnd: 240, dur: 0.13, gain: 0.3, delay: 0.03, hold: 0.5 });
  }

  /** A harp run. */
  heal(): void {
    if (!this.ctx || !this.throttle('heal', 240)) return;
    [72, 74, 76, 79, 81, 84].forEach((n, i) => this.mallet(midi(n), 0.42, 0.11, i * 0.045));
  }

  /** Fairy dust. */
  magic(): void {
    if (!this.ctx || !this.throttle('magic', 240)) return;
    [84, 86, 88, 91, 93, 96, 98].forEach((n, i) => this.bell(midi(n), 0.45, 0.07, i * 0.05));
  }

  // ── Animal voices ───────────────────────────────────────
  /** Every animal sounds like itself, in a cartoon way, and always friendly rather than frightening. */
  voice(id: string, group: Group | undefined, radius = 1, long = false): void {
    if (!this.ctx || !this.throttle('voice', 130)) return;
    const name = VOICES[id] ?? (group ? GROUP_VOICES[group] : 'rawr');
    // Bigger animals sound lower. Longer calls for big moments like roars.
    const p = 1 / Math.pow(Math.max(0.4, radius), 0.55);
    const len = long ? 1.5 : 1;
    switch (name) {
      case 'moo':
        this.vowel({ pitch: 150 * p, pitchEnd: 118 * p, dur: 0.62 * len, f1: 320, f2: 780, f1End: 460, f2End: 900, gain: 0.3, attack: 0.08, wet: 0.2 });
        break;
      case 'baa':
        this.vowel({ pitch: 340 * p, pitchEnd: 300 * p, dur: 0.48 * len, f1: 800, f2: 1250, gain: 0.24, vibRate: 10, vibDepth: 34, wet: 0.2 });
        break;
      case 'neigh':
        this.vowel({ pitch: 980 * p, pitchEnd: 430 * p, dur: 0.55 * len, f1: 900, f2: 1500, f1End: 650, gain: 0.2, vibRate: 15, vibDepth: 75, wet: 0.3 });
        break;
      case 'oink':
        for (const d of [0, 0.15]) this.vowel({ pitch: 280 * p, pitchEnd: 200 * p, dur: 0.12, f1: 900, f2: 1600, gain: 0.3, delay: d, type: 'square', attack: 0.01 });
        break;
      case 'trumpet':
        this.vowel({ pitch: 360 * p, pitchEnd: 700 * p, dur: 0.24, f1: 900, f2: 1800, gain: 0.28, vibRate: 7, vibDepth: 12, wet: 0.4 });
        this.vowel({ pitch: 700 * p, pitchEnd: 470 * p, dur: 0.42 * len, f1: 1000, f2: 2000, gain: 0.28, delay: 0.22, vibRate: 7, vibDepth: 15, wet: 0.4 });
        break;
      case 'rawr':
        this.vowel({ pitch: 210 * p, pitchEnd: 130 * p, dur: 0.46 * len, f1: 420, f2: 900, f1End: 780, f2End: 1250, gain: 0.3, vibRate: 22, vibDepth: 11, attack: 0.05, wet: 0.25 });
        break;
      case 'woof':
        for (const d of long ? [0, 0.16, 0.32] : [0, 0.16]) {
          this.vowel({ pitch: 360 * p, pitchEnd: 220 * p, dur: 0.1, f1: 620, f2: 1100, f1End: 380, gain: 0.3, delay: d, attack: 0.008 });
        }
        break;
      case 'mew':
        this.vowel({ pitch: 620 * p, pitchEnd: 840 * p, dur: 0.14, f1: 800, f2: 1800, gain: 0.2 });
        this.vowel({ pitch: 840 * p, pitchEnd: 520 * p, dur: 0.26, f1: 1100, f2: 2100, f1End: 700, gain: 0.2, delay: 0.13 });
        break;
      case 'hoo':
        [0, 0.17, 0.34, 0.51].forEach((d, i) => this.vowel({ pitch: (230 + i * 58) * p, dur: 0.14, f1: i > 1 ? 800 : 340, f2: i > 1 ? 1200 : 800, gain: 0.26, delay: d, attack: 0.02, wet: 0.2 }));
        break;
      case 'giggle':
        for (let i = 0; i < 5; i++) this.vowel({ pitch: (620 + i * 34) * p, dur: 0.07, f1: 850, f2: 1500, gain: 0.2, delay: i * 0.095, attack: 0.008 });
        break;
      case 'dino':
        // Big and goofy, like a tuba doing an impression of a monster.
        this.vowel({ pitch: 125 * p, pitchEnd: 72 * p, dur: 0.72 * len, f1: 340, f2: 680, f1End: 620, f2End: 980, gain: 0.42, vibRate: 15, vibDepth: 7, attack: 0.07, wet: 0.45 });
        this.tone({ freq: 60 * p, freqEnd: 40, dur: 0.5, gain: 0.2, type: 'triangle' });
        break;
      case 'chirp':
        for (const d of [0, 0.11]) this.tone({ freq: 1300 * p, freqEnd: 2200 * p, dur: 0.09, gain: 0.26, type: 'triangle', delay: d, hold: 0.6 });
        break;
      case 'chitter':
        for (let i = 0; i < 6; i++) this.noise({ dur: 0.03, gain: 0.9, freq: 3200 + Math.random() * 1600, type: 'bandpass', q: 3, delay: i * 0.034 });
        break;
      case 'buzz':
        this.tone({ freq: 210 * p, dur: 0.34, gain: 0.2, type: 'sawtooth', vibRate: 42, vibDepth: 16, filter: 1900, attack: 0.03, hold: 0.8 });
        break;
      case 'twinkle':
        [88, 91, 96].forEach((n, i) => this.bell(midi(n), 0.3, 0.07, i * 0.06));
        break;
      case 'tweet':
        for (const d of [0, 0.1, 0.2]) this.tone({ freq: 2300 * p, freqEnd: 3200 * p, dur: 0.08, gain: 0.18, delay: d, hold: 0.6 });
        break;
      case 'hoot':
        for (const d of [0, 0.24]) this.vowel({ pitch: 360 * p, pitchEnd: 330 * p, dur: 0.2, f1: 340, f2: 720, gain: 0.26, delay: d, type: 'triangle', attack: 0.04, wet: 0.5 });
        break;
      case 'honk':
        for (const d of [0, 0.18]) this.vowel({ pitch: 420 * p, pitchEnd: 320 * p, dur: 0.15, f1: 900, f2: 1700, gain: 0.26, delay: d, type: 'square', attack: 0.01 });
        break;
      case 'hiss':
        this.noise({ dur: 0.36, gain: 0.3, freq: 4800, freqEnd: 3400, type: 'highpass', attack: 0.05 });
        break;
      case 'rattle':
        for (let i = 0; i < 8; i++) this.noise({ dur: 0.026, gain: 0.5, freq: 5200, type: 'highpass', delay: i * 0.04 });
        break;
      case 'blub':
        for (let i = 0; i < 4; i++) this.tone({ freq: 240 + i * 90, freqEnd: 720 + i * 180, dur: 0.08, gain: 0.36, delay: i * 0.09, wet: 0.3, hold: 0.6 });
        break;
      case 'arf':
        for (const d of [0, 0.18]) this.vowel({ pitch: 300 * p, pitchEnd: 220 * p, dur: 0.14, f1: 620, f2: 1000, gain: 0.3, delay: d, attack: 0.012 });
        break;
      case 'squeak':
        this.tone({ freq: 1100 * p, freqEnd: 1800 * p, dur: 0.12, gain: 0.26, type: 'triangle', hold: 0.7 });
        break;
      case 'whale':
        // A long, soft song that slides up and back down.
        this.vowel({ pitch: 150, pitchEnd: 300, dur: 0.7, f1: 320, f2: 700, f1End: 500, gain: 0.26, type: 'triangle', attack: 0.15, wet: 0.8 });
        this.vowel({ pitch: 300, pitchEnd: 190, dur: 0.8, f1: 500, f2: 900, f1End: 340, gain: 0.24, type: 'triangle', delay: 0.62, wet: 0.8 });
        break;
      case 'magicRoar':
        this.vowel({ pitch: 150 * p, pitchEnd: 90 * p, dur: 0.72 * len, f1: 380, f2: 820, f1End: 680, f2End: 1100, gain: 0.34, vibRate: 13, vibDepth: 8, attack: 0.06, wet: 0.55 });
        [84, 88, 91, 96].forEach((n, i) => this.bell(midi(n), 0.34, 0.05, 0.2 + i * 0.08));
        break;
    }
  }

  // ── Menus and rewards ───────────────────────────────────
  ui(): void {
    if (!this.ctx || !this.throttle('ui', 40)) return;
    this.mallet(midi(79), 0.13, 0.42);
  }

  uiDeny(): void {
    if (!this.ctx) return;
    this.tone({ freq: 260, dur: 0.1, gain: 0.2, type: 'triangle' });
    this.tone({ freq: 196, dur: 0.15, gain: 0.2, type: 'triangle', delay: 0.11 });
  }

  /** Plop! */
  place(): void {
    if (!this.ctx) return;
    this.tone({ freq: 330, freqEnd: 780, dur: 0.08, gain: 0.34, hold: 0.5 });
    this.tone({ freq: 170, freqEnd: 90, dur: 0.11, gain: 0.3, type: 'triangle', delay: 0.02, hold: 0.3 });
  }

  coin(): void {
    if (!this.ctx || !this.throttle('coin', 70)) return;
    this.tone({ freq: midi(83), dur: 0.08, gain: 0.2, type: 'square', filter: 5200, hold: 0.7 });
    this.tone({ freq: midi(88), dur: 0.28, gain: 0.2, type: 'square', delay: 0.07, filter: 5200, wet: 0.3 });
  }

  /** XP bars climb a musical scale, so they always sound right together. */
  xpTick(p: number): void {
    if (!this.ctx || !this.throttle('xp', 65)) return;
    const n = PENTATONIC[Math.min(PENTATONIC.length - 1, Math.floor(p * PENTATONIC.length))];
    this.tone({ freq: midi(n), dur: 0.09, gain: 0.14, wet: 0.2 });
  }

  levelUp(): void {
    if (!this.ctx) return;
    [72, 76, 79, 84, 88].forEach((n, i) => this.mallet(midi(n), 0.34, 0.15, i * 0.07));
    [84, 88, 91].forEach((n) => this.bell(midi(n), 0.75, 0.05, 0.38));
    this.cheer(0.34, 0.5);
  }

  evolve(): void {
    if (!this.ctx) return;
    // A rising shimmer, then ta-daa!
    this.tone({ freq: 200, freqEnd: 1700, dur: 0.72, gain: 0.1, attack: 0.3, vibRate: 13, vibDepth: 60, wet: 0.6, hold: 0.8 });
    [72, 74, 76, 79, 81, 84, 86, 88].forEach((n, i) => this.bell(midi(n), 0.3, 0.06, i * 0.075));
    [60, 67, 72, 76, 79, 84].forEach((n) => this.tone({ freq: midi(n), dur: 1.0, gain: 0.08, type: 'triangle', delay: 0.72, wet: 0.5, hold: 0.45 }));
    this.tone({ freq: 95, freqEnd: 50, dur: 0.3, gain: 0.5, delay: 0.72 });
    this.cheer(0.4, 0.8);
  }

  /** A kazoo fanfare, tuba and drums, and a crowd cheering. */
  victory(): void {
    if (!this.ctx) return;
    const tune: [number, number, number][] = [
      [67, 0, 0.14], [72, 0.16, 0.14], [76, 0.32, 0.14], [79, 0.48, 0.28], [76, 0.8, 0.14], [79, 0.96, 0.14], [84, 1.14, 0.62],
    ];
    for (const [n, d, len] of tune) {
      this.kazoo(midi(n), len, d);
      this.tone({ freq: midi(n - 24), dur: len + 0.06, gain: 0.2, type: 'triangle', delay: d, priority: true, hold: 0.7 });
    }
    for (const d of [0, 0.32, 0.8, 1.14]) {
      this.tone({ freq: 130, freqEnd: 52, dur: 0.14, gain: 0.5, delay: d, priority: true });
    }
    this.noise({ dur: 0.7, gain: 0.2, freq: 6000, type: 'highpass', delay: 1.14, wet: 0.7 });
    this.cheer(1.0, 1.5);
  }

  private kazoo(freq: number, dur: number, delay: number): void {
    this.vowel({ pitch: freq, dur, f1: 1100, f2: 2200, gain: 0.2, delay, attack: 0.012, vibRate: 7, vibDepth: freq * 0.012, wet: 0.3 });
  }

  /** A little crowd of kids going "yaaay!" */
  private cheer(delay: number, dur: number): void {
    const base = [430, 510, 590, 700];
    base.forEach((f, i) => {
      this.vowel({ pitch: f, pitchEnd: f * 1.16, dur, f1: 780, f2: 1900, f1End: 620, f2End: 2300, gain: 0.05, delay: delay + i * 0.02, vibRate: 5 + i, vibDepth: 7, attack: 0.12, wet: 0.5 });
    });
    this.noise({ dur, gain: 0.05, freq: 2100, type: 'bandpass', q: 0.5, delay, attack: 0.12, wet: 0.5 });
  }

  /** The silly sad trombone: wah, wah, wah, waaaah. Then a hopeful little "try again!" */
  defeat(): void {
    if (!this.ctx) return;
    const notes: [number, number, number][] = [[62, 0, 0.3], [61, 0.34, 0.3], [60, 0.68, 0.3], [59, 1.02, 0.9]];
    for (const [n, d, len] of notes) {
      this.vowel({ pitch: midi(n), pitchEnd: midi(n) * 0.96, dur: len, f1: 460, f2: 950, f1End: 760, f2End: 1200, gain: 0.28, delay: d, attack: 0.03, vibRate: n === 59 ? 6 : 0, vibDepth: 6, wet: 0.3 });
    }
    [72, 76, 79].forEach((n, i) => this.mallet(midi(n), 0.3, 0.1, 2.15 + i * 0.13));
  }

  /** Ready, set, go! Like the lights at the start of a kart race. */
  horn(): void {
    if (!this.ctx) return;
    for (const d of [0, 0.3]) this.tone({ freq: midi(72), dur: 0.2, gain: 0.14, type: 'square', delay: d, filter: 3000, hold: 0.8 });
    this.tone({ freq: midi(84), dur: 0.5, gain: 0.16, type: 'square', delay: 0.6, filter: 3200, wet: 0.4, hold: 0.8 });
    this.tone({ freq: midi(48), dur: 0.5, gain: 0.3, type: 'triangle', delay: 0.6, hold: 0.7 });
  }

  /** The big one: a rare beast has joined the herd. */
  rareReveal(): void {
    if (!this.ctx) return;
    this.tone({ freq: 160, freqEnd: 1900, dur: 0.95, gain: 0.1, attack: 0.4, vibRate: 15, vibDepth: 70, wet: 0.7, hold: 0.85 });
    [72, 74, 76, 79, 81, 84, 86, 88, 91, 93].forEach((n, i) => this.bell(midi(n), 0.34, 0.07, i * 0.09));
    for (const [n, d, len] of [[72, 0.96, 0.15], [76, 1.12, 0.15], [79, 1.28, 0.15], [84, 1.44, 0.75]] as const) {
      this.kazoo(midi(n), len, d);
      this.tone({ freq: midi(n - 24), dur: len + 0.05, gain: 0.22, type: 'triangle', delay: d, priority: true, hold: 0.7 });
    }
    [60, 67, 72, 76, 79, 84, 88].forEach((n) => this.tone({ freq: midi(n), dur: 1.3, gain: 0.07, type: 'triangle', delay: 1.44, wet: 0.6, hold: 0.45 }));
    this.tone({ freq: 110, freqEnd: 48, dur: 0.34, gain: 0.55, delay: 0.96, priority: true });
    this.noise({ dur: 0.8, gain: 0.2, freq: 6000, type: 'highpass', delay: 1.44, wet: 0.7 });
    this.cheer(1.44, 1.5);
  }

  /** A rising arcade flourish for knockout streaks. */
  stinger(level: number): void {
    if (!this.ctx) return;
    const top = 76 + Math.min(3, level) * 3;
    [top - 12, top - 7, top - 4, top].forEach((n, i) => this.mallet(midi(n), 0.2, 0.17, i * 0.055));
  }

  // ── Music ───────────────────────────────────────────────
  setMusic(mode: 'none' | 'menu' | 'battle'): void {
    if (mode === this.musicMode) return;
    this.musicMode = mode;
    if (mode === 'none') {
      if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
      return;
    }
    this.musicStepN = 0;
    this.startScheduler();
  }

  private startScheduler(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.musicStepN = 0;
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 60);
  }

  private stepDur(): number {
    return this.musicMode === 'battle' ? 60 / 148 / 2 : 60 / 104 / 2;
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || this.musicMode === 'none') return;
    if (this.musicOff) {
      this.musicNext = c.currentTime + 0.1;
      return;
    }
    // After the tab sleeps, skip ahead rather than catching up in one noisy burst.
    if (this.musicNext < c.currentTime - 0.5) this.musicNext = c.currentTime + 0.05;
    const dur = this.stepDur();
    while (this.musicNext < c.currentTime + 0.25) {
      this.playStep(this.musicStepN, Math.max(0, this.musicNext - c.currentTime), dur);
      this.musicNext += dur;
      this.musicStepN = (this.musicStepN + 1) % 64;
    }
  }

  private playStep(step: number, delay: number, dur: number): void {
    const bar = Math.floor(step / 8);
    const pos = step % 8;
    if (this.musicMode === 'battle') this.battleStep(bar, pos, delay, dur);
    else this.menuStep(bar, pos, delay, dur);
  }

  /** A sunny stroll: ukulele on the off-beats, tuba underneath, marimba carrying the tune. */
  private menuStep(bar: number, pos: number, delay: number, dur: number): void {
    const swing = pos % 2 ? dur * 0.16 : 0;
    const d = delay + swing;
    const chord = CHORD[MENU_CHORDS[bar]];
    const m = MENU_TUNE[bar][pos];
    if (m) this.mallet(midi(m), dur * 2, 0.17, d, 'music');
    if (pos === 0 || pos === 4) this.tone({ freq: midi(chord[0] - (pos === 4 ? 17 : 24)), dur: dur * 1.5, gain: 0.26, type: 'triangle', delay: d, bus: 'music' });
    if (pos === 2 || pos === 6) {
      chord.forEach((n, i) => this.tone({ freq: midi(n), dur: dur * 0.95, gain: 0.07, type: 'triangle', delay: d + i * 0.012, bus: 'music', filter: 2200 }));
    }
    if (pos % 2 === 1) this.noise({ dur: 0.03, gain: 0.018, freq: 7000, type: 'highpass', delay: d, bus: 'music' });
  }

  /** A bouncy chase: oom-pah tuba, a marimba run, claps, and a whistle lead when things heat up. */
  private battleStep(bar: number, pos: number, delay: number, dur: number): void {
    // The whole tune climbs a step when the fight gets close.
    const lift = this.intensity > 0.55 ? 2 : 0;
    const chord = CHORD[BATTLE_CHORDS[bar]].map((n) => n + lift);
    const bus: Bus = 'music';
    if (pos % 4 === 0) this.tone({ freq: midi(chord[0] - 24), dur: dur * 0.9, gain: 0.3, type: 'triangle', delay, bus });
    if (pos % 4 === 2) this.tone({ freq: midi(chord[0] - 12), dur: dur * 0.6, gain: 0.17, type: 'triangle', delay, bus });
    // Marimba arpeggio keeps the feet moving.
    this.tone({ freq: midi(chord[[0, 1, 2, 1][pos % 4]] + 12), dur: dur * 0.85, gain: 0.07, delay, bus, wet: 0.2, priority: true });
    // Drums: a soft kick, claps on the backbeat, a shaker on every step.
    if (pos === 0 || pos === 3 || pos === 4) this.tone({ freq: 120, freqEnd: 54, dur: 0.1, gain: 0.3, delay, bus });
    if (pos === 2 || pos === 6) {
      this.noise({ dur: 0.08, gain: 0.09, freq: 1700, type: 'bandpass', q: 0.8, delay, bus });
      this.noise({ dur: 0.08, gain: 0.05, freq: 1700, type: 'bandpass', q: 0.8, delay: delay + 0.012, bus });
    }
    this.noise({ dur: 0.025, gain: pos % 2 ? 0.022 : 0.012, freq: 7500, type: 'highpass', delay, bus });
    // A tom fill leads back around.
    if (bar === 7 && pos >= 4) this.tone({ freq: 240 - (pos - 4) * 30, freqEnd: 120, dur: 0.11, gain: 0.17, type: 'triangle', delay, bus });
    // The melody comes in once the fight is on, a cheerful slide whistle doubling the marimba.
    const m = BATTLE_TUNE[bar][pos];
    if (m) {
      this.mallet(midi(m + lift), dur * 1.5, 0.11, delay, bus);
      if (this.intensity > 0.3) {
        this.tone({ freq: midi(m + lift + 12), dur: dur * 1.1, gain: 0.03, delay, bus, attack: 0.02, vibRate: 6, vibDepth: 7, priority: true, hold: 0.7 });
      }
    }
  }

  /** Schedules whole bars at once on an offline context, so tests can measure the music. */
  renderMusicForTest(mode: 'menu' | 'battle', steps: number, intensity = 0.8): void {
    this.musicMode = mode;
    this.intensity = intensity;
    const dur = this.stepDur();
    for (let i = 0; i < steps; i++) this.playStep(i % 64, 0.05 + i * dur, dur);
    this.musicMode = 'none';
  }
}

export const audio = new AudioEngine();
