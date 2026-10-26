// Casino sound kit, synthesized live with Web Audio; nothing is downloaded.
window.Sound = (() => {
  const TAU = Math.PI * 2;
  let ctx = null, out = null, noise = null, rollBuf = null, roll = null, lastTick = 0, enabled = true;

  function init() {
    if (!enabled) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.ratio.value = 4;
        out = ctx.createGain();
        out.gain.value = 0.85;
        out.connect(comp).connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        rollBuf = makeRoll();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch { ctx = null; }
  }
  const live = () => enabled && ctx;

  function tone(freq, t, { type = 'sine', peak = 0.2, attack = 0.005, decay = 0.3, to = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  function hiss(t, { type = 'bandpass', freq = 2000, q = 1, peak = 0.3, attack = 0.002, decay = 0.05, to = 0 } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.8);
    s.stop(t + attack + decay + 0.05);
  }

  function bell(t, f, peak = 0.18) {
    tone(f, t, { peak, attack: 0.006, decay: 1.4 });
    tone(f * 2.76, t, { peak: peak * 0.3, attack: 0.004, decay: 0.6 });
    tone(f * 5.4, t, { peak: peak * 0.1, attack: 0.003, decay: 0.25 });
  }

  // A snare roll, 18 strokes a second with alternating hands. Each stroke is a short noise crack
  // over a drum-shell thump. Rendered once into a 2-second buffer that loops without a seam.
  function makeRoll() {
    const sr = ctx.sampleRate, rate = 18, len = sr * 2;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const span = Math.floor(sr * 0.09);
    for (let k = 0; k < rate * 2; k++) {
      const start = Math.floor((k / rate + (Math.random() - 0.5) * 0.008) * sr);
      const amp = (k % 2 ? 0.75 : 1) * (0.85 + Math.random() * 0.15);
      for (let i = 0; i < span; i++) {
        const tt = i / sr;
        const crack = (Math.random() * 2 - 1) * Math.exp(-tt / 0.016);
        const shell = Math.sin(TAU * 185 * tt) * Math.exp(-tt / 0.025) * 0.5;
        d[(start + i + len) % len] += amp * 0.45 * (crack + shell);
      }
    }
    return buf;
  }

  // Flapper hitting a peg: a short woody clack at a steady pitch. It goes soft while the pegs
  // fly past and lands with full weight once the wheel slows, the way a real flapper does.
  function tick() {
    if (!live()) return;
    const t = ctx.currentTime;
    const gap = t - lastTick;
    if (gap < 0.03) return;
    lastTick = t;
    const weight = 0.3 + 0.7 * Math.min(1, Math.max(0, (gap - 0.03) / 0.15));
    const vary = 1 + (Math.random() - 0.5) * 0.06;
    hiss(t, { freq: 3200 * vary, q: 2.2, peak: 0.6 * weight, decay: 0.028 });
    tone(880 * vary, t, { peak: 0.12 * weight, attack: 0.001, decay: 0.025 });
  }

  // Lever clunk, then a coin-op arpeggio
  function spinStart() {
    if (!live()) return;
    const t = ctx.currentTime + 0.01;
    tone(160, t, { peak: 0.5, decay: 0.2, to: 45 });
    hiss(t, { freq: 800, q: 0.8, peak: 0.3, decay: 0.09 });
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
      tone(f, t + 0.1 + i * 0.05, { type: 'square', peak: 0.05, decay: 0.11 }));
  }

  // Drumroll that swells and tightens as the wheel slows
  function rollStart(seconds) {
    if (!live() || !rollBuf) return;
    rollStop();
    const t = ctx.currentTime;
    const end = t + Math.max(0.6, seconds);
    const s = ctx.createBufferSource();
    s.buffer = rollBuf;
    s.loop = true;
    s.playbackRate.setValueAtTime(0.92, t);
    s.playbackRate.linearRampToValueAtTime(1.12, end);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.32, end);
    s.connect(hp).connect(lp).connect(g).connect(out);
    s.start(t, Math.random() * 2);
    roll = { s, g };
  }

  // Fade from wherever the swell has reached; reading gain.value mid-ramp is unreliable across browsers
  function rollStop() {
    if (!roll || !ctx) return;
    const { s, g } = roll;
    roll = null;
    const t = ctx.currentTime;
    if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
    else g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.03);
    s.stop(t + 0.25);
  }

  // Crash, bell, fanfare and a shower of coins
  function win() {
    if (!live()) return;
    const t = ctx.currentTime + 0.01;
    tone(90, t, { peak: 0.55, decay: 0.4, to: 40 });
    hiss(t, { type: 'highpass', freq: 5200, q: 0.4, peak: 0.3, decay: 1.5 });
    bell(t, 1046.5);
    bell(t + 0.14, 1318.5);
    const run = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5, 1568];
    run.forEach((f, i) => tone(f, t + 0.12 + i * 0.065, { type: 'square', peak: 0.055, decay: 0.13 }));
    const chordAt = t + 0.12 + run.length * 0.065;
    [523.25, 659.25, 783.99, 1046.5].forEach(f => {
      tone(f, chordAt, { type: 'triangle', peak: 0.06, attack: 0.02, decay: 1.3, detune: -7 });
      tone(f, chordAt, { type: 'triangle', peak: 0.06, attack: 0.02, decay: 1.3, detune: 7 });
      tone(f * 2, chordAt, { type: 'square', peak: 0.012, attack: 0.02, decay: 0.9 });
    });
    for (let i = 0; i < 30; i++) {
      const ct = t + 0.25 + Math.random() * 1.9;
      const f = 2400 + Math.random() * 2600;
      tone(f, ct, { peak: 0.045, decay: 0.12 });
      tone(f * 1.5, ct + 0.01, { type: 'triangle', peak: 0.02, decay: 0.08 });
    }
  }

  // Swish down and a thud as the slice comes off. The thud is skipped when a spin follows,
  // since it would land right on top of the lever clunk.
  function whoosh(thud = true) {
    if (!live()) return;
    const t = ctx.currentTime;
    hiss(t, { freq: 3200, to: 260, q: 2, peak: 0.35, attack: 0.04, decay: 0.38 });
    if (thud) tone(75, t + 0.34, { peak: 0.5, decay: 0.28, to: 38 });
  }

  // Two poker chips knocking together
  function chip(up = true) {
    if (!live()) return;
    const t = ctx.currentTime;
    hiss(t, { type: 'highpass', freq: 3800, peak: 0.35, decay: 0.022 });
    hiss(t + 0.05, { type: 'highpass', freq: 4400, peak: 0.22, decay: 0.03 });
    tone(up ? 1900 : 1300, t, { type: 'triangle', peak: 0.035, decay: 0.07 });
  }

  // Card riffle for the shuffle
  function riffle() {
    if (!live()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 26; i++) {
      hiss(t + i * 0.016 + Math.random() * 0.006, { freq: 3000 + Math.random() * 1500, q: 1.5, peak: 0.18, decay: 0.018 });
    }
    hiss(t + 0.45, { freq: 900, q: 0.8, peak: 0.25, decay: 0.06 });
  }

  // Two-note chime when a name goes back on the wheel
  function bling() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(1568, t, { type: 'square', peak: 0.045, decay: 0.1 });
    tone(2093, t + 0.07, { type: 'square', peak: 0.045, decay: 0.16 });
  }

  // Low buzzer when there is nothing to spin
  function buzz() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(110, t, { type: 'square', peak: 0.07, decay: 0.3 });
    tone(116, t, { type: 'square', peak: 0.07, decay: 0.3 });
  }

  /* ---------- chaos mode ---------- */

  let shaperCurve = null;
  function grit() {
    if (!shaperCurve) {
      shaperCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) shaperCurve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3);
    }
    return shaperCurve;
  }

  function horn(t, len) {
    const pre = ctx.createGain();
    pre.gain.value = 0.35;
    const shaper = ctx.createWaveShaper();
    shaper.curve = grit();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.025);
    g.gain.setValueAtTime(0.14, t + len - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    pre.connect(shaper).connect(lp).connect(g).connect(out);
    for (const f of [370, 373, 466, 554]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.92, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      o.connect(pre);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  // Air horn: BWAAA BWA BWAAAAA
  function airhorn() {
    if (!live()) return;
    const t = ctx.currentTime + 0.02;
    horn(t, 0.32);
    horn(t + 0.4, 0.13);
    horn(t + 0.6, 0.75);
  }

  // Wah wah wah waaaah
  function sadTrombone() {
    if (!live()) return;
    const t = ctx.currentTime + 0.05;
    [[293.66, 0, 0.3], [277.18, 0.34, 0.3], [261.63, 0.68, 0.3], [246.94, 1.02, 1.1]].forEach(([f, dt, len], i) => {
      const s = t + dt;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, s);
      if (i === 3) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, s);
        depth.gain.linearRampToValueAtTime(f * 0.025, s + 0.3);
        lfo.connect(depth).connect(o.frequency);
        lfo.start(s);
        lfo.stop(s + len + 0.05);
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 5;
      lp.frequency.setValueAtTime(350, s);
      lp.frequency.exponentialRampToValueAtTime(1500, s + Math.min(0.15, len * 0.4));
      lp.frequency.exponentialRampToValueAtTime(450, s + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.16, s + 0.03);
      g.gain.setValueAtTime(0.16, s + len - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, s + len);
      o.connect(lp).connect(g).connect(out);
      o.start(s);
      o.stop(s + len + 0.05);
    });
  }

  // Hitmarker tink on the last slow pegs
  function hit() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(2600, t, { type: 'square', peak: 0.03, attack: 0.001, decay: 0.03 });
    hiss(t, { type: 'highpass', freq: 6000, peak: 0.12, decay: 0.02 });
  }

  // Bubble pop on every click
  function pop() {
    if (!live()) return;
    tone(520 + Math.random() * 200, ctx.currentTime, { peak: 0.12, attack: 0.002, decay: 0.06, to: 1400 });
  }

  // Firework: rising whistle, then a bang with crackle
  function whistle() {
    if (!live()) return;
    tone(700 + Math.random() * 300, ctx.currentTime, { peak: 0.035, attack: 0.05, decay: 0.55, to: 2600 });
  }
  let lastBang = 0;
  function bang() {
    if (!live()) return;
    const t = ctx.currentTime;
    if (t - lastBang < 0.06) return;
    lastBang = t;
    hiss(t, { type: 'lowpass', freq: 1400, q: 0.5, peak: 0.45, decay: 0.45 });
    tone(70, t, { peak: 0.4, decay: 0.3, to: 35 });
    for (let i = 0; i < 6; i++) hiss(t + 0.15 + Math.random() * 0.5, { type: 'highpass', freq: 4000, peak: 0.08, decay: 0.05 });
  }

  // The browser's text-to-speech voice, pitched up for hype
  function say(text, pitch = 1.25, rate = 1.05) {
    if (!enabled || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = pitch;
      u.rate = rate;
      speechSynthesis.speak(u);
    } catch {}
  }

  function setEnabled(on) {
    enabled = on;
    if (on) return;
    rollStop();
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  return {
    init, setEnabled, tick, spinStart, rollStart, rollStop, win, whoosh, chip, riffle, bling, buzz,
    airhorn, sadTrombone, hit, pop, whistle, bang, say,
  };
})();
