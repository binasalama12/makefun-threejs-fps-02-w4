// audio.js — every sound in Cinder Foundry is synthesised live with the
// Web Audio API: short oscillator blips for gunfire, filtered noise for
// the scattergun and explosions, and low foundry rumbles for round events.
// No audio files are shipped or fetched.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  // Audio contexts may only start after a user gesture; the menu click
  // that requests pointer lock is our gesture in live play.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  tone(freqA, freqB, seconds, type, gainPeak) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t + seconds);
    gain.gain.setValueAtTime(gainPeak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  noise(seconds, filterFreq, gainPeak, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  shot(kind) {
    if (kind === 'scatter') {
      this.noise(0.22, 900, 0.9);
      this.tone(160, 50, 0.18, 'square', 0.4);
    } else if (kind === 'longshot') {
      this.noise(0.3, 2400, 0.7, 'bandpass');
      this.tone(220, 40, 0.3, 'sawtooth', 0.5);
    } else {
      this.noise(0.09, 1800, 0.45, 'highpass');
      this.tone(320, 90, 0.09, 'square', 0.35);
    }
  }

  enemyShot() {
    this.noise(0.07, 1200, 0.2, 'highpass');
    this.tone(240, 80, 0.08, 'square', 0.16);
  }

  hit(head) {
    this.tone(head ? 1250 : 880, head ? 900 : 660, 0.07, 'sine', 0.4);
  }

  hurt() {
    this.tone(140, 70, 0.16, 'sawtooth', 0.4);
  }

  reload() {
    this.tone(500, 300, 0.06, 'square', 0.2);
    setTimeout(() => this.tone(700, 420, 0.06, 'square', 0.2), 130);
  }

  dryFire() {
    this.tone(1400, 1100, 0.04, 'square', 0.15);
  }

  explosion(big) {
    this.noise(big ? 1.4 : 0.7, 220, 1.0);
    this.tone(90, 28, big ? 1.2 : 0.6, 'sine', 0.9);
  }

  plantBeep(done) {
    this.tone(done ? 1320 : 880, done ? 1320 : 880, done ? 0.3 : 0.09, 'sine', 0.35);
  }

  roundWin() {
    this.tone(523, 523, 0.14, 'triangle', 0.4);
    setTimeout(() => this.tone(784, 784, 0.22, 'triangle', 0.4), 140);
  }

  roundLose() {
    this.tone(392, 392, 0.16, 'triangle', 0.35);
    setTimeout(() => this.tone(262, 240, 0.3, 'triangle', 0.35), 160);
  }

  buy() {
    this.tone(990, 990, 0.06, 'sine', 0.3);
    setTimeout(() => this.tone(1320, 1320, 0.09, 'sine', 0.3), 70);
  }

  denied() {
    this.tone(220, 180, 0.12, 'square', 0.25);
  }
}
