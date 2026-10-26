(() => {
  const TAU = Math.PI * 2;
  const KEY = 'knockout-wheel-v1';
  const EXAMPLE = ['Balatro', 'Hades II', 'Outer Wilds', 'Celeste', 'Elden Ring', 'Stardew Valley', 'Hollow Knight', 'Portal 2'];
  // Segment colors. No greens, so a chroma key never eats the wheel.
  const PALETTE = [
    { bg: '#b3261e', fg: '#fbf1dc' },
    { bg: '#f1e6cc', fg: '#22170f' },
    { bg: '#1d3557', fg: '#f1e6cc' },
    { bg: '#d9a441', fg: '#22170f' },
    { bg: '#5e2750', fg: '#f6e7d0' },
  ];
  const P = PALETTE.length;
  const BULBS = 24;

  const $ = id => document.getElementById(id);
  const els = {
    canvas: $('wheel'), hub: $('hub'), bulbs: $('bulbs'), flapper: document.querySelector('.flapper'),
    plate: $('plate'), eyebrow: $('plateEyebrow'), main: $('plateMain'), hint: $('plateHint'),
    actions: $('plateActions'), takeOff: $('takeOffBtn'), keep: $('keepBtn'), announce: $('announce'),
    ta: $('entries'), entryCount: $('entryCount'), exampleNote: $('exampleNote'), entriesNote: $('entriesNote'),
    shuffle: $('shuffleBtn'), drawnList: $('drawnList'), drawnEmpty: $('drawnEmpty'), drawnCount: $('drawnCount'),
    copy: $('copyBtn'), restore: $('restoreBtn'), sound: $('soundBtn'), chroma: $('chromaBtn'), chromaExit: $('chromaExit'),
    votesBox: $('votesBox'), votesList: $('votesList'), chanceNote: $('chanceNote'), clearVotes: $('clearVotesBtn'),
    chanceRadios: document.querySelectorAll('input[name="chance"]'),
    app: document.querySelector('.app'), wrap: $('wheelWrap'), plateBulbs: $('plateBulbs'),
    stage: document.querySelector('.stage'), nudge: $('nudge'), hype: $('hype'), hypeVal: $('hypeVal'),
    comboN: $('comboN'), combo: document.querySelector('.combo'), stamp: $('stamp'), chaosBtn: $('chaosBtn'),
    tickerLive: $('tickerLive'),
  };
  const ctx = els.canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Example poll results for the example list; options not listed have no votes
  const EXAMPLE_VOTES = { 'Elden Ring': 5, 'Balatro': 4, 'Outer Wilds': 3, 'Hades II': 2, 'Celeste': 1, 'Hollow Knight': 1 };
  const MAX_VOTES = 9999;

  const state = {
    text: EXAMPLE.join('\n'), drawn: [], duration: 6, sound: true, example: true, chaos: true,
    chance: 'equal', // equal | votes
    votes: Object.assign(Object.create(null), EXAMPLE_VOTES),
  };
  let entries = [];   // { name, c, d, out } — c: palette index, d: slice size on screen, out: being taken off
  let rotation = 0;   // radians, clockwise
  let mode = 'idle';  // idle | spinning | reveal | removing
  let winner = -1;
  let liveIdx = -1;
  let size = 0, dpr = 1;

  const mod = (a, b) => ((a % b) + b) % b;

  function randInt(n) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % n;
  }
  function rand() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }

  /* ---------- entries ---------- */

  const parse = text => text.split('\n').map(s => s.trim()).filter(Boolean);

  // Slice size an entry should have. Each vote shrinks it: 1 / (votes + 1).
  function share(e) {
    if (e.out) return 0;
    return state.chance === 'votes' ? 1 / ((state.votes[e.name] || 0) + 1) : 1;
  }

  // Chance of each name coming off next, duplicate lines summed
  function chances() {
    const m = new Map();
    let total = 0;
    for (const e of entries) {
      const s = share(e);
      total += s;
      m.set(e.name, (m.get(e.name) || 0) + s);
    }
    if (total) for (const [k, v] of m) m.set(k, v / total);
    return m;
  }

  const pct = p =>
    p <= 0 ? '0%' :
    p < 0.01 ? '<1%' :
    p < 0.1 ? `${(p * 100).toFixed(1).replace(/\.0$/, '')}%` :
    `${Math.round(p * 100)}%`;

  function setEntries(names) {
    finishTween();
    entries = names.map((name, i) => ({ name, c: i % P, d: 0 }));
    const n = entries.length;
    if (n > 1 && (n - 1) % P === 0) entries[n - 1].c = 2;
    entries.forEach(e => { e.d = share(e); });
  }

  // After a removal two neighbours can end up the same color; repaint the later one.
  function fixAdjacent() {
    const n = entries.length;
    if (n < 2) return;
    for (let j = 0; j < n; j++) {
      const prev = entries[(j - 1 + n) % n].c, next = entries[(j + 1) % n].c;
      if (entries[j].c !== prev) continue;
      for (let c = 0; c < P; c++) if (c !== prev && c !== next) { entries[j].c = c; break; }
    }
  }

  // The new slice starts at zero and grows in with the caller's tween()
  function appendEntry(name) {
    finishTween();
    const n = entries.length;
    const avoid = n ? [entries[n - 1].c, entries[0].c] : [];
    let c = n ? (entries[n - 1].c + 1) % P : 0;
    while (avoid.includes(c)) c = (c + 1) % P;
    entries.push({ name, c, d: 0 });
  }

  function syncText() {
    state.text = entries.map(e => e.name).join('\n');
    els.ta.value = state.text;
  }

  // Slices ease from their current size to share(); removals and vote changes both go through here
  let tweenRaf = 0, tweenEnd = null;
  function tween(ms) {
    finishTween();
    const from = entries.map(e => e.d);
    const D = reduceMotion.matches ? 0 : ms;
    const t0 = performance.now();
    return new Promise(done => {
      tweenEnd = done;
      const frame = now => {
        const p = D ? Math.min(1, (now - t0) / D) : 1;
        const k = p * p * (3 - 2 * p);
        entries.forEach((e, i) => { e.d = from[i] + (share(e) - from[i]) * k; });
        draw();
        if (p < 1) { tweenRaf = requestAnimationFrame(frame); return; }
        tweenRaf = 0;
        tweenEnd = null;
        done();
      };
      tweenRaf = requestAnimationFrame(frame);
    });
  }
  function finishTween() {
    if (!tweenRaf) return;
    cancelAnimationFrame(tweenRaf);
    tweenRaf = 0;
    entries.forEach(e => { e.d = share(e); });
    draw();
    const end = tweenEnd;
    tweenEnd = null;
    if (end) end();
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return d && typeof d.text === 'string' ? d : null;
    } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }

  /* ---------- drawing ---------- */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const s = Math.max(1, Math.round(els.canvas.offsetWidth * dpr));
    if (s !== size) { size = s; els.canvas.width = s; els.canvas.height = s; }
    draw();
  }

  function fit(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }

  function wedge(R, start, span) {
    ctx.beginPath();
    if (span >= TAU - 1e-6) { ctx.arc(0, 0, R, 0, TAU); return; }
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, start, start + span);
    ctx.closePath();
  }

  function draw() {
    if (!size) return;
    const R = size / 2, Rin = R * 0.955;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(R, R);

    // Brass rim and dark base
    const rim = ctx.createRadialGradient(0, 0, Rin * 0.98, 0, 0, R);
    rim.addColorStop(0, '#7a5414');
    rim.addColorStop(0.35, '#f2d38a');
    rim.addColorStop(0.7, '#d9a441');
    rim.addColorStop(1, '#6b4810');
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = rim; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, Rin, 0, TAU); ctx.fillStyle = '#082a20'; ctx.fill();

    const n = entries.length;
    if (!n) {
      ctx.strokeStyle = 'rgba(241, 230, 204, 0.08)';
      ctx.lineWidth = Math.max(1, R * 0.004);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * Rin, Math.sin(a) * Rin); ctx.stroke();
      }
      drawCollar(R);
      return;
    }

    const total = entries.reduce((a, e) => a + e.d, 0) || 1;
    const spans = [];
    let a0 = -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const span = (entries[i].d / total) * TAU;
      spans.push([a0, span]);
      a0 += span;
    }

    for (let i = 0; i < n; i++) {
      const [s, span] = spans[i];
      if (span < 1e-4) continue;
      wedge(Rin, s, span);
      ctx.fillStyle = PALETTE[entries[i].c].bg;
      ctx.fill();
    }

    if (n > 1) {
      ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
      ctx.lineWidth = Math.max(1, R * 0.006);
      for (const [s] of spans) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(s) * Rin, Math.sin(s) * Rin); ctx.stroke();
      }
    }

    // Labels read outward from the hub, ending just inside the pegs
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const textEnd = R * 0.85, maxW = textEnd - R * 0.28;
    for (let i = 0; i < n; i++) {
      const [s, span] = spans[i];
      if (span < 1e-4) continue;
      const chord = span >= Math.PI ? R : 2 * R * 0.6 * Math.sin(span / 2);
      let fs = Math.min(R * 0.085, chord * 0.6);
      if (fs < 8 * dpr) continue;
      const font = px => `600 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.font = font(fs);
      const w = ctx.measureText(entries[i].name).width;
      if (w > maxW) { fs = Math.max(fs * 0.72, fs * maxW / w); ctx.font = font(fs); }
      ctx.save();
      ctx.rotate(s + span / 2);
      ctx.fillStyle = PALETTE[entries[i].c].fg;
      ctx.fillText(fit(entries[i].name, maxW), textEnd, 0);
      ctx.restore();
    }

    // Dim everything but the drawn segment
    if (mode === 'reveal' && winner >= 0) {
      ctx.fillStyle = 'rgba(4, 18, 13, 0.64)';
      for (let i = 0; i < n; i++) {
        if (i === winner) continue;
        wedge(Rin, spans[i][0], spans[i][1]);
        ctx.fill();
      }
      wedge(Rin - R * 0.012, spans[winner][0], spans[winner][1]);
      ctx.strokeStyle = '#f2d38a';
      ctx.lineWidth = R * 0.02;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.beginPath(); ctx.arc(0, 0, Rin, 0, TAU);
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.6)'; ctx.lineWidth = Math.max(1, R * 0.006); ctx.stroke();

    // Brass pegs on every boundary; the flapper clacks against these
    if (n > 1 && n <= 120) {
      const rp = R * 0.915;
      const pr = Math.max(1.5 * dpr, Math.min(R * 0.02, rp * Math.sin(Math.PI / n) * 0.35));
      for (const [s] of spans) {
        const x = Math.cos(s) * rp, y = Math.sin(s) * rp;
        const g = ctx.createRadialGradient(x - pr * 0.35, y - pr * 0.35, pr * 0.1, x, y, pr);
        g.addColorStop(0, '#fff3cf'); g.addColorStop(0.5, '#d9a441'); g.addColorStop(1, '#5c3d0b');
        ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.fillStyle = g; ctx.fill();
      }
    }
    drawCollar(R);
  }

  function drawCollar(R) {
    ctx.beginPath(); ctx.arc(0, 0, R * 0.255, 0, TAU);
    ctx.fillStyle = '#1a110a'; ctx.fill();
    ctx.strokeStyle = '#7a5414'; ctx.lineWidth = R * 0.012; ctx.stroke();
  }

  const applyRotation = () => { els.canvas.style.transform = `rotate(${rotation}rad)`; };

  function indexAt(theta) {
    const n = entries.length;
    if (!n) return -1;
    const total = entries.reduce((a, e) => a + e.d, 0);
    let a = (mod(-theta, TAU) / TAU) * total;
    for (let i = 0; i < n; i++) { a -= entries[i].d; if (a < 0) return i; }
    return n - 1;
  }

  /* ---------- flapper and sound ---------- */

  let flap = 0, flapRaf = 0;
  function kickFlapper() {
    flap = -26; // pegs move right at the top, so the tip swings right
    if (!flapRaf) flapRaf = requestAnimationFrame(stepFlap);
  }
  function stepFlap() {
    flap *= 0.78;
    if (Math.abs(flap) < 0.3) flap = 0;
    els.flapper.style.setProperty('--flap', flap.toFixed(2) + 'deg');
    flapRaf = flap ? requestAnimationFrame(stepFlap) : 0;
  }

  /* ---------- game flow ---------- */

  const WIND_MS = 320;
  const SPIN_LINES = ["Let's go gambling!", 'Here we go!', 'Spin to win!', 'Big money, no whammies!'];
  const OUT_LINES = ['Aw dang it!', 'Oof!', 'Bye bye!', 'See ya!'];
  let stampTimer = 0;

  function setHype(v) {
    const full = v >= 1;
    const p = Math.round(Math.min(1, v) * 100);
    els.hype.style.setProperty('--hype', `${Math.max(4, p)}%`);
    els.hype.dataset.max = String(full);
    els.hypeVal.textContent = full ? 'MAX HYPE!!!' : `${p}%`;
  }

  function animate(ms, step) {
    return new Promise(done => {
      const t0 = performance.now();
      const frame = now => {
        const p = ms ? Math.min(1, (now - t0) / ms) : 1;
        step(p);
        if (p < 1) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
  }

  // Restart a one-shot CSS animation class
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  async function spin() {
    if (mode === 'spinning' || mode === 'removing') return;
    if (mode === 'reveal') await takeOff(true);
    if (mode !== 'idle') return;
    finishTween();
    const n = entries.length;
    if (!n) { nudgePlate(); Sound.buzz(); return; }

    // Pick by slice size, then aim somewhere inside that slice, clear of its pegs
    const total = entries.reduce((a, e) => a + e.d, 0);
    let u = rand() * total, pick = 0, start = 0;
    while (pick < n - 1 && u >= entries[pick].d) { u -= entries[pick].d; start += entries[pick].d; pick++; }
    const target = ((start + entries[pick].d * (0.12 + rand() * 0.76)) / total) * TAU;
    const reduce = reduceMotion.matches;
    const dur = reduce ? 1200 : state.duration * 1000;
    const turns = reduce ? 1 : Math.round(state.duration * 1.1) + 2 + randInt(2);
    const from = rotation;
    const to = from + turns * TAU + mod(-target - from, TAU);

    mode = 'spinning';
    winner = -1;
    liveIdx = indexAt(from);
    draw();
    updateUI();
    FX.mode('spin');
    Sound.spinStart();
    Sound.rollStart((dur + (reduce ? 0 : WIND_MS)) / 1000);
    const crazy = state.chaos && !reduce;
    if (state.chaos) Sound.say(SPIN_LINES[randInt(SPIN_LINES.length)]);
    const expected = Math.max(1, ((to - from) / TAU) * n);
    let combo = 0, lastHit = 0;
    els.comboN.textContent = 'x0';
    setHype(0);

    // Pull the wheel back a touch before letting it go
    if (!reduce) {
      await animate(WIND_MS, p => {
        rotation = from - 0.22 * Math.sin((p * Math.PI) / 2);
        applyRotation();
      });
    }

    const launch = rotation;
    let blur = 0;
    await animate(dur, p => {
      rotation = launch + (to - launch) * (1 - Math.pow(1 - p, 4));
      applyRotation();
      const speed = Math.pow(1 - p, 3); // 1 at launch, 0 at rest
      FX.speed(speed);
      const b = reduce ? 0 : Math.round(Math.max(0, speed - 0.08) * 26) / 10;
      if (b !== blur) { blur = b; els.canvas.style.filter = b ? `blur(${b}px)` : ''; }
      // Tension cam: the stage leans in and tilts over the last stretch
      if (crazy) {
        const tension = Math.min(1, Math.max(0, (0.3 - speed) / 0.3));
        els.stage.style.transform = tension ? `rotate(${(-2.5 * tension).toFixed(2)}deg) scale(${(1 + 0.04 * tension).toFixed(3)})` : '';
      }
      const idx = indexAt(rotation);
      if (idx !== liveIdx) {
        liveIdx = idx;
        els.main.textContent = entries[idx].name;
        kickFlapper();
        Sound.tick();
        FX.sparks(speed);
        combo++;
        if (state.chaos) {
          els.comboN.textContent = `x${combo}`;
          setHype(Math.min(0.99, combo / expected));
          const now = performance.now();
          if (speed < 0.2 && now - lastHit > 120) {
            lastHit = now;
            Sound.hit();
            if (crazy) {
              els.wrap.animate([{ transform: 'scale(1.035)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
              els.combo.animate([{ transform: 'rotate(12deg) scale(1.5)' }, { transform: 'rotate(12deg) scale(1)' }], { duration: 160 });
            }
          }
        }
      }
    });
    els.canvas.style.filter = '';
    els.stage.style.transform = '';

    rotation = mod(rotation, TAU);
    applyRotation();
    winner = indexAt(rotation);
    mode = 'reveal';
    draw();
    updateUI();
    Sound.rollStop();
    Sound.win();
    FX.mode('win');
    FX.win();
    if (state.chaos) {
      setHype(1);
      Sound.airhorn();
      Sound.say(`Knockout! ${entries[winner].name}!`);
      setTimeout(() => { if (mode === 'reveal') FX.word('DEAL WITH IT', 56); }, 1600);
    }
    if (!reduce) { replay(els.app, 'quake'); replay(els.wrap, 'bump'); }
    els.announce.textContent = `Drawn number ${state.drawn.length + 1}: ${entries[winner].name}`;
  }

  async function takeOff(beforeSpin = false) {
    if (mode !== 'reveal') return;
    const e = entries[winner];
    state.drawn.push(e.name);
    e.out = true;
    mode = 'removing';
    updateUI();
    els.drawnList.scrollTop = els.drawnList.scrollHeight;
    FX.mode('idle');
    FX.poof();
    Sound.whoosh(!beforeSpin);
    if (state.chaos) {
      els.stamp.hidden = false;
      replay(els.stamp, 'slam');
      clearTimeout(stampTimer);
      stampTimer = setTimeout(() => { els.stamp.hidden = true; }, 1400);
      // Straight into another spin? Skip the trombone so it doesn't trample the drumroll.
      if (!beforeSpin) {
        Sound.sadTrombone();
        Sound.say(OUT_LINES[randInt(OUT_LINES.length)]);
      }
    }
    await tween(380);
    entries = entries.filter(x => !x.out);
    fixAdjacent();
    syncText();
    mode = 'idle';
    winner = -1;
    save();
    draw();
    updateUI();
  }

  function keepIt() {
    if (mode !== 'reveal') return;
    FX.mode('idle');
    Sound.chip(false);
    mode = 'idle';
    winner = -1;
    draw();
    updateUI();
  }

  function nudgePlate() {
    replay(els.plate, 'shake');
  }

  /* ---------- UI ---------- */

  // Marquee bulbs around the result plate, laid out clockwise so the chase runs around it
  let plateBulbKey = '';
  function buildPlateBulbs() {
    const w = els.plate.offsetWidth, h = els.plate.offsetHeight;
    if (!w || !h) return;
    const STEP = 24, IN = 8;
    const nx = Math.max(2, Math.round((w - IN * 2) / STEP) + 1);
    const ny = Math.max(2, Math.round((h - IN * 2) / STEP) + 1);
    const key = `${nx}x${ny}`;
    if (key === plateBulbKey) return;
    plateBulbKey = key;
    const pts = [];
    for (let i = 0; i < nx - 1; i++) pts.push([i / (nx - 1), 0]);
    for (let i = 0; i < ny - 1; i++) pts.push([1, i / (ny - 1)]);
    for (let i = 0; i < nx - 1; i++) pts.push([1 - i / (nx - 1), 1]);
    for (let i = 0; i < ny - 1; i++) pts.push([0, 1 - i / (ny - 1)]);
    els.plateBulbs.replaceChildren(...pts.map(([x, y], i) => {
      const b = document.createElement('span');
      b.className = 'bulb';
      b.style.left = `calc(${IN}px + (100% - ${IN * 2}px) * ${x})`;
      b.style.top = `calc(${IN}px + (100% - ${IN * 2}px) * ${y})`;
      b.style.setProperty('--i', i);
      b.style.setProperty('--phase', i % 3);
      b.style.setProperty('--alt', i % 2);
      return b;
    }));
  }

  function renderDrawn() {
    const locked = mode === 'spinning' || mode === 'removing';
    els.drawnList.replaceChildren(...state.drawn.map((name, i) => {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = `No. ${i + 1}`;
      const nm = document.createElement('span');
      nm.className = 'name';
      nm.textContent = name;
      nm.title = name;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.textContent = 'Put back';
      b.dataset.i = i;
      b.disabled = locked;
      li.append(num, nm, b);
      return li;
    }));
    els.drawnEmpty.hidden = state.drawn.length > 0;
    els.drawnCount.textContent = state.drawn.length;
  }

  let votesKey = null;
  function renderVotes() {
    const byVotes = state.chance === 'votes';
    const locked = mode !== 'idle';
    const n = entries.length;
    els.chanceNote.textContent = byVotes
      ? 'Each slice is 1 ÷ (votes + 1) of a full one, so one vote halves it and two votes cut it to a third. Fewer votes make an option more likely to come off.'
      : n ? `Every option gets the same slice, ${pct(1 / n)} each.` : 'Every option gets the same slice.';
    els.clearVotes.hidden = !byVotes;
    els.clearVotes.disabled = locked || !Object.keys(state.votes).length;
    els.votesBox.hidden = !byVotes || !n;
    if (els.votesBox.hidden) return;

    // Rebuild rows only when the set of names changes, so typing in a vote box keeps focus
    const names = [...new Set(entries.map(e => e.name))];
    const key = names.join('\n');
    if (key !== votesKey) {
      votesKey = key;
      const stepBtn = (delta, text, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'step';
        b.dataset.delta = delta;
        b.textContent = text;
        b.setAttribute('aria-label', label);
        return b;
      };
      els.votesList.replaceChildren(...names.map((name, i) => {
        const li = document.createElement('li');
        li.dataset.name = name;
        const nm = document.createElement('span');
        nm.className = 'vname';
        nm.textContent = name;
        nm.title = name;
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `vote-${i}`;
        input.min = '0';
        input.max = String(MAX_VOTES);
        input.step = '1';
        input.inputMode = 'numeric';
        input.setAttribute('aria-label', `Votes for ${name}`);
        const stepper = document.createElement('div');
        stepper.className = 'stepper';
        stepper.append(stepBtn('-1', '−', `Remove a vote from ${name}`), input, stepBtn('1', '+', `Add a vote for ${name}`));
        const p = document.createElement('span');
        p.className = 'vpct';
        li.append(nm, stepper, p);
        return li;
      }));
    }

    const ch = chances();
    for (const li of els.votesList.children) {
      const name = li.dataset.name;
      const v = state.votes[name] || 0;
      const [dec, input, inc] = li.querySelector('.stepper').children;
      if (document.activeElement !== input) input.value = v;
      dec.disabled = locked || v === 0;
      inc.disabled = locked || v >= MAX_VOTES;
      input.disabled = locked;
      li.querySelector('.vpct').textContent = pct(ch.get(name) || 0);
    }
  }

  function updateUI() {
    const n = entries.length;
    const busy = mode !== 'idle';
    const locked = mode === 'spinning' || mode === 'removing';
    const next = state.drawn.length + 1;

    els.entryCount.textContent = n;
    els.ta.readOnly = busy;
    els.entriesNote.textContent =
      mode === 'reveal' ? 'Take the result off or keep it to edit the list.' :
      busy ? 'The list unlocks when the wheel stops.' :
      'One per line. Repeat a line to give it extra chances.';
    els.exampleNote.hidden = !state.example;
    els.shuffle.disabled = busy || n < 2;
    els.chanceRadios.forEach(r => { r.disabled = busy; });
    els.restore.disabled = locked || !state.drawn.length;
    els.copy.disabled = !state.drawn.length;
    els.hub.disabled = locked;
    els.hub.dataset.empty = String(n === 0 && mode === 'idle');

    const lights = mode === 'spinning' ? 'spin' : mode === 'reveal' ? 'win' : 'idle';
    els.bulbs.dataset.mode = lights;
    els.plateBulbs.dataset.mode = lights;
    els.wrap.dataset.mode = lights;
    document.body.dataset.mode = lights;
    els.nudge.dataset.show = String(mode === 'idle' && n > 0);
    if (mode === 'idle') setHype(Math.min(0.6, 0.1 + state.drawn.length * 0.05));
    updateTicker();
    els.plate.dataset.mode = mode;
    els.actions.hidden = mode !== 'reveal';

    let eyebrow, main, hint;
    if (mode === 'reveal') {
      eyebrow = `Drawn · No. ${next} · ${pct(chances().get(entries[winner].name) || 0)} chance`;
      main = entries[winner].name;
      hint = 'Spinning again also takes it off.';
    } else if (mode === 'removing') {
      eyebrow = `No. ${state.drawn.length} · off the wheel`;
      main = state.drawn[state.drawn.length - 1];
      hint = '';
    } else if (mode === 'spinning') {
      eyebrow = `Drawing No. ${next}`;
      main = liveIdx >= 0 ? entries[liveIdx].name : '';
      hint = '';
    } else if (!n) {
      eyebrow = 'Wheel empty';
      main = 'Add names to spin';
      hint = state.drawn.length ? 'Type new ones in the list, or put drawn names back.' : 'Type them in the list, one per line.';
    } else {
      eyebrow = `Next up · No. ${next}`;
      main = n === 1 ? 'Last one on the wheel' : `${n} on the wheel`;
      hint = 'Tap SPIN or press Space.';
    }
    els.eyebrow.textContent = eyebrow;
    els.main.textContent = main;
    els.hint.textContent = hint;

    renderDrawn();
    renderVotes();
  }

  // Bottom ticker: live numbers dressed up as breaking news
  let tickerText = '';
  function updateTicker() {
    const bits = [`NEXT UP: No. ${state.drawn.length + 1}`, `${entries.length} ON THE WHEEL`];
    if (state.drawn.length) bits.push(`LAST KNOCKOUT: ${state.drawn[state.drawn.length - 1]} 💀`);
    const top = [...chances()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) bits.push(`MOST LIKELY TO GO: ${top.map(([name, p]) => `${name} ${pct(p)}`).join(' · ')}`);
    bits.push('NOT FINANCIAL ADVICE 📉', 'NO REFUNDS 💸');
    const text = bits.join('  ★  ') + '  ★  ';
    if (text === tickerText) return;
    tickerText = text;
    for (const span of els.tickerLive.children) span.textContent = text + text;
  }

  function setChaos(on) {
    state.chaos = on;
    document.body.classList.toggle('calm', !on);
    els.chaosBtn.setAttribute('aria-pressed', String(on));
    els.chaosBtn.textContent = on ? 'Chaos: MAX' : 'Chaos: off';
    FX.setChaos(on);
    requestAnimationFrame(resize);
  }

  function setSound(on) {
    state.sound = on;
    Sound.setEnabled(on);
    els.sound.setAttribute('aria-pressed', String(on));
    els.sound.textContent = on ? 'Sound on' : 'Sound off';
  }

  function setChroma(on) {
    document.body.classList.toggle('chroma', on);
    FX.setChroma(on);
    els.chromaExit.hidden = !on;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    requestAnimationFrame(resize);
  }

  /* ---------- events ---------- */

  els.hub.addEventListener('click', spin);
  els.takeOff.addEventListener('click', () => { takeOff(); });
  els.keep.addEventListener('click', keepIt);

  els.ta.addEventListener('input', () => {
    if (mode !== 'idle') return;
    state.text = els.ta.value;
    state.example = false;
    setEntries(parse(state.text));
    save();
    draw();
    updateUI();
  });

  els.shuffle.addEventListener('click', () => {
    if (mode !== 'idle') return;
    const names = entries.map(e => e.name);
    for (let i = names.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [names[i], names[j]] = [names[j], names[i]];
    }
    setEntries(names);
    Sound.riffle();
    syncText();
    save();
    draw();
    updateUI();
  });

  els.drawnList.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b || mode === 'spinning' || mode === 'removing') return;
    const [name] = state.drawn.splice(Number(b.dataset.i), 1);
    appendEntry(name);
    Sound.bling();
    FX.chipPop(b);
    syncText();
    save();
    tween(380);
    updateUI();
  });

  els.restore.addEventListener('click', () => {
    if (mode === 'spinning' || mode === 'removing') return;
    state.drawn.splice(0).forEach(appendEntry);
    Sound.bling();
    FX.chipPop(els.restore);
    syncText();
    save();
    tween(380);
    updateUI();
  });

  function setVotes(name, v) {
    v = Math.max(0, Math.min(MAX_VOTES, Math.floor(v) || 0));
    if (v) state.votes[name] = v; else delete state.votes[name];
    save();
    tween(320);
    renderVotes();
  }

  els.votesList.addEventListener('click', e => {
    const b = e.target.closest('button[data-delta]');
    if (!b || mode !== 'idle') return;
    const name = b.closest('li').dataset.name;
    Sound.chip(Number(b.dataset.delta) > 0);
    FX.chipPop(b);
    setVotes(name, (state.votes[name] || 0) + Number(b.dataset.delta));
  });
  els.votesList.addEventListener('input', e => {
    const input = e.target;
    if (input.type !== 'number' || mode !== 'idle' || input.value === '') return;
    setVotes(input.closest('li').dataset.name, Number(input.value));
  });
  els.votesList.addEventListener('change', e => {
    const input = e.target;
    if (input.type !== 'number') return;
    const name = input.closest('li').dataset.name;
    if (input.value === '' && mode === 'idle') setVotes(name, 0);
    input.value = state.votes[name] || 0;
  });

  els.chanceRadios.forEach(r => r.addEventListener('change', () => {
    if (mode !== 'idle') return;
    state.chance = r.value;
    Sound.chip(true);
    save();
    tween(450);
    renderVotes();
  }));

  // Two clicks to clear, since typed-in poll results are a pain to redo
  let clearArmed = 0;
  els.clearVotes.addEventListener('click', () => {
    if (!clearArmed) {
      els.clearVotes.textContent = 'Click again to clear';
      clearArmed = setTimeout(() => { clearArmed = 0; els.clearVotes.textContent = 'Clear votes'; }, 3000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = 0;
    els.clearVotes.textContent = 'Clear votes';
    state.votes = Object.create(null);
    save();
    tween(320);
    renderVotes();
  });

  let copyTimer = 0;
  els.copy.addEventListener('click', () => {
    const text = state.drawn.map((name, i) => `${i + 1}. ${name}`).join('\n');
    const show = msg => {
      els.copy.textContent = msg;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { els.copy.textContent = 'Copy order'; }, 1800);
    };
    const fallback = () => {
      const r = document.createRange();
      r.selectNodeContents(els.drawnList);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      show('Selected, copy it');
    };
    try {
      navigator.clipboard.writeText(text).then(() => show('Copied'), fallback);
    } catch { fallback(); }
  });

  document.querySelectorAll('input[name="dur"]').forEach(r => r.addEventListener('change', () => {
    state.duration = Number(r.value);
    save();
  }));

  els.sound.addEventListener('click', () => {
    setSound(!state.sound);
    if (state.sound) { Sound.init(); Sound.chip(true); }
    save();
  });
  els.chaosBtn.addEventListener('click', () => {
    setChaos(!state.chaos);
    if (state.chaos) Sound.airhorn();
    save();
  });
  els.chroma.addEventListener('click', () => setChroma(true));
  els.chromaExit.addEventListener('click', () => setChroma(false));

  // Space or Enter spins, unless the keyboard is driving a focused control or someone is typing
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('chroma')) { setChroma(false); return; }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('textarea, input[type="text"], input[type="number"]')) return;
    if (t !== document.body && t.matches && t.matches('button, input, a, [tabindex]')) {
      let keyboardFocus = true;
      try { keyboardFocus = t.matches(':focus-visible'); } catch {}
      if (keyboardFocus) return;
    }
    e.preventDefault();
    spin();
  });

  /* ---------- boot ---------- */

  function boot(data) {
    const saved = data && typeof data.text === 'string' ? data : load();
    if (saved) {
      state.text = saved.text;
      state.drawn = Array.isArray(saved.drawn) ? saved.drawn.filter(x => typeof x === 'string') : [];
      state.duration = [3, 6, 10].includes(saved.duration) ? saved.duration : 6;
      state.sound = saved.sound !== false;
      state.example = !!saved.example;
      if (typeof saved.rotation === 'number' && isFinite(saved.rotation)) rotation = mod(saved.rotation, TAU);
      state.chance = saved.chance === 'votes' ? 'votes' : 'equal';
      state.chaos = saved.chaos !== false;
      state.votes = Object.create(null);
      const keep = new Set([...parse(state.text), ...state.drawn]);
      for (const [name, v] of Object.entries(saved.votes || {})) {
        const count = Math.floor(Number(v));
        if (count > 0 && keep.has(name)) state.votes[name] = Math.min(count, MAX_VOTES);
      }
    }
    setEntries(parse(state.text));
    els.ta.value = state.text;
    $('dur' + state.duration).checked = true;
    $(state.chance === 'votes' ? 'chanceVotes' : 'chanceEqual').checked = true;
    setSound(state.sound);

    for (let i = 0; i < BULBS; i++) {
      const a = ((i + 0.5) / BULBS) * TAU;
      const b = document.createElement('span');
      b.className = 'bulb';
      b.style.left = (50 + 47.25 * Math.sin(a)) + '%';
      b.style.top = (50 - 47.25 * Math.cos(a)) + '%';
      b.style.setProperty('--i', i);
      b.style.setProperty('--phase', i % 3);
      b.style.setProperty('--alt', i % 2);
      els.bulbs.append(b);
    }
    FX.attach(els.wrap);
    FX.hooks.launch = () => Sound.whistle();
    FX.hooks.burst = () => Sound.bang();
    FX.hooks.pop = () => Sound.pop();
    FX.hooks.corner = () => Sound.airhorn();
    setChaos(state.chaos);
    new ResizeObserver(buildPlateBulbs).observe(els.plate);

    // Browsers only start audio from a user gesture; the first click or key press unlocks it
    const unlock = () => Sound.init();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    applyRotation();
    updateUI();
    resize();
    new ResizeObserver(resize).observe(els.canvas);
    window.addEventListener('resize', resize);
    if (document.fonts) {
      document.fonts.load('600 40px "Barlow Condensed"').then(draw, () => {});
      document.fonts.ready.then(draw);
    }
  }

  const hot = window.claude?.hot;
  hot?.snapshot?.(() => ({ ...state, rotation }));
  hot?.ready ? hot.ready(boot) : boot(hot?.data ?? {});
})();
