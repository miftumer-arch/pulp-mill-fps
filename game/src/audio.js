// Procedural WebAudio: every sound is synthesized, no audio files.
// The context starts on the first user gesture; all calls guard for it.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gain, type = 'sine', when = 0, slideTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SHOT = {
    rifle: () => { noise(0.14, 900, 0.9); tone(160, 0.1, 0.5, 'square', 0, 60); },
    smg: () => { noise(0.09, 1400, 0.7); tone(200, 0.06, 0.35, 'square', 0, 90); },
    shotgun: () => { noise(0.24, 600, 1.0); tone(110, 0.18, 0.7, 'square', 0, 45); },
    pistol: () => { noise(0.08, 1800, 0.65); tone(240, 0.05, 0.3, 'square', 0, 110); },
  };

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(defId, distant = false) {
      if (!ensure()) return;
      if (distant) { noise(0.12, 500, 0.22); return; }
      (SHOT[defId] || SHOT.rifle)();
    },
    reload() {
      if (!ensure()) return;
      tone(1400, 0.03, 0.25, 'square');
      tone(900, 0.03, 0.25, 'square', 0.35);
      tone(1100, 0.04, 0.3, 'square', 0.8);
    },
    dryFire() { if (ensure()) tone(1800, 0.03, 0.2, 'square'); },
    hit(headshot) {
      if (!ensure()) return;
      tone(headshot ? 1500 : 1100, 0.06, 0.35, 'sine');
    },
    kill() {
      if (!ensure()) return;
      tone(880, 0.08, 0.3, 'sine');
      tone(1320, 0.1, 0.3, 'sine', 0.08);
    },
    hurt() {
      if (!ensure()) return;
      noise(0.12, 300, 0.5);
      tone(90, 0.14, 0.4, 'sine', 0, 55);
    },
    step() { if (ensure()) noise(0.05, 400, 0.08); },
    beep(final = false) {
      if (!ensure()) return;
      tone(final ? 1400 : 990, 0.09, 0.3, 'sine');
    },
    plant() {
      if (!ensure()) return;
      tone(660, 0.1, 0.3, 'sine');
      tone(990, 0.12, 0.3, 'sine', 0.12);
    },
    explosion() {
      if (!ensure()) return;
      noise(1.1, 240, 1.0);
      tone(70, 0.9, 0.9, 'sine', 0, 30);
      noise(0.4, 3000, 0.4, 'highpass', 0.02);
    },
    defuseTick() { if (ensure()) tone(1200, 0.05, 0.2, 'sine'); },
    roundWin() {
      if (!ensure()) return;
      tone(523, 0.14, 0.3, 'sine');
      tone(659, 0.14, 0.3, 'sine', 0.13);
      tone(784, 0.24, 0.32, 'sine', 0.26);
    },
    roundLose() {
      if (!ensure()) return;
      tone(392, 0.16, 0.3, 'sine');
      tone(330, 0.16, 0.3, 'sine', 0.15);
      tone(262, 0.3, 0.3, 'sine', 0.3);
    },
    buy() {
      if (!ensure()) return;
      tone(740, 0.05, 0.25, 'sine');
      tone(988, 0.07, 0.25, 'sine', 0.05);
    },
    click() { if (ensure()) tone(1000, 0.04, 0.2, 'sine'); },
    smoke() { if (ensure()) noise(0.5, 800, 0.35, 'bandpass'); },
  };
}
