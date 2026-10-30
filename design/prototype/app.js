(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const S = {
    scale: 1,
    px: 0.28, py: 0.22, tx: 0.28, ty: 0.22, nextTarget: 0,
    dragging: false, evolve: true, freeze: false, reverse: false,
    seed: 4081, peaks: [], sampleDur: 8, head: 0,
    gesture: null, gType: "riser", gBars: 8, dropFired: false,
    shocks: [], ripples: [], grains: [], spawnAcc: 0, pulse: new Float32Array(240),
    noise: [], rec: null, level: [0.3, 0.3, 0.2], meter: [0.4, 0.4],
  };

  /* ---------- scaling ---------- */
  const app = $("#app");
  function fit() {
    S.scale = Math.min(innerWidth / 1440, innerHeight / 900);
    app.style.transform = `scale(${S.scale})`;
    app.style.left = (innerWidth - 1440 * S.scale) / 2 + "px";
    app.style.top = (innerHeight - 900 * S.scale) / 2 + "px";
  }
  addEventListener("resize", fit);
  fit();

  /* ---------- sample peaks ---------- */
  function defaultPeaks() {
    const r = rng(7), out = [];
    for (let i = 0; i < 480; i++) {
      const env = 0.38 + 0.3 * Math.sin(i / 37) + 0.28 * Math.sin(i / 11 + 2);
      out.push(clamp(Math.abs(env) * (0.35 + 0.65 * r())));
    }
    return out;
  }
  S.peaks = defaultPeaks();

  async function loadFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const audio = await ctx.decodeAudioData(buf);
      const ch = audio.getChannelData(0), n = 480, step = Math.floor(ch.length / n) || 1, peaks = [];
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 8) m = Math.max(m, Math.abs(ch[j]));
        peaks.push(m);
      }
      const max = Math.max(...peaks) || 1;
      S.peaks = peaks.map((p) => clamp(p / max));
      S.sampleDur = clamp(audio.duration, 1, 30);
      $("#sName").textContent = file.name;
      $("#sMeta").textContent = `${audio.duration.toFixed(1)} s · ${(audio.sampleRate / 1000).toFixed(1)} kHz · ${audio.numberOfChannels === 1 ? "mono" : "stereo"}`;
      toast(`Loaded ${file.name}`);
    } catch {
      toast("Couldn't decode that file. Try a WAV, MP3, or OGG.");
    }
  }
  const drop = $("#drop"), fileIn = $("#file");
  drop.addEventListener("click", () => fileIn.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", () => fileIn.files[0] && loadFile(fileIn.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]));

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- knobs ---------- */
  const GA = 135, SW = 270;
  const pol = (cx, cy, r, a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  function arc(cx, cy, r, a0, a1) {
    if (Math.abs(a1 - a0) < 0.05) a1 = a0 + 0.05;
    const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  const knobs = [];
  function makeKnob(host, o) {
    const { id, label, value = 0.5, size = 76, grad = "V", ax = 0, ay = 0, big = false, fmt } = o;
    const half = size / 2, R = half - 9, rb = R * 0.7;
    host.classList.add("knob", grad === "A" ? "a" : "v");
    if (big) host.classList.add("big");
    host.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="slider" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" tabindex="0">
      <path class="trk" d="${arc(half, half, R, GA, GA + SW)}"/>
      <path class="val" stroke="url(#grad${grad})"/>
      <path class="mod"/><circle class="mdot" r="2.6"/>
      <circle cx="${half}" cy="${half}" r="${rb}" fill="url(#bodyGrad)" stroke="rgba(255,255,255,.14)"/>
      <circle cx="${half}" cy="${half}" r="${rb - 3}" fill="none" stroke="rgba(255,255,255,.05)"/>
      <line class="ind"/></svg><div class="kl">${label}</div><div class="kv"></div>`;
    const k = { id, v: value, def: value, ax, ay, eff: value, host, fmt: fmt || ((v) => Math.round(v * 100)) };
    const svg = $("svg", host), val = $(".val", host), mod = $(".mod", host), mdot = $(".mdot", host), ind = $(".ind", host), kv = $(".kv", host);
    k.render = (eff = k.v) => {
      k.eff = eff;
      const a0 = GA, ab = GA + SW * k.v, ae = GA + SW * eff;
      val.setAttribute("d", arc(half, half, R, a0, ab));
      const [ix0, iy0] = pol(half, half, rb * 0.25, ab), [ix1, iy1] = pol(half, half, rb * 0.82, ab);
      ind.setAttribute("x1", ix0); ind.setAttribute("y1", iy0); ind.setAttribute("x2", ix1); ind.setAttribute("y2", iy1);
      const modded = Math.abs(eff - k.v) > 0.004;
      mod.setAttribute("d", modded ? arc(half, half, R + 5.5, Math.min(ab, ae), Math.max(ab, ae)) : "");
      const [mx, my] = pol(half, half, R + 5.5, ae);
      mdot.setAttribute("cx", mx); mdot.setAttribute("cy", my);
      mdot.style.opacity = ax || ay ? 1 : 0;
      kv.textContent = k.fmt(eff);
      svg.setAttribute("aria-valuenow", Math.round(k.v * 100));
    };
    let startY, startV;
    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      startY = e.clientY; startV = k.v;
      e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (startY == null) return;
      k.v = clamp(startV + (startY - e.clientY) / S.scale / (e.shiftKey ? 500 : 180));
      k.render(k.eff);
      o.onChange && o.onChange(k.v);
    });
    const end = () => (startY = null);
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("dblclick", () => { k.v = k.def; k.render(k.eff); o.onChange && o.onChange(k.v); });
    svg.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.02 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.02 : 0;
      if (!d) return;
      e.preventDefault();
      k.v = clamp(k.v + d); k.render(k.eff); o.onChange && o.onChange(k.v);
    });
    k.render();
    knobs.push(k);
    return k;
  }

  /* ring knobs around the orb */
  const stage = $("#stage");
  const P = {};
  const ringDefs = [
    { id: "position", label: "Position", v: 0.35, side: -1, row: 0 },
    { id: "size", label: "Size", v: 0.5, ax: 0.5, side: -1, row: 1 },
    { id: "density", label: "Density", v: 0.55, ay: 0.5, side: -1, row: 2 },
    { id: "spray", label: "Spray", v: 0.3, ax: 0.2, ay: 0.2, side: -1, row: 3, grad: "A" },
    { id: "pitch", label: "Pitch", v: 0.5, ay: 0.35, side: 1, row: 0 },
    { id: "filter", label: "Filter", v: 0.62, ax: 0.4, side: 1, row: 1, grad: "A" },
    { id: "space", label: "Space", v: 0.4, ax: 0.45, side: 1, row: 2, grad: "A" },
    { id: "drive", label: "Drive", v: 0.2, ay: 0.5, side: 1, row: 3, grad: "A" },
  ];
  const dys = [-175, -70, 70, 175];
  ringDefs.forEach((d) => {
    const host = document.createElement("div");
    const dy = dys[d.row], x = 420 + d.side * Math.sqrt(340 * 340 - dy * dy);
    host.style.left = x - 38 + "px";
    host.style.top = 280 + dy - 42 + "px";
    stage.appendChild(host);
    P[d.id] = makeKnob(host, { id: d.id, label: d.label, value: d.v, ax: d.ax || 0, ay: d.ay || 0, grad: d.grad || "V" });
  });

  const kCloud = makeKnob($("#kCloud"), { id: "cloud", label: "Cloud", value: 0.62, size: 108, big: true, grad: "V" });
  const kSpec = makeKnob($("#kSpec"), { id: "spec", label: "Spectral", value: 0.38, size: 108, big: true, grad: "A" });
  $("#kCloud").style.left = "2px"; $("#kSpec").style.left = "122px";
  const kRand = makeKnob($("#kRand"), { id: "rand", label: "Random", value: 0.4, size: 56, onChange: () => buildCurves() });
  const kShape = makeKnob($("#kShape"), { id: "shape", label: "Curve", value: 0.5, size: 56, grad: "A" });
  $("#kRand").style.cssText += "left:0;top:0"; $("#kShape").style.cssText += "left:72px;top:0";

  /* ---------- orb mapping rows ---------- */
  const mapRows = $$(".map").map((el) => ({ el, bar: $(".bar i", el), id: el.dataset.id, ax: el.dataset.ax }));

  /* ---------- orb canvas ---------- */
  const orb = $("#orb"), octx = orb.getContext("2d");
  function sizeCanvas(c, ctx) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = parseFloat(getComputedStyle(c).width), h = parseFloat(getComputedStyle(c).height);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }
  const orbSize = sizeCanvas(orb, octx);
  const mini = $("#mini"), mctx = mini.getContext("2d"); const miniSize = sizeCanvas(mini, mctx);
  const gcv = $("#gcv"), gctx = gcv.getContext("2d"); const gSize = sizeCanvas(gcv, gctx);
  const mcv = $("#meters"), mtx = mcv.getContext("2d"); const mSize = sizeCanvas(mcv, mtx);

  const CX = 280, CY = 280, RI = 196, RW = 220, RR = 240;
  const toNorm = (e) => {
    const r = orb.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 560 - CX, y = ((e.clientY - r.top) / r.height) * 560 - CY;
    let nx = x / RI, ny = y / RI; const m = Math.hypot(nx, ny);
    if (m > 1) { nx /= m; ny /= m; }
    return [nx, ny];
  };
  orb.addEventListener("pointerdown", (e) => {
    orb.setPointerCapture(e.pointerId);
    S.dragging = true;
    [S.tx, S.ty] = toNorm(e);
    S.px = S.tx; S.py = S.ty;
    S.ripples.push({ t0: performance.now(), big: true });
  });
  orb.addEventListener("pointermove", (e) => { if (S.dragging) { [S.tx, S.ty] = toNorm(e); S.px = lerp(S.px, S.tx, 0.55); S.py = lerp(S.py, S.ty, 0.55); } });
  const endDrag = () => { S.dragging = false; S.nextTarget = performance.now() + 3500; };
  orb.addEventListener("pointerup", endDrag);
  orb.addEventListener("pointercancel", endDrag);

  /* ---------- gesture ---------- */
  const easeIn = (t) => t * t, easeOut = (t) => 1 - (1 - t) * (1 - t);
  const GCURVES = [
    { id: "density", color: "#c3b2ff", m: 1, inv: false, rest: 0.1 },
    { id: "size", color: "#8f74ff", m: 0.6, inv: true, rest: 0.6 },
    { id: "filter", color: "#f6a944", m: 0.8, inv: false, rest: 0.15 },
    { id: "space", color: "#ff6f91", m: 0.5, inv: false, rest: 0.5 },
  ];
  function riserVal(c, u, e) { const x = Math.pow(u, e * c.m); return c.inv ? 1 - x : x; }
  function curveVal(c, u, type, k) {
    const e = lerp(0.6, 2.6, k);
    if (type === "riser") return riserVal(c, u, e);
    if (type === "drop") return c.id === "size" ? Math.pow(u, e * 0.5) * c.rest : c.id === "space" ? Math.pow(1 - u, 0.7) : Math.pow(1 - u, e * c.m);
    if (u < 0.75) return riserVal(c, u / 0.75, e);
    const w = (u - 0.75) / 0.25, end = riserVal(c, 1, e);
    return lerp(end, c.rest, 1 - Math.pow(1 - w, 3));
  }
  function buildCurves() {
    S.noise = GCURVES.map((_, i) => { const r = rng(S.seed + i * 977); return Array.from({ length: 64 }, () => r() * 2 - 1); });
  }
  buildCurves();

  function drawGesture(now) {
    const { w, h } = gSize, c = gctx;
    c.clearRect(0, 0, w, h);
    const pad = 14, gw = w - pad * 2, gh = h - 40;
    c.lineWidth = 1;
    for (let b = 0; b <= S.gBars; b++) {
      const x = pad + (b / S.gBars) * gw;
      c.strokeStyle = b % 4 === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)";
      c.beginPath(); c.moveTo(x, 8); c.lineTo(x, 8 + gh); c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,.28)"; c.font = "10px JetBrains Mono, monospace";
    c.fillText("1", pad, h - 8); c.fillText(String(S.gBars + 1), pad + gw - 8, h - 8);
    const rand = kRand.v * 0.28, shape = kShape.v;
    GCURVES.forEach((cv, ci) => {
      c.beginPath();
      const pts = [];
      for (let j = 0; j < 64; j++) {
        const u = j / 63, v = clamp(curveVal(cv, u, S.gType, shape) + S.noise[ci][j] * rand);
        pts.push([pad + u * gw, 8 + gh - v * gh]);
      }
      pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = cv.color; c.lineWidth = ci === 0 ? 2.2 : 1.6; c.globalAlpha = ci === 0 ? 1 : 0.8; c.stroke(); c.globalAlpha = 1;
      if (ci === 0) {
        c.lineTo(pad + gw, 8 + gh); c.lineTo(pad, 8 + gh); c.closePath();
        const g = c.createLinearGradient(0, 8, 0, 8 + gh); g.addColorStop(0, "rgba(195,178,255,.28)"); g.addColorStop(1, "rgba(195,178,255,0)");
        c.fillStyle = g; c.fill();
      }
    });
    GCURVES.forEach((cv, i) => {
      c.fillStyle = cv.color; c.fillRect(pad + 50 + i * 76, h - 17, 6, 6);
      c.fillStyle = "rgba(255,255,255,.5)"; c.fillText(cv.id, pad + 62 + i * 76, h - 10);
    });
    if (S.gesture) {
      const t = clamp((now - S.gesture.t0) / S.gesture.dur), x = pad + t * gw;
      c.strokeStyle = "#ffd08a"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 4); c.lineTo(x, 8 + gh + 4); c.stroke();
      c.fillStyle = "#ffd08a"; c.beginPath(); c.arc(x, 4, 3, 0, TAU); c.fill();
    }
  }

  function fire() {
    if (S.gesture) return;
    const dur = Math.max(2500, S.gBars * 600) * (reduceMotion ? 0.6 : 1);
    S.gesture = { type: S.gType, t0: performance.now(), dur: S.gType === "drop" ? 2200 : dur, dropped: false };
    if (S.gType === "drop") impact();
  }
  function impact() {
    S.shocks.push({ t0: performance.now() });
    $("#flash").animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 900, easing: "cubic-bezier(.22,1,.36,1)" });
    for (let i = 0; i < 18; i++) S.pulse[(Math.random() * 240) | 0] = 1;
  }
  function gestureState(now) {
    const g = S.gesture;
    if (!g) return { rise: 0, drop: 0, t: 0 };
    const t = (now - g.t0) / g.dur;
    if (t >= 1) { S.gesture = null; $("#fire").style.setProperty("--p", 0); return { rise: 0, drop: 0, t: 0 }; }
    $("#fire").style.setProperty("--p", t.toFixed(3));
    if (g.type === "riser") return { rise: easeIn(t), drop: 0, t };
    if (g.type === "drop") return { rise: 0, drop: 1 - easeOut(t), t };
    if (t < 0.75) return { rise: easeIn(t / 0.75), drop: 0, t };
    if (!g.dropped) { g.dropped = true; impact(); }
    return { rise: 0, drop: 1 - easeOut((t - 0.75) / 0.25), t };
  }

  /* ---------- UI wiring ---------- */
  function seg(id, cb) {
    const root = $(id);
    $$("button", root).forEach((b) => b.addEventListener("click", () => {
      $$("button", root).forEach((x) => x.classList.toggle("on", x === b));
      cb(b.dataset.v);
    }));
  }
  seg("#gType", (v) => (S.gType = v));
  seg("#gBars", (v) => (S.gBars = +v));
  $("#fire").addEventListener("click", fire);

  const revSw = $("#revSw");
  function setReverse(on) { S.reverse = on; revSw.setAttribute("aria-pressed", on); $$(".mac").find((m) => m.dataset.k === "reverse")?.classList.toggle("on", on); }
  revSw.addEventListener("click", () => setReverse(!S.reverse));
  $$(".mini").forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true")));

  const wet = $("#wet");
  const setWet = () => wet.style.setProperty("--fill", wet.value + "%");
  wet.addEventListener("input", setWet); setWet();

  const icons = {
    freeze: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
    reverse: '<path d="M14 6l-6 6 6 6M20 6l-6 6 6 6"/>',
    scatter: '<circle cx="6" cy="8" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="10" cy="13" r="1.4"/><circle cx="18" cy="15" r="1.4"/><circle cx="7" cy="18" r="1.4"/>',
    octave: '<text x="12" y="15" text-anchor="middle">8va</text>',
    stutter: '<path d="M5 17V7M9 17V10M13 17V12M17 17V14M21 17v-1"/>',
    evolve: '<path d="M2.5 12c3-9 6-9 9.5 0s6.500 9 9.500 0"/>',
    resample: '<path d="M20 12a8 8 0 1 1-2.500-5.800M20 4v5h-5"/>',
    reroll: '<rect x="4" y="4" width="16" height="16" rx="3.500"/><circle cx="9" cy="9" r=".9"/><circle cx="15" cy="15" r=".9"/><circle cx="12" cy="12" r=".9"/>',
  };
  const macDefs = [["freeze", "Freeze"], ["reverse", "Reverse"], ["scatter", "Scatter"], ["octave", "Octave"], ["stutter", "Stutter"], ["evolve", "Evolve"], ["resample", "Resample"], ["reroll", "Re-roll"]];
  const macHost = $("#macros");
  macDefs.forEach(([k, name]) => {
    const b = document.createElement("button");
    b.className = "mac" + (k === "evolve" ? " on" : "");
    b.dataset.k = k;
    b.setAttribute("aria-pressed", k === "evolve");
    b.innerHTML = `<div class="ring"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg></div><span class="n">${name}</span>`;
    b.addEventListener("click", () => {
      if (k === "reroll") {
        S.seed = (Math.random() * 9000 + 1000) | 0; $("#seedVal").textContent = S.seed; buildCurves();
        b.classList.add("on"); setTimeout(() => b.classList.remove("on"), 500); return;
      }
      if (k === "resample") { toast("Resample: last 8 bars captured as a new source (prototype)"); b.classList.add("on"); setTimeout(() => b.classList.remove("on"), 700); return; }
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
      if (k === "evolve") S.evolve = on;
      if (k === "freeze") S.freeze = on;
      if (k === "reverse") setReverse(on);
    });
    macHost.appendChild(b);
  });

  /* record */
  const recBtn = $("#recBtn");
  recBtn.addEventListener("click", () => {
    if (!S.rec) { S.rec = performance.now(); recBtn.setAttribute("aria-pressed", "true"); return; }
    const secs = ((performance.now() - S.rec) / 1000).toFixed(1);
    S.rec = null; recBtn.setAttribute("aria-pressed", "false"); $("#recTime").textContent = "REC";
    toast(`Captured ${secs} s · 24-bit WAV ready (prototype, no audio engine yet)`);
  });
  $("#exportBtn").addEventListener("click", () => toast("Offline render to WAV arrives with the audio engine (Phase 1)"));

  /* ---------- drawing ---------- */
  function drawOrb(now, dt, vals, gs) {
    const c = octx; c.clearRect(0, 0, 560, 560);
    const t = now / 1000;
    const px = CX + S.px * RI, py = CY + S.py * RI;

    // influence field
    c.save(); c.beginPath(); c.arc(CX, CY, RI + 10, 0, TAU); c.clip();
    const fg = c.createRadialGradient(px, py, 0, px, py, 190);
    fg.addColorStop(0, "rgba(143,116,255,.34)"); fg.addColorStop(0.5, "rgba(143,116,255,.10)"); fg.addColorStop(1, "rgba(143,116,255,0)");
    c.fillStyle = fg; c.fillRect(0, 0, 560, 560);
    const fg2 = c.createRadialGradient(CX, CY, 0, CX, CY, RI);
    fg2.addColorStop(0, "rgba(12,10,20,.0)"); fg2.addColorStop(1, "rgba(246,169,68,.05)");
    c.fillStyle = fg2; c.fillRect(0, 0, 560, 560);
    c.restore();

    // guides
    c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.075)"; c.setLineDash([2, 7]);
    [0.25, 0.5, 0.75, 1].forEach((f) => { c.beginPath(); c.arc(CX, CY, RI * f, 0, TAU); c.stroke(); });
    c.setLineDash([]); c.strokeStyle = "rgba(255,255,255,.05)";
    c.beginPath(); c.moveTo(CX - RI, CY); c.lineTo(CX + RI, CY); c.moveTo(CX, CY - RI); c.lineTo(CX, CY + RI); c.stroke();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU, major = i % 6 === 0, r0 = 203, r1 = major ? 211 : 207;
      c.strokeStyle = major ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.1)";
      c.beginPath(); c.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0); c.lineTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1); c.stroke();
    }

    // head
    if (!S.freeze) S.head = (S.head + (dt / 1000 / S.sampleDur) * (S.reverse ? -1 : 1) + 1) % 1;
    const headA = S.head * TAU - Math.PI / 2;

    // radial waveform
    const N = 240, pk = S.peaks;
    c.lineCap = "round"; c.lineWidth = 2.2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU - Math.PI / 2;
      const peak = pk[Math.floor((i / N) * pk.length)];
      S.pulse[i] *= 0.93;
      const amp = (0.14 + 0.86 * peak) * (0.92 + 0.08 * Math.sin(t * 2.2 + i * 0.35)) * (1 + vals.density * 0.12) + S.pulse[i] * 0.55;
      const half = 2 + amp * 15;
      let behind = (headA - a) % TAU; if (behind < 0) behind += TAU; if (S.reverse) behind = TAU - behind;
      const played = behind < 1.1;
      c.strokeStyle = played ? `rgba(255,${Math.round(190 - behind * 40)},${Math.round(110 + behind * 30)},${0.95 - behind * 0.45})` : `rgba(165,140,255,${0.34 + S.pulse[i] * 0.6})`;
      const cs = Math.cos(a), sn = Math.sin(a);
      c.beginPath(); c.moveTo(CX + cs * (RW - half), CY + sn * (RW - half)); c.lineTo(CX + cs * (RW + half), CY + sn * (RW + half)); c.stroke();
    }
    // head marker
    c.save(); c.shadowColor = "#f6a944"; c.shadowBlur = 14; c.strokeStyle = "#ffd08a"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(CX + Math.cos(headA) * 200, CY + Math.sin(headA) * 200); c.lineTo(CX + Math.cos(headA) * 238, CY + Math.sin(headA) * 238); c.stroke(); c.restore();

    // outer ring
    const rise = gs.rise;
    c.lineWidth = 2 + rise * 2.5;
    let rg;
    if (c.createConicGradient) {
      rg = c.createConicGradient(t * 0.18, CX, CY);
      rg.addColorStop(0, "#8f74ff"); rg.addColorStop(0.5, "#f6a944"); rg.addColorStop(1, "#8f74ff");
    } else rg = "#8f74ff";
    c.strokeStyle = rg; c.beginPath(); c.arc(CX, CY, RR, 0, TAU); c.stroke();
    if (rise > 0.02) {
      c.strokeStyle = `rgba(255,208,138,${rise * 0.35})`; c.lineWidth = 1;
      c.beginPath(); c.arc(CX, CY, RR + 6 + Math.sin(t * 9) * 2 * rise, 0, TAU); c.stroke();
    }

    // shockwaves
    S.shocks = S.shocks.filter((s) => now - s.t0 < 1300);
    S.shocks.forEach((s) => {
      const k = (now - s.t0) / 1300, r = easeOut(k) * RR * 1.06;
      c.strokeStyle = `rgba(255,214,150,${(1 - k) * 0.85})`; c.lineWidth = 1 + 5 * (1 - k);
      c.beginPath(); c.arc(CX, CY, r, 0, TAU); c.stroke();
    });

    // ripples
    S.ripples = S.ripples.filter((r) => now - r.t0 < 1400);
    S.ripples.forEach((r) => {
      const k = (now - r.t0) / 1400, rad = easeOut(k) * (r.big ? 90 : 56);
      c.strokeStyle = `rgba(195,178,255,${(1 - k) * 0.6})`; c.lineWidth = 1.2;
      c.beginPath(); c.arc(px, py, rad, 0, TAU); c.stroke();
    });

    // grains
    const rate = (0.9 + vals.density * 4.2 + rise * 3.2) * (S.freeze ? 0.25 : 1);
    S.spawnAcc += (dt / 16.7) * rate;
    while (S.spawnAcc >= 1 && S.grains.length < 900) {
      S.spawnAcc -= 1;
      const a = Math.random() * TAU, sp = (50 + Math.random() * 170) * (0.7 + (1 - vals.size) * 0.7) * (1 + rise * 0.9);
      const hue = Math.random();
      S.grains.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 0.9 + vals.size * 2.3 * Math.random(), col: hue < 0.45 ? "255,232,196" : hue < 0.8 ? "184,164,255" : "246,169,68", curl: (Math.random() - 0.5) * 0.9 * (0.4 + vals.spray) });
    }
    S.spawnAcc = Math.min(S.spawnAcc, 4);
    const alive = [];
    c.lineCap = "round";
    for (const g of S.grains) {
      const sec = dt / 1000, cs = Math.cos(g.curl * sec), sn = Math.sin(g.curl * sec);
      const nvx = g.vx * cs - g.vy * sn, nvy = g.vx * sn + g.vy * cs; g.vx = nvx; g.vy = nvy;
      const ox = g.x, oy = g.y; g.x += g.vx * sec; g.y += g.vy * sec;
      const dx = g.x - CX, dy = g.y - CY, dist = Math.hypot(dx, dy);
      if (dist >= RW - 18) {
        let ang = Math.atan2(dy, dx) + Math.PI / 2; if (ang < 0) ang += TAU;
        const idx = Math.floor((ang / TAU) * 240) % 240;
        for (let d = -2; d <= 2; d++) S.pulse[(idx + d + 240) % 240] = Math.max(S.pulse[(idx + d + 240) % 240], 1 - Math.abs(d) * 0.3);
        continue;
      }
      alive.push(g);
      const fade = clamp(1 - dist / RW) * 0.8 + 0.2;
      c.strokeStyle = `rgba(${g.col},${0.18 * fade + 0.1})`; c.lineWidth = 1;
      c.beginPath(); c.moveTo(ox - g.vx * 0.16, oy - g.vy * 0.16); c.lineTo(g.x, g.y); c.stroke();
      c.fillStyle = `rgba(${g.col},${0.55 + 0.4 * fade})`;
      c.beginPath(); c.arc(g.x, g.y, g.s, 0, TAU); c.fill();
    }
    S.grains = alive;

    // puck
    const pulse = 1 + Math.sin(t * 3) * 0.08;
    c.save(); c.shadowColor = "#c3b2ff"; c.shadowBlur = 22;
    c.strokeStyle = "rgba(195,178,255,.9)"; c.lineWidth = 1.4;
    c.beginPath(); c.arc(px, py, (S.dragging ? 19 : 15) * pulse, 0, TAU); c.stroke(); c.restore();
    c.strokeStyle = "#ffd08a"; c.lineWidth = 1.6; c.beginPath(); c.arc(px, py, 8, 0, TAU); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(px, py, 3.2, 0, TAU); c.fill();
  }

  function drawMini() {
    const { w, h } = miniSize, c = mctx; c.clearRect(0, 0, w, h);
    const n = 76, bw = w / n, mid = h / 2;
    for (let i = 0; i < n; i++) {
      const p = S.peaks[Math.floor((i / n) * S.peaks.length)], hh = 2 + p * (h - 6);
      const pos = i / n, behind = (S.head - pos + 1) % 1, played = S.reverse ? false : behind < 0.18;
      c.fillStyle = played ? "#ffd08a" : "rgba(165,140,255,.55)";
      c.fillRect(i * bw + 1, mid - hh / 2, Math.max(1.5, bw - 2), hh);
    }
    c.fillStyle = "#ffd08a"; c.fillRect(S.head * w - 1, 0, 2, h);
  }

  function drawMeters(now) {
    const { w, h } = mSize, c = mtx; c.clearRect(0, 0, w, h);
    const segs = 56, sw = (w - (segs - 1) * 2) / segs;
    [0, 1].forEach((ch) => {
      const lvl = S.meter[ch], y = ch * 16, lit = Math.round(lvl * segs);
      for (let i = 0; i < segs; i++) {
        const f = i / segs;
        const col = f < 0.6 ? "143,116,255" : f < 0.85 ? "246,169,68" : "255,111,145";
        c.fillStyle = i < lit ? `rgba(${col},.95)` : "rgba(255,255,255,.07)";
        c.fillRect(i * (sw + 2), y, sw, 11);
      }
    });
  }

  /* ---------- main loop ---------- */
  let last = performance.now(), frame = 0;
  function loop(now) {
    const dt = Math.min(50, now - last); last = now; frame++;

    // evolve drift
    if (S.evolve && !S.dragging && !S.gesture) {
      if (now > S.nextTarget) {
        const a = Math.random() * TAU, m = Math.sqrt(Math.random()) * 0.88;
        S.tx = Math.cos(a) * m; S.ty = Math.sin(a) * m; S.nextTarget = now + 2800 + Math.random() * 3200;
        S.ripples.push({ t0: now });
      }
      S.px = lerp(S.px, S.tx, 1 - Math.pow(0.5, dt / 380)); S.py = lerp(S.py, S.ty, 1 - Math.pow(0.5, dt / 380));
    }
    const gs = gestureState(now);
    if (S.gesture && S.gesture.type !== "drop") {
      const k = gs.t < 0.75 || S.gesture.type === "riser" ? gs.rise : 0;
      S.px = lerp(S.px, 0.15 + 0.7 * k, 0.04); S.py = lerp(S.py, 0.25 - 0.95 * k, 0.04);
    }

    const g = { density: gs.rise * 0.45 - gs.drop * 0.55, size: -gs.rise * 0.35 + gs.drop * 0.3, pitch: gs.rise * 0.4 - gs.drop * 0.5, filter: gs.rise * 0.5 - gs.drop * 0.6, space: gs.rise * 0.25 + gs.drop * 0.45, drive: gs.rise * 0.3 - gs.drop * 0.15, spray: gs.rise * 0.3 };
    const vals = {};
    for (const id in P) {
      const k = P[id];
      vals[id] = clamp(k.v + S.px * k.ax + -S.py * k.ay + (g[id] || 0));
      k.render(vals[id]);
    }
    kCloud.render(clamp(kCloud.v + gs.rise * 0.25 - gs.drop * 0.2));
    kSpec.render(clamp(kSpec.v + gs.rise * 0.3 + gs.drop * 0.2));

    drawOrb(now, dt, vals, gs);
    drawMini();
    drawGesture(now);

    // mapping bars + readout
    mapRows.forEach((r) => { const v = r.ax === "x" ? (S.px + 1) / 2 : (1 - S.py) / 2; r.bar.style.width = (clamp(v) * 100).toFixed(1) + "%"; });
    if (frame % 4 === 0) {
      $("#rx").textContent = Math.round(((S.px + 1) / 2) * 100); $("#ry").textContent = Math.round(((1 - S.py) / 2) * 100);
      const lm = $$(".lm i"); const muted = $$(".mini").map((b) => b.getAttribute("aria-pressed") === "true");
      const target = [0.25 + vals.density * 0.7, 0.2 + (1 - vals.pitch) * 0.3 + (S.reverse ? 0.2 : 0), 0.1 + vals.space * 0.5 + vals.filter * 0.2];
      target.forEach((tg, i) => { S.level[i] = lerp(S.level[i], muted[i] ? 0 : clamp(tg + (Math.random() - 0.5) * 0.25), 0.4); lm[i].style.width = (S.level[i] * 100).toFixed(0) + "%"; });
      const master = (S.level[0] + S.level[1] + S.level[2]) / 3 * (0.4 + wet.value / 250);
      S.meter[0] = lerp(S.meter[0], clamp(master + (Math.random() - 0.5) * 0.15), 0.5); S.meter[1] = lerp(S.meter[1], clamp(master + (Math.random() - 0.5) * 0.15), 0.5);
      $("#dbRead").textContent = (-30 + master * 28).toFixed(1) + " dB";
      if (S.rec) { const s = (now - S.rec) / 1000; $("#recTime").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + (s % 60).toFixed(1).padStart(4, "0"); }
    }
    drawMeters(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
