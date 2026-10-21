/* Procedural audio engine.
 *
 * Everything is synthesised with the Web Audio API so the game ships without
 * any binary sound files — and it still supports drop-in voice packs plus
 * microphone recordings made in the Studio.
 */

import { BUILTIN_VOICES } from "./content.js";
import { getLang } from "./i18n.js";
import { loadClipBlob } from "./voicebox.js";

const PHRASES = {
  en: {
    hit: ["Ow!", "Oof!", "Agh!", "Hey!"],
    ouch: ["Stop that!", "My tenure!", "Not the face!", "I'll report you!", "Ouch, honestly!"],
    ko: ["I'm telling the dean!", "Detention… forever…", "This is academic misconduct!"],
    taunt: ["Is that all?", "Detention!", "Class, settle down.", "Pathetic effort!", "Do your homework!"],
    special: ["Good heavens!", "Extra homework!", "Zero marks!"],
  },
  ar: {
    hit: ["آي!", "أوخ!", "أها!"],
    ouch: ["توقف!", "وجهي!", "سأشتكي عليك!", "لا أستحق هذا!"],
    ko: ["سأخبر المدير!", "احتجاز أبدي…", "هذا سلوك مشين!"],
    taunt: ["هذا كل ما لديك؟", "احتجاز!", "اجلسوا يا طلاب!", "محاولة بائسة!"],
    special: ["يا إلهي!", "واجب إضافي!", "صفر درجات!"],
  },
  de: {
    hit: ["Aua!", "Autsch!", "Hey!"],
    ouch: ["Hör auf!", "Meine Brille!", "Das melde ich!", "Nicht das Gesicht!"],
    ko: ["Ich sag's dem Direktor!", "Nachsitzen… für immer…", "Unverschämtheit!"],
    taunt: ["War das alles?", "Nachsitzen!", "Ruhe bitte!", "Erbärmlich!"],
    special: ["Meine Güte!", "Hausaufgaben!", "Null Punkte!"],
  },
  es: {
    hit: ["¡Ay!", "¡Uf!", "¡Oye!"],
    ouch: ["¡Basta!", "¡Mis gafas!", "¡Lo denunciaré!", "¡No la cara!"],
    ko: ["¡Se lo diré al director!", "Castigado… para siempre…", "¡Esto es abuso!"],
    taunt: ["¿Eso es todo?", "¡Castigado!", "¡Silencio en clase!", "¡Patético!"],
    special: ["¡Santo cielo!", "¡Deberes extra!", "¡Cero puntos!"],
  },
};

