// Solmar Bay 2 — sound: everything is synthesized with WebAudio. No audio
// files, no network. Engine hum, sirens, gunshots, pickup blips, and three
// lo-fi radio stations that sequence little melodies on the fly.

import { RADIO } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let station = 0;
  let radioTimer = null;
  let step = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch { /* best-effort */ }
  }

  const sfx = {
    shoot() { noise(0.12, 0.5, 2400); tone(160, 0.08, 'square', 0.12, 60); },
    shotgun() { noise(0.25, 0.6, 900); },
    hit() { tone(320, 0.08, 'square', 0.15, 180); },
    pickup() { tone(660, 0.1, 'sine', 0.2); setTimeout(() => tone(990, 0.14, 'sine', 0.2), 90); },
    cash() { tone(880, 0.09, 'sine', 0.2); setTimeout(() => tone(1174, 0.09, 'sine', 0.2), 80); setTimeout(() => tone(1568, 0.18, 'sine', 0.2), 160); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 110)); },
    fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.12), i * 130)); },
    crash() { noise(0.3, 0.5, 500); },
    busted() { [440, 415, 392].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sawtooth', 0.15), i * 200)); },
    click() { tone(700, 0.05, 'square', 0.1); },
    door() { noise(0.15, 0.25, 800); tone(180, 0.12, 'triangle', 0.12, 90); },
  };

  function engineStart() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 320;
      engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    } catch { /* best-effort */ }
  }

  function engineSet(speedNorm, driving) {
    if (!engineOsc || !engineGain) return;
    const target = driving ? 0.05 + speedNorm * 0.09 : 0.0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, ctx.currentTime, 0.08);
  }

  function sirenStart() {
    if (!ensure() || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start(); lfo.start();
    } catch { /* best-effort */ }
  }

  function sirenStop() {
    if (!sirenOsc) return;
    try { sirenOsc.stop(); } catch { /* already stopped */ }
    sirenOsc = null;
  }

  function radioNote(freq, dur) {
    tone(freq, dur, 'triangle', 0.12);
    tone(freq / 2, dur, 'sine', 0.06);
  }

  function radioTick() {
    if (!ensure() || muted) return;
    const st = RADIO[station];
    const beat = 60 / st.bpm / 2;
    const scale = st.mode;
    const idx = [0, 2, 1, 3, 4, 2, 0, 3][step % 8];
    const f = st.root * Math.pow(2, scale[idx % scale.length] / 12) * (step % 16 >= 8 ? 2 : 1);
    radioNote(f, beat * 0.9);
    if (step % 4 === 0) tone(st.root / 2, beat * 2, 'sine', 0.14);
    step++;
    radioTimer = setTimeout(radioTick, beat * 1000);
  }

  function radioStart() {
    if (radioTimer) return;
    step = 0;
    radioTick();
  }

  function radioStop() {
    if (radioTimer) { clearTimeout(radioTimer); radioTimer = null; }
  }

  function nextStation() {
    station = (station + 1) % RADIO.length;
    return RADIO[station].name;
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
    if (m) radioStop();
  }

  return {
    resume, ensure, sfx, engineStart, engineSet, sirenStart, sirenStop,
    radioStart, radioStop, nextStation, setMuted,
    get muted() { return muted; },
    get stationName() { return RADIO[station].name; },
  };
}
