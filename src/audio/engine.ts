/**
 * 音频引擎
 *
 * BGM 完全由 Web Audio API 程序化合成（无外部音频文件）：
 *   Drone 低频持续音 + Pad 和弦铺底 + Shimmer 高频泛音 + 低频脉冲
 * SFX 为每种交互单独合成的短音效，播放后立即释放节点。
 */
export type SfxName =
  | 'fist'
  | 'open'
  | 'peace'
  | 'ok'
  | 'rock'
  | 'pinch'
  | 'warp'
  | 'morph'
  | 'ask'
  | 'answer';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmStarted = false;
  private bgmTimer: number | null = null;

  private _bgmEnabled = true;
  private _sfxEnabled = true;
  private _bgmVolume = 0.4;
  private _sfxVolume = 0.65;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** 必须由用户手势触发 */
  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.bgmBus = this.ctx.createGain();
    this.bgmBus.gain.value = this._bgmEnabled ? this._bgmVolume : 0;
    this.bgmBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this._sfxVolume;
    this.sfxBus.connect(this.master);

    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  get bgmEnabled(): boolean {
    return this._bgmEnabled;
  }
  set bgmEnabled(v: boolean) {
    this._bgmEnabled = v;
    if (this.bgmBus && this.ctx) {
      this.bgmBus.gain.setTargetAtTime(v ? this._bgmVolume : 0, this.ctx.currentTime, 0.2);
    }
  }

  get sfxEnabled(): boolean {
    return this._sfxEnabled;
  }
  set sfxEnabled(v: boolean) {
    this._sfxEnabled = v;
  }

  set bgmVolume(v: number) {
    this._bgmVolume = v;
    if (this.bgmBus && this.ctx) {
      this.bgmBus.gain.setTargetAtTime(this._bgmEnabled ? v : 0, this.ctx.currentTime, 0.05);
    }
  }
  set sfxVolume(v: number) {
    this._sfxVolume = v;
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  /** 启动氛围 BGM（幂等） */
  startBgm(): void {
    if (!this.ctx || !this.bgmBus || this.bgmStarted) return;
    this.bgmStarted = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // ---- Drone：A1 / E2 / B2 三层低音 ----
    [55, 82.41, 123.47].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180 + i * 60;
      lp.Q.value = 4;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1 / (i + 1), now + 4);

      // LFO 缓慢开合滤波，形成"宇宙呼吸"
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.025;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 70;
      lfo.connect(lfoGain).connect(lp.frequency);

      osc.connect(lp).connect(gain).connect(this.bgmBus!);
      osc.start(now);
      lfo.start(now);
    });

    // ---- Shimmer：高频泛音 ----
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 880;
    const shimmerLfo = ctx.createOscillator();
    shimmerLfo.frequency.value = 0.22;
    const shimmerDepth = ctx.createGain();
    shimmerDepth.gain.value = 900;
    shimmerLfo.connect(shimmerDepth).connect(shimmer.frequency);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.014;
    shimmer.connect(shimmerGain).connect(this.bgmBus);
    shimmer.start(now);
    shimmerLfo.start(now);

    // ---- Pad：和弦循环 ----
    const chords = [
      [110, 138.59, 164.81],
      [98, 123.47, 146.83],
      [123.47, 155.56, 185],
    ];
    let idx = 0;
    const playChord = () => {
      if (!this.ctx || !this.bgmBus || !this._bgmEnabled) return;
      const c = this.ctx;
      const chord = chords[idx % chords.length];
      idx++;
      chord.forEach((f) => {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 5;

        const gain = c.createGain();
        const dur = 9;
        gain.gain.setValueAtTime(0, c.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, c.currentTime + 2.5);
        gain.gain.linearRampToValueAtTime(0, c.currentTime + dur);

        osc.connect(gain).connect(this.bgmBus!);
        osc.start();
        osc.stop(c.currentTime + dur + 0.2);
      });
    };
    playChord();
    this.bgmTimer = window.setInterval(playChord, 8800);
  }

  /** 播放交互音效 */
  play(name: SfxName): void {
    if (!this.ctx || !this.sfxBus || !this._sfxEnabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const tone = (
      type: OscillatorType,
      from: number,
      to: number,
      dur: number,
      peak: number,
      delay = 0,
    ) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now + delay);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, now + delay + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(peak, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);

      osc.connect(gain).connect(this.sfxBus!);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    };

    switch (name) {
      case 'fist':
        tone('sine', 180, 42, 0.55, 0.42);
        break;
      case 'open':
        tone('triangle', 320, 1150, 0.5, 0.34);
        break;
      case 'peace':
        tone('sine', 880, 880, 0.45, 0.26);
        tone('sine', 1320, 1320, 0.45, 0.2, 0.09);
        break;
      case 'ok':
        tone('sawtooth', 140, 1800, 0.7, 0.28);
        break;
      case 'rock': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 196;
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.tanh(x * 4);
        }
        shaper.curve = curve;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        osc.connect(shaper).connect(gain).connect(this.sfxBus);
        osc.start(now);
        osc.stop(now + 0.75);
        break;
      }
      case 'pinch':
        [1760, 2640, 3520].forEach((f, i) => tone('sine', f, f, 0.28, 0.16, i * 0.05));
        break;
      case 'warp': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
        osc.connect(gain).connect(this.sfxBus);
        osc.start(now);
        osc.stop(now + 1.35);
        break;
      }
      case 'morph':
        tone('sine', 220, 660, 0.45, 0.2);
        tone('sine', 330, 990, 0.5, 0.12, 0.05);
        break;
      case 'ask':
        tone('sine', 520, 780, 0.16, 0.16);
        break;
      case 'answer':
        tone('sine', 660, 660, 0.3, 0.12);
        tone('sine', 990, 990, 0.35, 0.08, 0.08);
        break;
    }
  }

  dispose(): void {
    if (this.bgmTimer !== null) clearInterval(this.bgmTimer);
    this.ctx?.close();
    this.ctx = null;
  }
}
