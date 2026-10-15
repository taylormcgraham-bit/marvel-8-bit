/**
 * Chiptune score and sound effects with the Web Audio API: a tiny sequencer with square,
 * triangle and noise voices, mood-based progressions per location and situation, short
 * leitmotif stings per character, and UI/combat effects. Starts on the first click or key
 * (browser autoplay rules); muted with M.
 */

type Mood = "rooftop" | "street" | "lounge" | "castle" | "fight" | "title" | "quiet";

const NOTE: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const freq = (n: string, oct: number) => 440 * Math.pow(2, (NOTE[n]! + (oct - 4) * 12 - 9) / 12);

/** Progressions as [root, minor?] per bar, plus a bass pattern and tempo. */
const MOODS: Record<Mood, { bpm: number; bars: [string, boolean][]; lead: string[]; wave: OscillatorType; swing: number }> = {
  rooftop: { bpm: 92, bars: [["A", true], ["F", false], ["C", false], ["G", false]], lead: ["E", "G", "A", "B", "A", "G", "E", "D"], wave: "triangle", swing: 0.1 },
  street: { bpm: 118, bars: [["C", false], ["A", true], ["F", false], ["G", false]], lead: ["C", "E", "G", "E", "A", "G", "E", "D"], wave: "square", swing: 0.08 },
  lounge: { bpm: 84, bars: [["F", false], ["E", true], ["D", true], ["G", false]], lead: ["A", "C", "E", "C", "D", "F", "E", "C"], wave: "triangle", swing: 0.15 },
  castle: { bpm: 76, bars: [["D", true], ["A#", false], ["G", true], ["A", false]], lead: ["D", "F", "A", "D", "C", "A#", "A", "F"], wave: "square", swing: 0 },
  fight: { bpm: 150, bars: [["E", true], ["C", false], ["D", false], ["E", true]], lead: ["E", "G", "B", "E", "D", "B", "G", "E"], wave: "square", swing: 0 },
  title: { bpm: 110, bars: [["C", false], ["G", false], ["A", true], ["F", false]], lead: ["G", "C", "E", "G", "C", "E", "G", "C"], wave: "square", swing: 0 },
  quiet: { bpm: 70, bars: [["A", true], ["A", true], ["F", false], ["G", false]], lead: ["E", "", "A", "", "C", "", "B", ""], wave: "triangle", swing: 0.2 },
};

/** Short leitmotifs (semitone intervals from a root) per character id. */
const MOTIFS: Record<string, { root: string; steps: number[]; wave: OscillatorType }> = {
  "spider-man": { root: "G", steps: [0, 4, 7, 12, 7, 4, 0, 2], wave: "square" },
  "captain-america": { root: "C", steps: [0, 7, 12, 7, 9, 7, 4, 0], wave: "square" },
  "iron-man": { root: "E", steps: [0, 3, 7, 10, 7, 3, 0, -2], wave: "sawtooth" },
  "thor": { root: "D", steps: [0, 7, 0, 7, 12, 10, 7, 5], wave: "square" },
  "hulk": { root: "C", steps: [0, 0, 3, 0, 0, 5, 3, 0], wave: "sawtooth" },
  "daredevil": { root: "A", steps: [0, 3, 5, 3, 0, -2, 0, 3], wave: "triangle" },
  "green-goblin": { root: "F#", steps: [0, 1, 0, 1, 6, 5, 6, 12], wave: "square" },
  "doctor-doom": { root: "D", steps: [0, -1, 0, 3, 0, -1, 0, 7], wave: "sawtooth" },
  "loki": { root: "B", steps: [0, 2, 3, 6, 3, 2, 0, -1], wave: "triangle" },
  "kingpin": { root: "C", steps: [0, 0, 0, -1, 0, 0, 0, -3], wave: "sawtooth" },
  "doctor-octopus": { root: "E", steps: [0, 1, 0, 1, 0, 1, 3, 1], wave: "square" },
  "red-skull": { root: "C", steps: [0, 6, 0, 6, 1, 7, 1, 0], wave: "square" },
};

