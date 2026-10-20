/** Local, gesture-unlocked Web Audio. No samples, downloads, or wall-clock timers. */
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const midi = note => 440 * Math.pow(2, (note - 69) / 12);
const COMBAT_SOUNDS = new Set(['pistol', 'revolver', 'smg', 'shotgun', 'shot', 'gun', 'hit', 'kill', 'hurt', 'roll', 'reload', 'reloadDone', 'empty', 'engine', 'skid', 'trainBrake', 'arrivalDoor']);

export class AudioEngine {
  constructor() {
    this.context = null;
    this.musicVolume = 0.35;
    this.sfxVolume = 0.7;
    this.mode = 'title';
    this.nextBeat = 0;
    this.beat = 0;
    this.activeNodes = new Set();
    this.rain = null;
    this.weatherIntensity = 0;
    this.enabled = true;
  }

  start() {
    if (!this.enabled) return;
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) { this.enabled = false; return; }
      try {
        this.context = new Context();
        const ctx = this.context;
        this.master = ctx.createDynamicsCompressor();
        this.master.threshold.value = -14;
        this.master.knee.value = 14;
        this.master.ratio.value = 5;
        this.master.attack.value = 0.002;
        this.master.release.value = 0.15;
        this.master.connect(ctx.destination);
        this.musicBus = ctx.createGain();
        this.sfxBus = ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.musicBus.gain.value = this.musicVolume;
        this.sfxBus.gain.value = this.sfxVolume;
        this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this._startRain();
        this.nextBeat = ctx.currentTime + 0.1;
      } catch {
        this.enabled = false;
        return;
      }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setVolumes(music, sfx) {
    if (music !== undefined) this.musicVolume = clamp(music);
    if (sfx !== undefined) this.sfxVolume = clamp(sfx);
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVolume, now, 0.04);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, now, 0.02);
  }

  setWeather(intensity) {
    const next = clamp(intensity);
    if (Math.abs(next - this.weatherIntensity) < 0.0001) return;
    this.weatherIntensity = next;
    if (this.context && this.rainEnvelope) {
      this.rainEnvelope.gain.setTargetAtTime(next * 0.055, this.context.currentTime, 0.12);
    }
  }

  _track(node, ends, cleanup = []) {
    this.activeNodes.add(node);
    node.onended = () => {
      node.disconnect();
      for (const child of cleanup) child.disconnect();
      this.activeNodes.delete(node);
    };
    node.stop(ends);
    return node;
  }

  _tone(freq, duration, volume, type = 'sine', when, bus, endFreq) {
    if (!this.context) return;
    const ctx = this.context;
    const time = when ?? ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(10, freq), time);
    if (endFreq) oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), time + duration);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + Math.min(0.008, duration * 0.1));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(bus || this.sfxBus);
    oscillator.start(time);
    this._track(oscillator, time + duration + 0.015, [envelope]);
  }

  _noise(duration, volume, frequency = 1400, when, bus, filterType = 'bandpass') {
    if (!this.context) return;
    const ctx = this.context;
    const time = when ?? ctx.currentTime;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(Math.max(0.0002, volume), time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus || this.sfxBus);
    source.start(time, Math.random() * 0.8);
    this._track(source, time + duration + 0.015, [filter, envelope]);
  }

  _startRain() {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 1700;
    envelope.gain.value = this.weatherIntensity * 0.055;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.sfxBus);
    source.start();
    this.rain = source;
    this.rainEnvelope = envelope;
    this.rainNodes = [filter, envelope];
  }

  sfx(name, options = {}) {
    if (!this.context || this.context.state !== 'running') return;
    if (COMBAT_SOUNDS.has(name) && ['paused', 'reward', 'dead', 'won'].includes(this.mode)) return;
    if (name === 'shot' || name === 'gun') name = options.weapon || options.weaponId || 'pistol';
    const t = this.context.currentTime;
    const v = options.volume === undefined ? 1 : clamp(options.volume);
    if (v <= 0 || this.sfxVolume <= 0) return;
    const tone = (freq, duration, volume, type = 'sine', delay = 0, endFreq) => this._tone(freq, duration, volume * v, type, t + delay, this.sfxBus, endFreq);
    const noise = (duration, volume, frequency, delay = 0, filterType = 'bandpass') => this._noise(duration, volume * v, frequency, t + delay, this.sfxBus, filterType);
    switch (name) {
      case 'pistol':
        noise(0.095, 0.44, 2000); tone(155, 0.105, 0.26, 'triangle', 0, 38); tone(950, 0.025, 0.08, 'square'); break;
      case 'revolver':
        noise(0.20, 0.68, 1100); tone(110, 0.24, 0.38, 'triangle', 0, 27); tone(680, 0.05, 0.1, 'sawtooth', 0, 140); break;
      case 'smg':
        noise(0.055, 0.32, 2800); tone(210, 0.065, 0.19, 'triangle', 0, 75); break;
      case 'shotgun':
        noise(0.27, 0.85, 950); noise(0.065, 0.35, 3600); tone(84, 0.30, 0.43, 'triangle', 0, 24); noise(0.07, 0.13, 1900, 0.17); break;
      case 'hit':
        noise(0.055, 0.16, 1100); tone(265, 0.045, 0.08, 'triangle', 0, 110); break;
      case 'kill':
        noise(0.095, 0.17, 650); tone(410, 0.08, 0.10, 'triangle', 0, 190); break;
      case 'hurt':
        noise(0.15, 0.22, 530); tone(75, 0.26, 0.26, 'sine', 0, 31); break;
      case 'roll':
        noise(0.22, 0.18, 650); tone(150, 0.13, 0.04, 'triangle', 0, 70); break;
      case 'reload':
        noise(0.065, 0.18, 2800); tone(430, 0.07, 0.06, 'square', 0, 180); noise(0.06, 0.10, 3700, 0.13); break;
      case 'reloadDone':
        noise(0.055, 0.18, 3400); tone(740, 0.055, 0.10, 'triangle'); tone(1050, 0.08, 0.07, 'triangle', 0.045); break;
      case 'empty':
        noise(0.035, 0.09, 4200); tone(280, 0.025, 0.04, 'square'); break;
      case 'engine':
        // Low mechanical rev, kept short so an arrival cannot leave a loop behind.
        tone(52, 0.95, 0.16, 'sawtooth', 0, 108); tone(104, 0.75, 0.055, 'triangle', 0, 160);
        noise(0.85, 0.12, 310, 0, 'lowpass'); break;
      case 'skid':
        noise(0.62, 0.23, 1800); tone(860, 0.48, 0.055, 'sawtooth', 0, 430);
        noise(0.32, 0.11, 3400, 0.12); break;
      case 'trainBrake':
        noise(0.80, 0.20, 2100); tone(1430, 0.72, 0.035, 'sine', 0, 610);
        tone(240, 0.48, 0.07, 'triangle', 0.1, 55); break;
      case 'arrivalDoor':
        noise(0.14, 0.17, 520); tone(95, 0.14, 0.10, 'triangle', 0, 40);
        noise(0.06, 0.08, 2400, 0.11); break;
      case 'pickup':
        tone(392, 0.12, 0.13, 'triangle'); tone(587, 0.16, 0.10, 'triangle', 0.07); break;
      case 'upgrade':
        [293.66, 349.23, 440, 587.33].forEach((f, i) => tone(f, 0.42, 0.12, 'triangle', i * 0.075)); break;
      case 'door':
        noise(0.30, 0.12, 520); tone(110, 0.32, 0.12, 'triangle', 0, 50); tone(392, 0.2, 0.06, 'sine', 0.1); break;
      case 'death':
        [196, 146.83, 110, 73.42].forEach((f, i) => tone(f, 0.65, 0.15, 'triangle', i * 0.12)); noise(0.45, 0.2, 390); break;
      case 'win':
        [146.83, 220, 293.66, 349.23, 440, 587.33].forEach((f, i) => tone(f, 1.1, 0.11, 'triangle', i * 0.1)); break;
      default:
        break;
    }
  }

  update(dt, mode) {
    this.mode = mode || this.mode;
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // Returning from a hidden tab never schedules a backlog of old notes.
    if (this.nextBeat < now - 0.5) this.nextBeat = now + 0.05;
    while (this.nextBeat < now + 0.12) {
      this._musicBeat(this.beat++, this.nextBeat);
      this.nextBeat += 0.34; // 88 BPM, swung eighth notes below.
    }
  }

  _musicBeat(beat, time) {
    const chordProgression = [
      [38, 53, 57, 60, 64], // D minor 9
      [34, 53, 56, 60, 65], // Bb minor colour
      [31, 50, 53, 57, 62], // G minor 9
      [33, 49, 55, 58, 64], // A altered dominant
    ];
    const chord = chordProgression[Math.floor(beat / 16) % chordProgression.length];
    const position = beat % 16;
    const swing = beat % 2 ? 0.055 : 0;
    const t = time + swing;
    if (position === 0 || position === 7) {
      chord.slice(1).forEach((note, i) => {
        this._tone(midi(note), 2.15, 0.025, 'sine', t + i * 0.018, this.musicBus);
        this._tone(midi(note + 12), 0.9, 0.005, 'triangle', t + i * 0.018, this.musicBus);
      });
    }
    if (position % 4 === 0) {
      const note = chord[0] + (position === 8 ? 7 : position === 12 ? 12 : 0);
      this._tone(midi(note), 0.65, 0.095, 'sine', t, this.musicBus, midi(note) * 0.99);
      this._tone(midi(note + 12), 0.2, 0.018, 'triangle', t, this.musicBus);
    }
    if (position % 2 === 1) this._noise(0.12, 0.014, 5200, t, this.musicBus, 'highpass');
    if (position === 4 || position === 12) this._noise(0.19, 0.022, 1700, t, this.musicBus);
    if (position === 5 || position === 11 || position === 14) {
      const note = chord[2 + (Math.floor(beat / 16) + position) % 3] + 12;
      this._tone(midi(note), position === 14 ? 0.65 : 0.38, 0.024, 'triangle', t, this.musicBus);
      this._tone(midi(note) * 1.003, 0.4, 0.008, 'sine', t, this.musicBus);
    }
  }

  destroy() {
    if (this.rain) { try { this.rain.stop(); } catch {} this.rain.disconnect(); }
    for (const node of this.activeNodes) {
      try { node.stop(); } catch {}
      if (node.onended) node.onended();
    }
    for (const node of this.rainNodes || []) node.disconnect();
    this.rainNodes = [];
    this.activeNodes.clear();
    if (this.context) this.context.close().catch(() => {});
    this.context = null;
    this.rain = null;
    this.rainEnvelope = null;
    this.beat = 0;
  }
}