const pick = (list) => (list && list.length ? list[Math.floor(Math.random() * list.length)] : null);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.musicOn = false;
    this.musicTimer = null;
    this.step = 0;
    this.voiceConfig = { type: "builtin", id: "professor", pitch: 0.78, rate: 0.92 };
    this.packClips = {};
    this.buffers = new Map();
    this.lastVoiceAt = 0;
    this.voiceQueue = [];
  }

  /* ── setup ───────────────────────────────────────────────────────────── */

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      this.ctx = new Ctx({ latencyHint: "interactive" });
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(this.master);

    // 2s of white noise, reused for impacts.
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    }
  }

  /* ── primitives ──────────────────────────────────────────────────────── */

  _tone({
    type = "sine",
    freq = 440,
    to = null,
    dur = 0.2,
    gain = 0.3,
    delay = 0,
    filter = null,
    q = 1,
    detune = 0,
    bus = null,
    attack = 0.005,
  }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    if (detune) osc.detune.value = detune;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let node = osc;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type || "lowpass";
      f.frequency.setValueAtTime(filter.freq || 1000, t);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.to), t + dur);
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    node.connect(amp).connect(bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise({
    dur = 0.15,
    gain = 0.25,
    type = "lowpass",
    freq = 1200,
    to = null,
    q = 1,
    delay = 0,
    bus = null,
  }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;

    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    f.Q.value = q;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f).connect(amp).connect(bus || this.sfxBus);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  /* ── game sounds ─────────────────────────────────────────────────────── */

  sfx(name, { volume = 1, pitch = 1 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const v = volume;
    switch (name) {
      case "kick":
        this._tone({ type: "sine", freq: 150 * pitch, to: 48, dur: 0.19, gain: 0.55 * v });
        this._noise({ dur: 0.1, gain: 0.3 * v, freq: 900, to: 200 });
        break;
      case "punch":
        this._noise({ dur: 0.085, gain: 0.34 * v, freq: 1500, to: 300 });
        this._tone({ type: "triangle", freq: 200 * pitch, to: 75, dur: 0.11, gain: 0.35 * v });
        break;
      case "slap":
        this._noise({ dur: 0.065, gain: 0.4 * v, type: "highpass", freq: 1800, to: 4200, q: 0.7 });
        this._tone({ type: "square", freq: 320 * pitch, to: 160, dur: 0.05, gain: 0.12 * v });
        break;
      case "whack":
        this._noise({ dur: 0.11, gain: 0.38 * v, type: "bandpass", freq: 2400, to: 700, q: 1.2 });
        this._tone({ type: "square", freq: 420 * pitch, to: 190, dur: 0.1, gain: 0.14 * v });
        break;
      case "bat":
        this._tone({ type: "sine", freq: 110 * pitch, to: 46, dur: 0.26, gain: 0.6 * v });
        this._noise({ dur: 0.16, gain: 0.32 * v, freq: 700, to: 150 });
        break;
      case "clang":
        this._tone({ type: "triangle", freq: 620 * pitch, to: 420, dur: 0.55, gain: 0.3 * v });
        this._tone({ type: "sine", freq: 1560 * pitch, dur: 0.4, gain: 0.16 * v });
        this._tone({ type: "sine", freq: 2280 * pitch, dur: 0.3, gain: 0.08 * v });
        this._noise({ dur: 0.1, gain: 0.24 * v, type: "highpass", freq: 2500 });
        break;
      case "zap":
        this._tone({
          type: "sawtooth",
          freq: 1400 * pitch,
          to: 90,
          dur: 0.34,
          gain: 0.22 * v,
          filter: { type: "bandpass", freq: 1800, to: 400 },
        });
        this._tone({ type: "square", freq: 70, to: 55, dur: 0.34, gain: 0.16 * v });
        this._noise({ dur: 0.3, gain: 0.14 * v, type: "highpass", freq: 3000 });
        break;
      case "boom":
        this._noise({ dur: 0.75, gain: 0.6 * v, freq: 1400, to: 60 });
        this._tone({ type: "sine", freq: 110, to: 28, dur: 0.8, gain: 0.65 * v });
        this._tone({ type: "triangle", freq: 60, to: 30, dur: 0.6, gain: 0.3 * v });
        break;
      case "whoosh":
        this._noise({ dur: 0.22, gain: 0.16 * v, type: "bandpass", freq: 350, to: 2200, q: 1.6 });
        break;
      case "coin":
        this._tone({ type: "sine", freq: 950, dur: 0.09, gain: 0.2 * v });
        this._tone({ type: "sine", freq: 1420, dur: 0.14, gain: 0.16 * v, delay: 0.06 });
        break;
      case "ko":
        [660, 520, 392, 262].forEach((f, i) =>
          this._tone({
            type: "triangle",
            freq: f,
            dur: 0.26,
            gain: 0.2 * v,
            delay: i * 0.11,
          })
        );
        this._noise({ dur: 0.9, gain: 0.13 * v, type: "bandpass", freq: 800, to: 300, q: 0.6, delay: 0.1 });
        break;
      case "level":
        [523, 659, 784, 1046].forEach((f, i) =>
          this._tone({ type: "triangle", freq: f, dur: 0.3, gain: 0.16 * v, delay: i * 0.07 })
        );
        break;
      case "click":
        this._tone({ type: "square", freq: 620, dur: 0.035, gain: 0.08 * v });
        break;
      case "open":
        this._tone({ type: "sine", freq: 400, to: 700, dur: 0.14, gain: 0.1 * v });
        break;
      case "close":
        this._tone({ type: "sine", freq: 600, to: 320, dur: 0.14, gain: 0.1 * v });
        break;
      case "error":
        this._tone({ type: "square", freq: 220, to: 160, dur: 0.18, gain: 0.12 * v });
        break;
      case "rage":
        [180, 240, 300, 400, 520].forEach((f, i) =>
          this._tone({
            type: "sawtooth",
            freq: f,
            dur: 0.4,
            gain: 0.09 * v,
            delay: i * 0.05,
            filter: { type: "lowpass", freq: 1200 },
          })
        );
        break;
      default:
        this._tone({ type: "sine", freq: 440, dur: 0.1, gain: 0.1 });
    }
  }

  /* ── voice ───────────────────────────────────────────────────────────── */

  configureVoice(voice) {
    this.voiceConfig = { ...this.voiceConfig, ...(voice || {}) };
  }

  setPackClips(clips) {
    this.packClips = clips || {};
    // Warm the cache so the first line is instant.
    for (const [event, list] of Object.entries(this.packClips)) {
      for (const url of list) this._loadBuffer(url).catch(() => {});
      void event;
    }
  }

  async _loadBuffer(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (!this.ctx) this.init();
    if (!this.ctx) return null;
    const promise = (async () => {
      try {
        let data;
        if (key.startsWith("idb:")) {
          const blob = await loadClipBlob(key.slice(4));
          if (!blob) return null;
          data = await blob.arrayBuffer();
        } else {
          const res = await fetch(key);
          if (!res.ok) return null;
          data = await res.arrayBuffer();
        }
        return await this.ctx.decodeAudioData(data);
      } catch {
        return null;
      }
    })();
    this.buffers.set(key, promise);
    return promise;
  }

  async _playBuffer(key, volume = 0.9) {
    const buffer = await this._loadBuffer(key);
    if (!buffer || !this.ctx || !this.enabled) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.sfxBus);
    src.start();
    return true;
  }

  /** Speak a cartoon line using formant-ish synthesis. */
  say(text, { pitch = 1, rate = 1, volume = 0.5 } = {}) {
    if (!this.ctx || !this.enabled || !text) return;
    const t0 = this.ctx.currentTime + 0.01;
    let t = t0;
    const syllables = splitSyllables(text);
    let index = 0;
    for (const syl of syllables) {
      const dur = Math.min(0.22, Math.max(0.075, soundLength(syl) / (rate * 9)));
      const vowel = pickVowel(syl);
      const base = (90 + vowel.base) * pitch * (0.94 + Math.random() * 0.12);
      // glottal source
      for (const [mult, gain, formant] of [
        [1, 0.18, vowel.f1],
        [2.02, 0.09, vowel.f2],
        [3.04, 0.05, 900],
      ]) {
        const osc = this.ctx.createOscillator();
        osc.type = index % 3 === 0 ? "sawtooth" : "square";
        osc.frequency.setValueAtTime(base * mult, t);
        if (!/[!?]/.test(text) && Math.random() < 0.35) {
          osc.frequency.linearRampToValueAtTime(base * mult * (1.12 + Math.random() * 0.1), t + dur);
        }
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = formant * (0.92 + Math.random() * 0.16);
        bp.Q.value = 6;
        const amp = this.ctx.createGain();
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(gain * volume, t + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(bp).connect(amp).connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + dur + 0.03);
      }
      t += dur * 0.92;
      index += 1;
    }
  }

  /**
   * Play a voice reaction for an event.
   * Priority: user's own recording → selected voice pack → built-in synth.
   */
  async voice(event, { volume = 0.85, chance = 1 } = {}) {
    if (!this.enabled) return;
    if (Math.random() > chance) return;
    this.init();

    const custom = this.voiceConfig.type === "custom" || this.voiceConfig.useCustom;
    if (custom) {
      const played = await this._playBuffer(`idb:${event}`, volume);
      if (played) return;
    }
    if (this.voiceConfig.type === "pack" && this.packClips[event]?.length) {
      const url = pick(this.packClips[event]);
      const played = await this._playBuffer(url, volume);
      if (played) return;
    }
    if (this.voiceConfig.type !== "builtin" && !this.voiceConfig.fallback) return;

    const lang = getLang();
    const bank = PHRASES[lang] || PHRASES.en;
    const line = pick(bank[event] || bank.hit);
    if (!line) return;
    const preset = BUILTIN_VOICES.find((v) => v.id === this.voiceConfig.id) || BUILTIN_VOICES[0];
    const pitch = (this.voiceConfig.pitch || preset.pitch) * (event === "ko" ? 0.94 : 1);
    const rate = (this.voiceConfig.rate || preset.rate) * (event === "hit" ? 1.12 : 1);
    this.say(line, { pitch, rate, volume: volume * 0.55 });
  }

  /* ── music ───────────────────────────────────────────────────────────── */

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.32, this.ctx.currentTime, 1.2);
    this.step = 0;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      const bpm = 84;
      const beat = 60 / bpm / 2;
      const now = this.ctx.currentTime;
      // lazy scheduler — schedule the next 2 beats
      for (let i = 0; i < 2; i += 1) {
        const t = now + i * beat;
        const s = (this.step + i) % 16;
        this._musicStep(s, t, beat);
      }
      this.step = (this.step + 2) % 16;
      this.musicTimer = setTimeout(tick, beat * 1000);
    };
    tick();
  }

  _musicStep(step, time, beat) {
    const bus = this.musicBus;
    const tones = [0, 0, 3, 0, 5, 0, 3, 0, -2, 0, 3, 0, 5, 7, 3, 0];
    const semis = tones[step % tones.length];
    const bassRoot = 55; // A1
    if (step % 2 === 0) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = bassRoot * Math.pow(2, semis / 12);
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(320, time);
      f.frequency.exponentialRampToValueAtTime(120, time + beat * 1.6);
      f.Q.value = 4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.22, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + beat * 1.7);
      osc.connect(f).connect(g).connect(bus);
      osc.start(time);
      osc.stop(time + beat * 2);
    }
    if (step % 8 === 0 || step % 8 === 6) {
      // soft pad chord
      [220, 261.6, 329.6].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq * Math.pow(2, semis / 12);
        osc.detune.value = i === 1 ? 6 : -5;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.035, time + beat);
        g.gain.exponentialRampToValueAtTime(0.0001, time + beat * 7);
        osc.connect(g).connect(bus);
        osc.start(time);
        osc.stop(time + beat * 7.5);
      });
    }
    if (step % 4 === 2) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      src.connect(hp).connect(g).connect(bus);
      src.start(time, Math.random());
      src.stop(time + 0.1);
    }
  }

  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }
  }

  setMusicEnabled(on) {
    if (on) {
      this.init();
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }
}

