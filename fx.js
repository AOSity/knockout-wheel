// Casino effects, drawn on two full-screen canvases.
// Behind the page: searchlights, jackpot rays, drifting suits and chips; in chaos mode also lasers,
// disco-ball spots and a bouncing SPIN ME logo.
// In front: peg sparks, the coin/chip/confetti shower, the KNOCKOUT banner and dust puffs; in chaos
// mode also hype words, fireworks, emoji rain, hitmarkers, cursor glitter and click bursts.
window.FX = (() => {
  const TAU = Math.PI * 2;
  const bg = document.getElementById('fxBg');
  const fg = document.getElementById('fxFg');
  const bctx = bg.getContext('2d');
  const fctx = fg.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const backOut = p => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
  const DISPLAY = 'Shrikhand, "Cooper Black", Georgia, serif';

  let W = 0, H = 0, dpr = 1;
  let mode = 'idle', modeAt = 0, speed = 0, chaos = true, chroma = false, anchor = null;
  let beamPhase = 0, burstRot = 0, laserPhase = 0, discoRot = 0, wordClock = 1;
  let flash = 0, fgDirty = false, last = performance.now();
  const ambient = [], sparks = [], pieces = [], banners = [], words = [], rockets = [], marks = [], rings = [];
  const hooks = {};

  // ︎ keeps the suits as text glyphs instead of emoji
  const SUITS = [['♠︎', '#f1e6cc'], ['♥︎', '#d0453a'], ['♦︎', '#d0453a'], ['♣︎', '#f1e6cc']];
  const CONFETTI = ['#b3261e', '#f1e6cc', '#1d3557', '#d9a441', '#5e2750', '#f2d38a'];
  // Chaos hues: pink, cyan, yellow, purple, orange. No greens, so a chroma key keeps them.
  const NEON = [320, 190, 50, 275, 18];
  const WORDS = ['POG', "LET'S GOOO", 'SHEEESH', 'NO WAY', 'W', 'BIG W', 'OMG', 'INSANE', 'CLUTCH', 'HYPE', 'GG',
    'JACKPOT??', 'WHAT', 'BRO', 'NOT RIGGED', 'SPIN TO WIN', 'NO REFUNDS', '+1000 AURA', 'GOATED', 'CHAT IS THIS REAL',
    'RIGGED?!', 'NO SHOT'];
  const EMOJI = ['🔥', '💰', '👑', '💀', '😂', '🎰', '💯', '🤑', '😱', '🚀', '💎', '🎉'];

  /* ---------- sprites, painted once ---------- */

  function sprite(size, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size / 2);
    return c;
  }
  const COIN = sprite(64, (g, r) => {
    const grd = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    grd.addColorStop(0, '#fff3c4');
    grd.addColorStop(0.45, '#f2c94c');
    grd.addColorStop(1, '#a8741a');
    g.fillStyle = grd;
    g.beginPath(); g.arc(r, r, r - 1, 0, TAU); g.fill();
    g.strokeStyle = '#8a5f17';
    g.lineWidth = 3;
    g.beginPath(); g.arc(r, r, r * 0.72, 0, TAU); g.stroke();
    g.fillStyle = '#8a5f17';
    g.font = `700 ${r}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★︎', r, r + 2);
  });
  const CHIPS = ['#b3261e', '#1d3557', '#5e2750', '#1b130c'].map(col => sprite(64, (g, r) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(r, r, r - 1, 0, TAU); g.fill();
    g.fillStyle = '#f1e6cc';
    for (let k = 0; k < 6; k++) {
      g.save();
      g.translate(r, r);
      g.rotate((k * TAU) / 6);
      g.fillRect(-r * 0.13, -r + 1, r * 0.26, r * 0.24);
      g.restore();
    }
    g.strokeStyle = 'rgba(241, 230, 204, 0.85)';
    g.lineWidth = 2;
    g.setLineDash([4, 4]);
    g.beginPath(); g.arc(r, r, r * 0.62, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.beginPath(); g.arc(r, r, r * 0.5, 0, TAU); g.fill();
  }));
  const emojiCache = new Map();
  function emojiSprite(ch) {
    if (!emojiCache.has(ch)) {
      emojiCache.set(ch, sprite(72, (g, r) => {
        g.font = `${r * 1.5}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(ch, r, r * 1.08);
      }));
    }
    return emojiCache.get(ch);
  }

  /* ---------- layout ---------- */

  const dvd = { x: 60, y: 60, vx: 130, vy: 95, hue: 320, hitX: -9, hitY: -9 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    for (const c of [bg, fg]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    fgDirty = true;
    seedAmbient();
    dvd.x = rnd(0, W * 0.6);
    dvd.y = rnd(0, H * 0.6);
  }

  function center() {
    if (!anchor) return { x: W / 2, y: H / 2, r: 0, top: H / 2 };
    const b = anchor.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2, top: b.top };
  }

  /* ---------- behind the page ---------- */

  function newAmbient(y) {
    const roll = Math.random();
    const kind = roll < 0.5 ? 'suit' : roll < 0.72 ? 'chip' : 'dust';
    const [glyph, tint] = pick(SUITS);
    return {
      kind, glyph, tint, chip: pick(CHIPS),
      x: rnd(0, W), y: y ?? rnd(0, H),
      vx: rnd(-5, 5), vy: kind === 'dust' ? rnd(-14, -4) : rnd(-22, -8),
      rot: rnd(0, TAU), vr: rnd(-0.5, 0.5), flip: rnd(0, TAU), tw: rnd(0, TAU),
      size: kind === 'suit' ? rnd(18, 54) : kind === 'chip' ? rnd(16, 30) : rnd(1.2, 2.6),
    };
  }
  function seedAmbient() {
    ambient.length = 0;
    const n = Math.round(Math.min(46, Math.max(18, (W * H) / 30000)));
    for (let i = 0; i < n; i++) ambient.push(newAmbient());
  }

  function drawAmbient(dt) {
    const boost = 1 + speed * 7;
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    for (const p of ambient) {
      p.x += p.vx * dt * boost;
      p.y += p.vy * dt * boost;
      p.rot += p.vr * dt * boost;
      p.flip += dt * 1.4 * boost;
      p.tw += dt * 3;
      if (p.y < -60) Object.assign(p, newAmbient(H + 40));
      if (p.x < -60) p.x = W + 50; else if (p.x > W + 60) p.x = -50;
      bctx.save();
      bctx.translate(p.x, p.y);
      if (p.kind === 'dust') {
        bctx.globalCompositeOperation = 'lighter';
        bctx.globalAlpha = 0.25 + 0.25 * Math.sin(p.tw);
        bctx.fillStyle = '#f2d38a';
        bctx.beginPath(); bctx.arc(0, 0, p.size, 0, TAU); bctx.fill();
      } else if (p.kind === 'chip') {
        bctx.rotate(p.rot);
        bctx.scale(Math.abs(Math.cos(p.flip)) * 0.9 + 0.1, 1);
        bctx.globalAlpha = 0.14;
        bctx.drawImage(p.chip, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        bctx.rotate(p.rot);
        bctx.globalAlpha = 0.09;
        bctx.fillStyle = p.tint;
        bctx.font = `${p.size}px Georgia, "Times New Roman", serif`;
        bctx.fillText(p.glyph, 0, 0);
      }
      bctx.restore();
    }
  }

  // Three searchlights: they sweep while idle, race while spinning, and lock onto the wheel on a win
  function drawBeams(dt, c) {
    beamPhase += dt * (mode === 'spin' ? 1.2 + speed * 2.5 : 0.3);
    const now = performance.now();
    const alpha = mode === 'spin' ? 0.09 + speed * 0.06 : mode === 'win' ? 0.12 + 0.03 * Math.sin(now / 90) : 0.05;
    const L = Math.hypot(W, H) * 1.2;
    bctx.save();
    bctx.globalCompositeOperation = 'lighter';
    for (const [ox, oy, off] of [[W * 0.06, H + 40, 0], [W * 0.94, H + 40, 2.1], [W * 0.5, -40, 4.2]]) {
      const aim = Math.atan2(c.y - oy, c.x - ox);
      const a = aim + (mode === 'win' ? Math.sin(now / 300 + off) * 0.04 : Math.sin(beamPhase + off) * 0.55);
      const spread = 0.085;
      const g = bctx.createLinearGradient(ox, oy, ox + Math.cos(a) * L, oy + Math.sin(a) * L);
      g.addColorStop(0, `rgba(255, 238, 196, ${alpha})`);
      g.addColorStop(0.7, `rgba(255, 238, 196, ${alpha * 0.25})`);
      g.addColorStop(1, 'rgba(255, 238, 196, 0)');
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.moveTo(ox, oy);
      bctx.lineTo(ox + Math.cos(a - spread) * L, oy + Math.sin(a - spread) * L);
      bctx.lineTo(ox + Math.cos(a + spread) * L, oy + Math.sin(a + spread) * L);
      bctx.closePath();
      bctx.fill();
    }
    bctx.restore();
  }

  // Jackpot rays turning behind the wheel
  function drawBurst(dt, c) {
    if (!c.r) return;
    burstRot += dt * (mode === 'spin' ? 0.25 + speed * 1.2 : mode === 'win' ? 0.3 : 0.05);
    const alpha = mode === 'win' ? 0.2 : mode === 'spin' ? 0.08 + speed * 0.06 : 0.045;
    const R = Math.hypot(W, H);
    const g = bctx.createRadialGradient(c.x, c.y, c.r * 0.9, c.x, c.y, Math.max(c.r * 3.2, R * 0.6));
    g.addColorStop(0, `rgba(242, 211, 138, ${alpha})`);
    g.addColorStop(1, 'rgba(242, 211, 138, 0)');
    bctx.save();
    bctx.globalCompositeOperation = 'lighter';
    bctx.fillStyle = g;
    bctx.beginPath();
    const rays = 18, half = Math.PI / rays;
    for (let k = 0; k < rays; k++) {
      const a = burstRot + (k * TAU) / rays;
      bctx.moveTo(c.x, c.y);
      bctx.arc(c.x, c.y, R, a, a + half);
      bctx.closePath();
    }
    bctx.fill();
    bctx.restore();
  }

  // Laser beams from the four corners; two lazy ones at idle, a full rig while spinning
  function drawLasers(dt) {
    const count = mode === 'spin' ? 6 : mode === 'win' ? 8 : 2;
    laserPhase += dt * (mode === 'spin' ? 1.5 + speed * 3 : mode === 'win' ? 2 : 0.4);
    const now = performance.now();
    const level = mode === 'idle' ? 0.5 : 1;
    const L = Math.hypot(W, H) * 1.3;
    const corners = [[0, 0], [W, 0], [0, H], [W, H]];
    bctx.save();
    bctx.globalCompositeOperation = 'lighter';
    bctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const [ox, oy] = corners[i % 4];
      const a = Math.atan2(H / 2 - oy, W / 2 - ox) + Math.sin(laserPhase * (1 + i * 0.13) + i * 1.7) * 0.6;
      const hue = NEON[i % NEON.length];
      // Strobes at 2.5 Hz on a win, under the 3 Hz flash-safety line
      const strobe = mode === 'win' ? (Math.floor(now / 200 + i) % 2 ? 1 : 0.35) : 1;
      const ex = ox + Math.cos(a) * L, ey = oy + Math.sin(a) * L;
      for (const [w, light, al] of [[10, 60, 0.12], [1.6, 78, 0.7]]) {
        bctx.strokeStyle = `hsla(${hue}, 100%, ${light}%, ${al * strobe * level})`;
        bctx.lineWidth = w;
        bctx.beginPath(); bctx.moveTo(ox, oy); bctx.lineTo(ex, ey); bctx.stroke();
      }
    }
    bctx.restore();
  }

  // Mirror-ball spots swirling over the room
  const spots = Array.from({ length: 60 }, () => ({ a: rnd(0, TAU), r: rnd(0.1, 1), s: rnd(2, 6), hue: pick(NEON) }));
  function drawDisco(dt) {
    discoRot += dt * (mode === 'spin' ? 0.6 + speed * 2 : mode === 'win' ? 0.8 : 0.12);
    const alpha = mode === 'spin' ? 0.4 : mode === 'win' ? 0.5 : 0.14;
    bctx.save();
    bctx.globalCompositeOperation = 'lighter';
    for (const p of spots) {
      const x = W / 2 + Math.cos(p.a + discoRot) * p.r * W * 0.7;
      const y = H * 0.45 + Math.sin(p.a * 1.7 + discoRot * 0.8) * p.r * H * 0.55;
      bctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
      bctx.beginPath(); bctx.ellipse(x, y, p.s * 1.6, p.s, p.a, 0, TAU); bctx.fill();
    }
    bctx.restore();
  }

  // The screensaver logo. If it ever hits a corner dead on, everyone loses it.
  function drawDvd(dt) {
    bctx.save();
    bctx.font = `26px ${DISPLAY}`;
    const w = bctx.measureText('SPIN ME').width + 36, h = 50;
    const boost = mode === 'spin' ? 2.6 : 1;
    dvd.x += dvd.vx * dt * boost;
    dvd.y += dvd.vy * dt * boost;
    const now = performance.now() / 1000;
    let bounced = false;
    if (dvd.x < 0 || dvd.x + w > W) { dvd.x = Math.max(0, Math.min(dvd.x, W - w)); dvd.vx = -dvd.vx; dvd.hitX = now; bounced = true; }
    if (dvd.y < 0 || dvd.y + h > H) { dvd.y = Math.max(0, Math.min(dvd.y, H - h)); dvd.vy = -dvd.vy; dvd.hitY = now; bounced = true; }
    if (bounced) {
      dvd.hue = (dvd.hue + 67) % 360;
      if (Math.abs(dvd.hitX - dvd.hitY) < 0.12) {
        dvd.hitX = dvd.hitY = -9;
        word('CORNER!!!', W / 2, H / 2, 72);
        for (let i = 0; i < 3; i++) launch(i * 0.25);
        hooks.corner?.();
      }
    }
    bctx.globalAlpha = 0.6;
    bctx.fillStyle = `hsl(${dvd.hue}, 95%, 60%)`;
    bctx.beginPath();
    if (bctx.roundRect) bctx.roundRect(dvd.x, dvd.y, w, h, h / 2);
    else bctx.rect(dvd.x, dvd.y, w, h);
    bctx.fill();
    bctx.globalAlpha = 0.85;
    bctx.fillStyle = '#1b130c';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.fillText('SPIN ME', dvd.x + w / 2, dvd.y + h / 2 + 2);
    bctx.restore();
  }

  /* ---------- in front of the page ---------- */

  function word(text = pick(WORDS), x, y, size) {
    words.push({
      text, x: x ?? rnd(W * 0.08, W * 0.92), y: y ?? rnd(H * 0.12, H * 0.88),
      size: size ?? rnd(24, 52), rot: rnd(-0.35, 0.35), hue: pick(NEON), age: 0, life: rnd(1.1, 1.6),
    });
    if (words.length > 24) words.shift();
  }

  function spawnWords(dt) {
    wordClock -= dt;
    if (wordClock > 0) return;
    word();
    const winRush = mode === 'win' && performance.now() - modeAt < 3000;
    wordClock = mode === 'spin' ? rnd(0.18, 0.4) : winRush ? rnd(0.12, 0.25) : rnd(1.6, 3.2);
  }

  function launch(delay = 0) {
    const rise = rnd(0.5, 0.8) * H;
    rockets.push({ x: rnd(W * 0.15, W * 0.85), y: H + 10, vx: rnd(-60, 60), vy: -Math.sqrt(2 * 700 * rise), hue: pick(NEON), wait: delay, launched: false });
  }

  function star(x, y, burst) {
    const a = rnd(0, TAU), sp = burst ? rnd(120, 320) : rnd(0, 50);
    return { kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (burst ? 80 : 20), g: 160, size: rnd(4, 9), rot: rnd(0, TAU), vr: rnd(-6, 6), flip: 0, vflip: 0, hue: pick(NEON), age: 0, life: rnd(0.6, 1) };
  }

  function sparkBurst(x, y, n, minSp, maxSp) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), sp = rnd(minSp, maxSp);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.3, 0.8), age: 0 });
    }
  }

  function drawRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.wait > 0) { r.wait -= dt; continue; }
      if (!r.launched) { r.launched = true; hooks.launch?.(); }
      r.vy += 700 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      sparks.push({ x: r.x, y: r.y, vx: rnd(-30, 30), vy: rnd(20, 80), life: 0.35, age: 0, hue: 40, g: 200 });
      if (r.vy > -60) {
        for (let k = 0; k < 70; k++) {
          const a = (k / 70) * TAU + rnd(-0.05, 0.05), sp = rnd(140, 360);
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.9, 1.4), age: 0, hue: r.hue + rnd(-15, 15), g: 160, drag: 1.2 });
        }
        rockets.splice(i, 1);
        hooks.burst?.();
      }
    }
    if (sparks.length > 1000) sparks.splice(0, sparks.length - 1000);
  }

  function drawFlash(dt, c) {
    if (flash <= 0) return;
    const hue = chaos ? (performance.now() / 4) % 360 : 42;
    const g = fctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.hypot(W, H) * 0.7);
    g.addColorStop(0, `hsla(${hue}, 100%, 85%, ${0.6 * flash})`);
    g.addColorStop(1, `hsla(${hue}, 100%, 70%, ${0.15 * flash})`);
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, W, H);
    flash = Math.max(0, flash - dt * 2.2);
  }

  function drawSparks(dt) {
    fctx.save();
    fctx.globalCompositeOperation = 'lighter';
    fctx.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vy += (s.g ?? 900) * dt;
      if (s.drag) { s.vx *= 1 - s.drag * dt; s.vy *= 1 - s.drag * dt; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.age / s.life;
      fctx.strokeStyle = s.hue != null
        ? `hsla(${s.hue}, 100%, ${Math.round(55 + 30 * k)}%, ${k})`
        : `rgba(255, ${Math.round(200 + 55 * k)}, ${Math.round(120 + 100 * k)}, ${k})`;
      fctx.lineWidth = 1.2 + 1.6 * k;
      fctx.beginPath();
      fctx.moveTo(s.x, s.y);
      fctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025);
      fctx.stroke();
    }
    fctx.restore();
  }

  function drawPieces(dt) {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.age += dt;
      if (p.age > p.life || p.y > H + 80) { pieces.splice(i, 1); continue; }
      const fade = Math.min(1, (p.life - p.age) / 0.6);

      if (p.kind === 'puff') {
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        fctx.fillStyle = `rgba(241, 230, 204, ${0.3 * (1 - p.age / p.life)})`;
        fctx.beginPath(); fctx.arc(p.x, p.y, p.size + p.grow * p.age, 0, TAU); fctx.fill();
        continue;
      }

      p.vy += p.g * dt;
      if (p.kind === 'confetti') {
        p.vx *= 1 - 1.6 * dt;
        if (p.vy > 150) p.vy = 150;
        p.sway += dt * 4;
        p.x += Math.sin(p.sway) * 40 * dt;
      } else if ((p.kind === 'coin' || p.kind === 'emoji') && p.vy > 520) {
        p.vy = 520;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vflip * dt;

      fctx.save();
      fctx.globalAlpha = fade;
      fctx.translate(p.x, p.y);
      fctx.rotate(p.rot);
      if (p.kind === 'confetti') {
        fctx.scale(1, Math.cos(p.flip));
        fctx.fillStyle = p.color;
        fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.kind === 'star') {
        fctx.fillStyle = `hsl(${p.hue}, 100%, 72%)`;
        fctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 ? p.size * 0.35 : p.size, a = (k * Math.PI) / 4;
          fctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        fctx.closePath();
        fctx.fill();
      } else if (p.kind === 'emoji') {
        fctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        fctx.scale(Math.abs(Math.cos(p.flip)) * 0.92 + 0.08, 1);
        fctx.drawImage(p.kind === 'coin' ? COIN : p.img, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      fctx.restore();
    }
  }

  function drawRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age >= r.life) { rings.splice(i, 1); continue; }
      const p = r.age / r.life;
      fctx.strokeStyle = `hsla(${r.hue}, 100%, 65%, ${1 - p})`;
      fctx.lineWidth = 3;
      fctx.beginPath(); fctx.arc(r.x, r.y, 6 + 48 * (1 - Math.pow(1 - p, 3)), 0, TAU); fctx.stroke();
    }
  }

  function drawMarks(dt) {
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      m.age += dt;
      if (m.age >= m.life) { marks.splice(i, 1); continue; }
      const k = 1 - m.age / m.life;
      fctx.save();
      fctx.translate(m.x, m.y);
      for (const [color, width] of [[`rgba(0, 0, 0, ${k})`, 4], [`rgba(255, 255, 255, ${k})`, 2]]) {
        fctx.strokeStyle = color;
        fctx.lineWidth = width;
        fctx.beginPath();
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          fctx.moveTo(sx * 6, sy * 6);
          fctx.lineTo(sx * 15, sy * 15);
        }
        fctx.stroke();
      }
      fctx.restore();
    }
  }

  function drawBanners(dt) {
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i];
      b.age += dt;
      if (b.age >= b.life) { banners.splice(i, 1); continue; }
      const inT = 0.35, outT = 0.4;
      let s = 1, a = 1;
      if (b.age < inT) s = 0.2 + 0.8 * backOut(b.age / inT);
      else if (b.age > b.life - outT) { const p = (b.age - (b.life - outT)) / outT; s = 1 + 0.3 * p; a = 1 - p; }
      else s = 1 + 0.03 * Math.sin((b.age - inT) * 10);

      fctx.save();
      fctx.font = `${b.size}px ${DISPLAY}`;
      const fitScale = Math.min(1, (W * 0.9) / fctx.measureText(b.text).width);
      fctx.globalAlpha = a;
      fctx.translate(b.x, b.y);
      fctx.rotate(-0.08 + (b.rainbow ? Math.sin(b.age * 14) * 0.03 : 0));
      fctx.scale(s * fitScale, s * fitScale);
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.lineJoin = 'round';
      // WordArt-style stacked shadows in chaos mode
      if (b.rainbow) {
        for (let k = 4; k >= 1; k--) {
          fctx.fillStyle = `hsl(${(NEON[k % NEON.length] + b.age * 300) % 360}, 100%, 60%)`;
          fctx.fillText(b.text, k * b.size * 0.035, k * b.size * 0.035);
        }
      }
      fctx.shadowColor = 'rgba(255, 200, 90, 0.9)';
      fctx.shadowBlur = b.size * 0.5;
      fctx.lineWidth = b.size * 0.16;
      fctx.strokeStyle = '#1b130c';
      fctx.strokeText(b.text, 0, 0);
      fctx.shadowBlur = 0;
      const g = fctx.createLinearGradient(0, -b.size / 2, 0, b.size / 2);
      g.addColorStop(0, '#fff6d8');
      g.addColorStop(0.45, '#f2d38a');
      g.addColorStop(0.55, '#d9a441');
      g.addColorStop(1, '#a8741a');
      fctx.fillStyle = g;
      fctx.fillText(b.text, 0, 0);
      fctx.restore();
    }
  }

  function drawWords(dt) {
    fctx.textAlign = 'center';
    fctx.textBaseline = 'middle';
    fctx.lineJoin = 'round';
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      w.age += dt;
      if (w.age >= w.life) { words.splice(i, 1); continue; }
      const p = w.age / w.life;
      const s = w.age < 0.25 ? 0.3 + 0.7 * backOut(w.age / 0.25) : 1 + 0.05 * Math.sin(w.age * 20);
      fctx.save();
      fctx.globalAlpha = p > 0.75 ? (1 - p) / 0.25 : 1;
      fctx.translate(w.x, w.y - w.age * 30);
      fctx.rotate(w.rot + Math.sin(w.age * 9) * 0.05);
      fctx.scale(s, s);
      fctx.font = `${w.size}px ${DISPLAY}`;
      fctx.lineWidth = w.size * 0.22;
      fctx.strokeStyle = '#1b130c';
      fctx.strokeText(w.text, 0, 0);
      fctx.fillStyle = `hsl(${(w.hue + w.age * 240) % 360}, 100%, 62%)`;
      fctx.fillText(w.text, 0, 0);
      fctx.restore();
    }
  }

  /* ---------- loop ---------- */

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const c = center();
    const still = reduce.matches;
    const t = still ? 0 : dt;

    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, W, H);
    if (!chroma) {
      drawBurst(t, c);
      drawBeams(t, c);
      if (chaos) { drawDisco(t); drawLasers(t); }
      drawAmbient(t);
      if (chaos) drawDvd(t);
    }

    if (chaos && !still) spawnWords(dt);
    drawRockets(dt);
    const busy = flash > 0 || sparks.length || pieces.length || banners.length || words.length || rockets.length || marks.length || rings.length;
    if (busy || fgDirty) {
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, W, H);
      drawFlash(dt, c);
      drawPieces(dt);
      drawRings(dt);
      drawSparks(dt);
      drawMarks(dt);
      drawBanners(dt);
      drawWords(dt);
      fgDirty = busy;
    }
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  // Glitter trail behind the cursor, and a burst on every click
  let lastGlitter = 0;
  window.addEventListener('pointermove', e => {
    if (!chaos || reduce.matches) return;
    const now = performance.now();
    if (now - lastGlitter < 24) return;
    lastGlitter = now;
    pieces.push(star(e.clientX, e.clientY, false), star(e.clientX, e.clientY, false));
    if (pieces.length > 900) pieces.splice(0, pieces.length - 900);
  }, { passive: true });
  window.addEventListener('pointerdown', e => {
    if (!chaos) return;
    hooks.pop?.();
    if (reduce.matches) return;
    rings.push({ x: e.clientX, y: e.clientY, age: 0, life: 0.45, hue: pick(NEON) });
    for (let i = 0; i < 8; i++) pieces.push(star(e.clientX, e.clientY, true));
  }, { passive: true });

  /* ---------- API ---------- */

  return {
    hooks,
    attach(el) { anchor = el; },
    mode(m) {
      if (m !== mode) modeAt = performance.now();
      mode = m;
      if (m !== 'spin') speed = 0;
      else wordClock = 0;
    },
    speed(s) { speed = s; },
    setChroma(on) { chroma = on; },
    setChaos(on) {
      chaos = on;
      if (!on) { words.length = 0; rockets.length = 0; marks.length = 0; rings.length = 0; }
    },
    word(text, size) {
      if (chaos && !reduce.matches) word(text, undefined, undefined, size);
    },

    // Sparks off the flapper each time it hits a peg, plus a hitmarker in chaos mode
    sparks(power) {
      if (reduce.matches || !anchor) return;
      const c = center();
      const x = c.x + c.r * 0.02, y = c.top + c.r * 0.19;
      const n = 1 + Math.round(power * 4);
      for (let i = 0; i < n; i++) {
        sparks.push({ x, y, vx: rnd(60, 200) * (0.6 + power * 1.6), vy: rnd(-220, -40) * (0.6 + power), life: rnd(0.2, 0.5), age: 0 });
      }
      if (chaos) {
        marks.push({ x: x + rnd(-10, 10), y: y + rnd(-6, 10), age: 0, life: 0.22 });
        if (marks.length > 20) marks.shift();
      }
    },

    win() {
      if (reduce.matches) return;
      const c = center();
      flash = 1;
      for (let i = 0; i < 46; i++) {
        const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), sp = rnd(320, 900);
        pieces.push({ kind: 'chip', img: CHIPS[i % CHIPS.length], x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1100, size: rnd(20, 34), rot: rnd(0, TAU), vr: rnd(-8, 8), flip: rnd(0, TAU), vflip: rnd(6, 14), age: 0, life: 4 });
      }
      for (let i = 0; i < 110; i++) {
        pieces.push({ kind: 'coin', x: rnd(0, W), y: rnd(-H * 0.9, -20), vx: rnd(-40, 40), vy: rnd(140, 360), g: 420, size: rnd(16, 30), rot: rnd(-0.4, 0.4), vr: rnd(-1, 1), flip: rnd(0, TAU), vflip: rnd(7, 15), age: 0, life: 6 });
      }
      for (let i = 0; i < 140; i++) {
        const a = rnd(-Math.PI, 0), sp = rnd(250, 1000);
        pieces.push({ kind: 'confetti', color: pick(CONFETTI), x: c.x + rnd(-c.r * 0.2, c.r * 0.2), y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, g: 520, w: rnd(6, 10), h: rnd(10, 18), rot: rnd(0, TAU), vr: rnd(-10, 10), flip: rnd(0, TAU), vflip: rnd(8, 16), sway: rnd(0, TAU), age: 0, life: 5 });
      }
      sparkBurst(c.x, c.y, 50, 200, 700);
      if (chaos) {
        for (let i = 0; i < 70; i++) {
          pieces.push({ kind: 'emoji', img: emojiSprite(pick(EMOJI)), x: rnd(0, W), y: rnd(-H, -30), vx: rnd(-30, 30), vy: rnd(120, 300), g: 300, size: rnd(28, 52), rot: rnd(-0.5, 0.5), vr: rnd(-2, 2), flip: 0, vflip: 0, age: 0, life: 6 });
        }
        for (let i = 0; i < 7; i++) launch(0.1 + i * 0.28);
        for (let i = 0; i < 6; i++) word();
      }
      if (pieces.length > 900) pieces.splice(0, pieces.length - 900);
      banners.push({ text: chaos ? 'KNOCKOUT!!!' : 'KNOCKOUT!', x: c.x, y: c.y, size: c.r * 0.34, age: 0, life: chaos ? 2.4 : 2, rainbow: chaos });
    },

    // Dust cloud where the drawn slice leaves the wheel; skulls and an OOF in chaos mode
    poof() {
      if (reduce.matches || !anchor) return;
      const c = center();
      const x = c.x, y = c.top + c.r * 0.4;
      for (let i = 0; i < 22; i++) {
        const a = rnd(0, TAU), sp = rnd(40, 220);
        pieces.push({ kind: 'puff', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, size: rnd(8, 18), grow: rnd(40, 90), age: 0, life: rnd(0.6, 1) });
      }
      sparkBurst(x, y, 24, 120, 420);
      if (chaos) {
        for (let i = 0; i < 14; i++) {
          const a = rnd(-Math.PI * 0.9, -Math.PI * 0.1), sp = rnd(300, 700);
          pieces.push({ kind: 'emoji', img: emojiSprite(i % 3 ? '💀' : '😭'), x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1000, size: rnd(26, 40), rot: rnd(-0.5, 0.5), vr: rnd(-4, 4), flip: 0, vflip: 0, age: 0, life: 2.2 });
        }
        word('OOF', x, y - c.r * 0.2, 64);
      }
    },

    // A few chips hop out of a button
    chipPop(el) {
      if (reduce.matches || !el) return;
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      for (let i = 0; i < 3; i++) {
        pieces.push({ kind: 'chip', img: pick(CHIPS), x, y, vx: rnd(-90, 90), vy: rnd(-420, -260), g: 1200, size: rnd(14, 20), rot: rnd(0, TAU), vr: rnd(-6, 6), flip: rnd(0, TAU), vflip: rnd(10, 18), age: 0, life: 1.2 });
      }
    },
  };
})();