export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private mood: Mood = "quiet";
  private nextBar = 0;
  private bar = 0;
  private timer?: number;
  muted = false;
  enabled = false;

  /** Call from a user gesture. */
  start() {
    if (this.enabled) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.35; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.6; this.sfxGain.connect(this.master);
    this.enabled = true;
    this.nextBar = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 200);
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; }

  setMood(m: Mood) { if (m !== this.mood) { this.mood = m; this.bar = 0; } }
  moodFor(mapKind: string, region: string): Mood { if (region === "latveria") return "castle"; if (mapKind === "interior") return "lounge"; if (mapKind === "street") return "street"; return "rooftop"; }

  private schedule() {
    if (!this.ctx || !this.musicGain) return;
    const m = MOODS[this.mood];
    const barLen = (60 / m.bpm) * 4;
    while (this.nextBar < this.ctx.currentTime + 0.6) {
      const [root, minor] = m.bars[this.bar % m.bars.length]!;
      const t0 = this.nextBar;
      const step = barLen / 8;
      // bass: root on 1 and 3, fifth on 2 and 4
      for (let i = 0; i < 8; i++) { const n = i % 4 === 2 ? 7 : i % 2 ? (minor ? 3 : 4) : 0; if (i % 2 === 0 || this.mood === "fight") this.tone(this.semis(root, n, 2), t0 + i * step + (i % 2 ? m.swing * step : 0), step * 0.9, "triangle", 0.25, this.musicGain); }
      // lead
      for (let i = 0; i < 8; i++) { const ln = m.lead[(i + this.bar * 2) % m.lead.length]!; if (!ln) continue; const f = freq(ln, this.mood === "castle" ? 3 : 4); this.tone(f, t0 + i * step + (i % 2 ? m.swing * step : 0), step * 0.6, m.wave, this.mood === "quiet" ? 0.08 : 0.12, this.musicGain); }
      // chord pad on beats 1 and 3
      for (const b of [0, 4]) { for (const n of [0, minor ? 3 : 4, 7]) this.tone(this.semis(root, n, 3), t0 + b * step, step * 3.6, "triangle", 0.05, this.musicGain); }
      // hats / kick
      for (let i = 0; i < 8; i++) { if (i % 4 === 0) this.kick(t0 + i * step); if (i % 2 === 1 || this.mood === "fight" || this.mood === "street") this.hat(t0 + i * step, i % 4 === 3 ? 0.06 : 0.03); }
      this.nextBar += barLen; this.bar++;
    }
  }
  private semis(root: string, n: number, oct: number) { return freq(root, oct) * Math.pow(2, n / 12); }

  private tone(f: number, t: number, dur: number, wave: OscillatorType, vol: number, out: AudioNode) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = wave; o.frequency.value = f;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  private kick(t: number) { if (!this.ctx || !this.musicGain) return; const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); const g = this.ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.16); }
  private noise(t: number, dur: number, vol: number, out: AudioNode, hp = 3000) {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + dur);
  }
  private hat(t: number, vol: number) { if (this.musicGain) this.noise(t, 0.04, vol, this.musicGain, 6000); }

  /* ---- stings and effects */
  motif(id: string) {
    if (!this.ctx || !this.sfxGain) return;
    const m = MOTIFS[id] ?? { root: "C", steps: [0, 4, 7, 12], wave: "square" as OscillatorType };
    const t0 = this.ctx.currentTime + 0.02;
    m.steps.forEach((s, i) => this.tone(this.semis(m.root, s, 4), t0 + i * 0.11, 0.12, m.wave, 0.14, this.sfxGain!));
  }
  hit(big: boolean) { if (!this.ctx || !this.sfxGain) return; const t = this.ctx.currentTime; this.noise(t, big ? 0.22 : 0.12, big ? 0.5 : 0.3, this.sfxGain, 800); const o = this.ctx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(big ? 180 : 240, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15); const g = this.ctx.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.2); }
  miss() { if (!this.ctx || !this.sfxGain) return; this.noise(this.ctx.currentTime, 0.18, 0.15, this.sfxGain, 2500); }
  blip() { if (!this.ctx || !this.sfxGain) return; this.tone(880, this.ctx.currentTime, 0.03, "square", 0.05, this.sfxGain); }
  sting(kind: "fight" | "ko" | "objective" | "act" | "recap") {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + 0.02;
    const seq: [string, number][] = kind === "fight" ? [["E", 4], ["E", 4], ["G", 4], ["B", 4]] : kind === "ko" ? [["C", 5], ["G", 4], ["E", 4], ["C", 4]] : kind === "objective" ? [["C", 5], ["E", 5], ["G", 5]] : kind === "act" ? [["C", 4], ["G", 4], ["C", 5]] : [["A", 4], ["C", 5], ["E", 5], ["A", 5]];
    seq.forEach(([n, o], i) => this.tone(freq(n, o), t0 + i * 0.12, 0.2, "square", 0.16, this.sfxGain!));
  }
  swoosh() { if (!this.ctx || !this.sfxGain) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.4); const g = this.ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.5); }
}