/* ── gibberish helpers ─────────────────────────────────────────────────── */

const VOWELS = [
  { base: 320, f1: 730, f2: 1090 }, // a
  { base: 250, f1: 530, f2: 1840 }, // e
  { base: 290, f1: 270, f2: 2290 }, // i
  { base: 230, f1: 570, f2: 840 }, // o
  { base: 260, f1: 300, f2: 870 }, // u
];

const pickVowel = (syl) => {
  const match = syl.match(/[aeiouyáéíóúäöüàèìòù]/i);
  if (!match) return VOWELS[1];
  const map = "aeiou";
  const idx = map.indexOf(match[0].toLowerCase());
  return idx >= 0 ? VOWELS[idx] : VOWELS[Math.floor(Math.random() * VOWELS.length)];
};

const soundLength = (syl) => (syl.match(/[aeiouyáéíóúäöüàèìòù]/gi) || []).length || 1;

function splitSyllables(text) {
  const words = String(text)
    .replace(/[^\p{L}\p{N}\s!?¡¿,.'-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  const chunks = [];
  for (const word of words) {
    const clean = word.replace(/[!?.,¡¿]/g, "");
    if (!clean) continue;
    const parts = clean.match(/[^\saeiouyáéíóúäöüàèìòù]*[aeiouyáéíóúäöüàèìòù]+[^aeiouyáéíóúäöüàèìòù]*/gi);
    if (parts) chunks.push(...parts.slice(0, 4));
    else chunks.push(clean);
    if (chunks.length > 14) break;
  }
  return chunks.length ? chunks : ["hey"];
}

export const audio = new AudioEngine();
