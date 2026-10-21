/* explode.js – "exploded view" for deterministic product-demo videos.
 *
 * A page tilts into a 3D view, selected components lift out of it as floating cards (soft cast shadows,
 * optional labels with leader lines, dashed guides back to their origin), can be focused one by one, and
 * the page reassembles. Pure function of t: createExplode(cfg) returns a state function (t) => void that sets
 * every style it touches on every call. No CSS transitions, rAF, Date or Math.random.
 *
 * Classic script (works from file://). Defines the global createExplode. Injects its own CSS (#xp-style).
 * Every plane is a flat element with its own full `perspective(...) rotateX rotateZ translate3d` transform, so
 * no element needs transform-style: preserve-3d (which overflow:hidden / filter / opacity ancestors break).
 * Lifted components are clones with inlined computed styles, positioned from the measured rect of the source.
 * See README.md for the API, options and gotchas.
 */
(function (global) {
  "use strict";

  const CSS = `
.xp-overlay { position: absolute; pointer-events: none; overflow: visible; isolation: isolate; z-index: 0;
  --xp-ink: #063342; --xp-backdrop: #e8ecef; --xp-tint: #063342; --xp-edge: #d3dbe0; --xp-edge-side: #c4ced5;
  --xp-slot: #dfe5e9; --xp-slot-line: rgba(6, 51, 66, .26); --xp-shadow: #0a2a38; --xp-line: rgba(6, 51, 66, .55);
  --xp-wash: #eef1f3; --xp-label-bg: #ffffff; --xp-label-fg: #063342; --xp-label-size: 14px; }
.xp-plane { position: absolute; left: 0; top: 0; transform-origin: 0 0; backface-visibility: visible; box-sizing: border-box; }
.xp-card { overflow: hidden; }
.xp-dim { position: absolute; inset: 0; background: var(--xp-wash); opacity: 0; }
.xp-slot { background: var(--xp-slot); border: 1px dashed var(--xp-slot-line); box-shadow: inset 0 1px 4px rgba(6, 51, 66, .12); }
.xp-shadow { background: var(--xp-shadow); }
.xp-tint { background: var(--xp-tint); }
.xp-edge { background: var(--xp-edge); }
.xp-edge.side { background: var(--xp-edge-side); }
.xp-lines { position: absolute; left: 0; top: 0; overflow: visible; }
.xp-lines line { stroke: var(--xp-line); stroke-width: 1.1; fill: none; }
.xp-lines line.guide { stroke-dasharray: 3 4; stroke-width: 1; }
.xp-lines circle { fill: var(--xp-ink); stroke: #fff; stroke-width: 1.5; }
.xp-label { position: absolute; left: 0; top: 0; white-space: nowrap; box-sizing: border-box;
  font-size: var(--xp-label-size); font-weight: 500; line-height: 1; letter-spacing: .01em;
  padding: 7px 11px 7px; border-radius: 5px; --f: 0;
  color: color-mix(in srgb, #ffffff calc(var(--f) * 100%), var(--xp-label-fg));
  background: color-mix(in srgb, var(--xp-ink) calc(var(--f) * 100%), var(--xp-label-bg));
  border: 1px solid color-mix(in srgb, var(--xp-ink) calc(18% + var(--f) * 82%), transparent);
  box-shadow: 0 1px 2px rgba(6, 51, 66, .08), 0 4px 14px rgba(6, 51, 66, .08); }
`;

  const DEG = Math.PI / 180;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
  const easeInOut = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const smooth = (p) => { p = clamp01(p); return p * p * (3 - 2 * p); };
  const q = (s) => (typeof s === "string" ? document.querySelector(s) : s);
  const f2 = (v) => Math.round(v * 100) / 100;
  const warned = new Set();
  const warn = (m) => { if (!warned.has(m)) { warned.add(m); console.warn(m); } };
  const transparent = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);

  function injectCss() {
    if (document.getElementById("xp-style")) return;
    const s = document.createElement("style");
    s.id = "xp-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Cloning with inlined computed styles ----------
  const TABLE_BLOCK = new Set(["table", "inline-table", "table-row-group", "table-header-group", "table-footer-group", "table-caption", "table-cell"]);

  /** Deep clone of src whose look does not depend on its DOM context (styles inlined, table parts de-tabled). */
  function snapshot(src, k) {
    const clone = src.cloneNode(true);
    const S = [src, ...src.querySelectorAll("*")], C = [clone, ...clone.querySelectorAll("*")];
    for (let n = 0; n < S.length; n++) {
      const s = S[n], c = C[n], cs = getComputedStyle(s);
      let txt = "";
      for (let j = 0; j < cs.length; j++) { const p = cs[j]; txt += `${p}:${cs.getPropertyValue(p)};`; }
      c.style.cssText = txt;
      const d = cs.display;
      if (d === "table-row" || TABLE_BLOCK.has(d) || d.startsWith("table-column")) {
        // Outside its table a row/cell lays out differently: freeze the used box instead.
        const r = s.getBoundingClientRect();
        c.style.display = d === "table-row" ? "flex" : d.startsWith("table-column") ? "none" : "block";
        c.style.flex = "0 0 auto";
        c.style.boxSizing = "border-box";
        c.style.width = r.width / k + "px";
        c.style.height = r.height / k + "px";
      }
      for (const a of [...c.attributes]) {
        if (a.name === "id" || a.name === "class" || a.name === "name" || a.name === "for" || a.name.startsWith("data-")) c.removeAttribute(a.name);
      }
      if (s.tagName === "INPUT" || s.tagName === "TEXTAREA" || s.tagName === "SELECT") c.value = s.value;
    }
    return clone;
  }

  /** Background a cut-out of src should have: its own, or the first opaque ancestor's. */
  function cutoutBg(src) {
    for (let e = src; e && e !== document.documentElement; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor;
      if (!transparent(bg)) return bg;
    }
    return "#fff";
  }

  function createExplode(cfg) {
    injectCss();
    const root = q(cfg.root);
    if (!root) throw new Error(`createExplode: fant ikke root ${cfg.root}`);
    const space = q(cfg.space) || document.getElementById("page") || root.offsetParent || document.body;

    const tilt = { rx: 50, rz: -12, duration: 1.4, perspective: 2600, ...(cfg.tilt || {}) };
    const t0 = cfg.t0 ?? 0;
    const stagger = cfg.liftStagger ?? .2;
    const liftDur = cfg.liftDuration ?? .9;
    const reassembleAt = cfg.reassembleAt ?? Infinity;
    const focusFade = cfg.focusFade ?? .5;
    const focusLift = cfg.focusLift ?? 34;
    const wash = cfg.dim ?? .62;
    const labelDim = cfg.labelDim ?? .55;
    const slabTint = cfg.slabTint ?? .05;
    const slabDim = cfg.slabDim ?? .06;
    const shadow = cfg.shadow ?? .16;
    const thickness = cfg.thickness ?? 10;
    const guides = cfg.guides ?? true;
    const backdrop = cfg.backdrop === undefined ? "#e8ecef" : cfg.backdrop;
    const ease = cfg.ease ?? easeInOut;
    const P = tilt.perspective;

    // ---------- Layers ----------
    const L = cfg.layers.map((l, i) => ({
      i, sel: l.sel, depth: l.depth ?? 80, label: l.label ?? null, side: l.labelSide ?? "right",
      gap: l.labelGap ?? 40, pad: l.pad ?? 10, radius: l.radius ?? 10, bg: l.background ?? null,
      parent: -1, key: null, clone: null,
    }));
    const n = L.length;
    // Parent = nearest other layer whose element contains this one (nested layers ride on their parent).
    L.forEach((l) => {
      const src = q(l.sel);
      if (!src) { warn(`createExplode: fant ikke ${l.sel}`); return; }
      let best = -1;
      L.forEach((o, j) => {
        const os = j !== l.i && q(o.sel);
        if (os && os !== src && os.contains(src) && (best < 0 || q(L[best].sel).contains(os))) best = j;
      });
      l.parent = best;
      l.bg = l.bg ?? cutoutBg(src);
    });
    const indexOf = (ref) => {
      if (typeof ref === "number") return ref;
      const i = L.findIndex((l) => l.label === ref || l.sel === ref);
      if (i < 0) throw new Error(`createExplode: ukjent lag ${ref}`);
      return i;
    };
    const focusWins = (cfg.focus || []).map((w) => ({ ...w, i: indexOf(w.layer) }));

    // ---------- Timeline ----------
    const liftStart = (i) => t0 + tilt.duration * .55 + i * stagger;
    const landStart = (i) => reassembleAt + .25 + (n - 1 - i) * stagger;     // reverse order
    const tiltOut = n ? landStart(0) + liftDur * .55 : reassembleAt;
    const times = {
      tiltIn: [t0, t0 + tilt.duration],
      lift: L.map((_, i) => [liftStart(i), liftStart(i) + liftDur]),
      labelsIn: L.map((_, i) => liftStart(i) + liftDur * .65),
      labelsOut: [reassembleAt, reassembleAt + .3],
      land: L.map((_, i) => [landStart(i), landStart(i) + liftDur]),
      tiltOut: [tiltOut, tiltOut + tilt.duration],
      end: tiltOut + tilt.duration,
    };
    const tiltAt = (t) => ease(prog(t, t0, t0 + tilt.duration)) * (1 - ease(prog(t, tiltOut, tiltOut + tilt.duration)));
    const liftAt = (i, t) => ease(prog(t, liftStart(i), liftStart(i) + liftDur)) * (1 - ease(prog(t, landStart(i), landStart(i) + liftDur)));
    const labelAt = (i, t) => smooth(prog(t, times.labelsIn[i], times.labelsIn[i] + .35)) * (1 - smooth(prog(t, reassembleAt, reassembleAt + .3)));
    // Fades are centred on t0/t1, so abutting windows (b.t0 = a.t1) cross-fade without a dip.
    const winAt = (w, t) => ease(prog(t, w.t0 - focusFade / 2, w.t0 + focusFade / 2)) * (1 - ease(prog(t, w.t1 - focusFade / 2, w.t1 + focusFade / 2)));

    /** Everything about frame t that does not need the DOM. */
    function model(t) {
      const tp = tiltAt(t);
      const f = L.map(() => 0);
      focusWins.forEach((w) => { f[w.i] += winAt(w, t); });
      const G = clamp01(f.reduce((a, b) => a + b, 0));
      const zs = [];
      const zOf = (i) => {
        if (zs[i] !== undefined) return zs[i];
        const zp = L[i].parent >= 0 ? zOf(L[i].parent) : 0;
        return (zs[i] = zp + (L[i].depth + focusLift * clamp01(f[i])) * liftAt(i, t));
      };
      const lay = L.map((l, i) => {
        const z = zOf(i), zp = l.parent >= 0 ? zOf(l.parent) : 0, e = z - zp;
        let bright = f[i];
        for (let p = l.parent; p >= 0; p = L[p].parent) bright += f[p];
        const dimA = clamp01(G - clamp01(bright));
        const k = smooth(e / 40);
        return { z, zp, e, k, dimA, f: clamp01(f[i]), padE: l.pad * k, lab: labelAt(i, t) * (1 - (1 - labelDim) * dimA) };
      });
      return { t, tp, rx: tilt.rx * tp, rz: tilt.rz * tp, G, lay };
    }

    // ---------- Measuring (always with the root flat) ----------
    const orig = { transform: root.style.transform, origin: root.style.transformOrigin, shadow: root.style.boxShadow };
    const anc = [];
    if (backdrop) {
      for (let e = root.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor;
        if (!transparent(bg)) anc.push({ e, bg, orig: e.style.backgroundColor });
      }
    }
    let M = null;
    function measure(m) {
      const saved = root.style.transform;
      root.style.transform = orig.transform;
      const sr = space.getBoundingClientRect(), k = sr.width / (space.offsetWidth || sr.width || 1);
      const rel = (e) => {
        const r = e.getBoundingClientRect();
        return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
      };
      const srcs = L.map((l) => q(l.sel));
      M = { root: rel(root), layers: srcs.map((s) => (s ? rel(s) : null)) };
      // Clone (re)builds happen here too: computed styles and cell rects must be read with the root flat.
      if (m) {
        L.forEach((l, i) => {
          const s = srcs[i];
          if (!s || m.lay[i].e <= .01) return;
          const r = M.layers[i], key = s.outerHTML + "|" + f2(r.w) + "x" + f2(r.h);
          if (key === l.key) return;
          l.key = key;
          const c = snapshot(s, k);
          Object.assign(c.style, { position: "absolute", margin: "0", transform: "none", boxSizing: "border-box",
            width: r.w + "px", height: r.h + "px", right: "auto", bottom: "auto", flex: "none" });
          if (c.style.display === "inline") c.style.display = "inline-block";
          l.cardEl.replaceChildren(c, l.dimEl);
          l.clone = c;
        });
      }
      root.style.transform = saved;
      return M;
    }
    const origin = () => cfg.origin ?? { x: M.root.x + M.root.w / 2, y: M.root.y + M.root.h / 2 };

    /** Page point (x, y) lifted to height z → projected point in page (overlay) coordinates. */
    function project(x, y, z, m, O = origin()) {
      const a = m.rz * DEG, b = m.rx * DEG;
      const px = x - O.x, py = y - O.y;
      const x1 = px * Math.cos(a) - py * Math.sin(a), y1 = px * Math.sin(a) + py * Math.cos(a);
      const y2 = y1 * Math.cos(b) - z * Math.sin(b), z2 = y1 * Math.sin(b) + z * Math.cos(b);
      const w = 1 - z2 / P;
      return { x: O.x + x1 / w, y: O.y + y2 / w };
    }
    /** Transform for an element whose layout top-left is (ex, ey) (transform-origin 0 0), lifted to z. */
    const worldTf = (ex, ey, z, m, O) =>
      `translate(${f2(O.x - ex)}px, ${f2(O.y - ey)}px) perspective(${P}px) rotateX(${f2(m.rx)}deg) rotateZ(${f2(m.rz)}deg) ` +
      `translate3d(${f2(ex - O.x)}px, ${f2(ey - O.y)}px, ${f2(z)}px)`;

    // ---------- DOM ----------
    const div = (cls) => Object.assign(document.createElement("div"), { className: cls });
    const svgEl = (tag, cls) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); if (cls) e.setAttribute("class", cls); return e; };
    const overlay = div("xp-overlay");
    if (cfg.className) overlay.classList.add(...cfg.className.split(/\s+/));
    const edgeFront = div("xp-plane xp-edge"), edgeSide = div("xp-plane xp-edge side"), tint = div("xp-plane xp-tint");
    overlay.append(edgeFront, edgeSide, tint);
    const svg = svgEl("svg", "xp-lines");
    L.forEach((l) => {
      l.slotEl = div("xp-plane xp-slot");
      l.shadowEl = div("xp-plane xp-shadow");
      l.cardEl = div("xp-plane xp-card");
      l.cardEl.style.background = l.bg;
      l.dimEl = div("xp-dim");
      overlay.append(l.slotEl, l.shadowEl, l.cardEl);
      l.guideEls = guides ? [svgEl("line", "guide"), svgEl("line", "guide")] : [];
      l.leaderEl = l.label ? svgEl("line", "leader") : null;
      l.dotEl = l.label ? svgEl("circle") : null;
      svg.append(...l.guideEls, ...(l.label ? [l.leaderEl, l.dotEl] : []));
      if (l.label) { l.labelEl = div("xp-label"); l.labelEl.textContent = l.label; }
    });
    overlay.appendChild(svg);
    L.forEach((l) => l.labelEl && overlay.appendChild(l.labelEl));
    svg.style.zIndex = 100000;
    L.forEach((l) => l.labelEl && (l.labelEl.style.zIndex = 100001));

    function attach() {
      if (overlay.isConnected) return;
      const parent = space.parentElement;
      let top = root;
      while (top.parentElement && top.parentElement !== parent) top = top.parentElement;
      if (top.parentElement === parent) top.after(overlay); else parent.appendChild(overlay);
    }

    let active = null;
    function deactivate() {
      if (active === false) return;
      active = false;
      overlay.style.display = "none";
      root.style.transform = orig.transform;
      root.style.transformOrigin = orig.origin;
      root.style.boxShadow = orig.shadow;
      anc.forEach((a) => { a.e.style.backgroundColor = a.orig; });
    }

    const setPlane = (e, x, y, w, h, tf) => {
      e.style.left = f2(x) + "px"; e.style.top = f2(y) + "px";
      e.style.width = f2(w) + "px"; e.style.height = f2(h) + "px";
      e.style.transform = tf;
    };
    const line = (e, a, b, o) => {
      e.setAttribute("x1", f2(a.x)); e.setAttribute("y1", f2(a.y));
      e.setAttribute("x2", f2(b.x)); e.setAttribute("y2", f2(b.y));
      e.style.opacity = f2(o);
    };

    /** Card rect (flat, page coords) of layer i in model m. */
    const cardRect = (i, m) => {
      const r = M.layers[i], pe = m.lay[i].padE;
      return r && { x: r.x - pe, y: r.y - pe, w: r.w + 2 * pe, h: r.h + 2 * pe };
    };
    /** Label anchor on the card edge (A) and label point (B), both at the card's height. */
    function labelPoints(i, m, O) {
      const l = L[i], c = cardRect(i, m), z = m.lay[i].z;
      if (l.side === "left") return [project(c.x, c.y + c.h / 2, z, m, O), project(c.x - l.gap, c.y + c.h / 2, z, m, O)];
      if (l.side === "top") return [project(c.x + c.w / 2, c.y, z, m, O), project(c.x + c.w / 2, c.y - l.gap, z, m, O)];
      return [project(c.x + c.w, c.y + c.h / 2, z, m, O), project(c.x + c.w + l.gap, c.y + c.h / 2, z, m, O)];
    }

    // ---------- The state function ----------
    function state(t) {
      const m = model(t);
      if (!(m.tp > 0 || m.lay.some((s) => s.e > .01))) { deactivate(); return; }
      attach();
      active = true;
      overlay.style.display = "";
      Object.assign(overlay.style, { left: space.offsetLeft + "px", top: space.offsetTop + "px", width: space.offsetWidth + "px", height: space.offsetHeight + "px" });
      measure(m);
      const O = origin(), R = M.root, tp = m.tp;

      // Slab: the real root page, tilted.
      root.style.transformOrigin = "0 0";
      root.style.transform = worldTf(R.x, R.y, 0, m, O);
      root.style.boxShadow = `0 ${f2(36 * tp)}px ${f2(70 * tp)}px rgba(6, 40, 55, ${f2(.16 * tp)}), 0 ${f2(3 * tp)}px ${f2(8 * tp)}px rgba(6, 40, 55, ${f2(.08 * tp)})`;
      anc.forEach((a) => { a.e.style.backgroundColor = `color-mix(in srgb, ${backdrop} ${f2(tp * 100)}%, ${a.bg})`; });
      const th = thickness * tp;
      setPlane(edgeFront, R.x, R.y + R.h, R.w, th, worldTf(R.x, R.y + R.h, 0, m, O) + " rotateX(-90deg)");
      const sx = m.rz >= 0 ? R.x + R.w : R.x;
      setPlane(edgeSide, sx, R.y, th, R.h, worldTf(sx, R.y, 0, m, O) + " rotateY(90deg)");
      edgeFront.style.display = edgeSide.style.display = th > .3 ? "" : "none";
      setPlane(tint, R.x, R.y, R.w, R.h, worldTf(R.x, R.y, 0, m, O));
      tint.style.opacity = f2(slabTint * tp + slabDim * m.G);

      // Planes sorted by height: slot + shadow ride on the parent plane, the card at its own z.
      const order = [{ e: edgeFront, k: -3 }, { e: edgeSide, k: -3 }, { e: tint, k: -2 }];
      L.forEach((l, i) => {
        const s = m.lay[i], c = cardRect(i, m);
        const on = !!c && s.e > .01;
        l.slotEl.style.display = l.shadowEl.style.display = l.cardEl.style.display = on ? "" : "none";
        if (l.labelEl) l.labelEl.style.display = on && s.lab > .001 ? "" : "none";
        [...l.guideEls, l.leaderEl, l.dotEl].forEach((e) => e && (e.style.display = on ? "" : "none"));
        if (!on) return;
        const rad = l.radius * s.k;

        // Slot: the hole left behind.
        setPlane(l.slotEl, c.x, c.y, c.w, c.h, worldTf(c.x, c.y, s.zp, m, O));
        l.slotEl.style.borderRadius = f2(rad) + "px";
        l.slotEl.style.opacity = f2(smooth(s.e / 16));

        // Cast shadow on the parent plane: softer, larger and lighter the higher the card.
        const blur = 4 + s.e * .22, dy = 2 + s.e * .1, spread = s.e * .02;
        const sx0 = c.x - spread + s.e * .02, sy0 = c.y - spread + dy;
        setPlane(l.shadowEl, sx0, sy0, c.w + 2 * spread, c.h + 2 * spread, worldTf(sx0, sy0, s.zp, m, O));
        l.shadowEl.style.borderRadius = f2(rad + spread) + "px";
        l.shadowEl.style.filter = `blur(${f2(blur)}px)`;
        l.shadowEl.style.opacity = f2(shadow * smooth(s.e / 16) * (1 - .45 * clamp01(s.e / 300)));

        // Card: the lifted clone.
        setPlane(l.cardEl, c.x, c.y, c.w, c.h, worldTf(c.x, c.y, s.z, m, O));
        l.cardEl.style.borderRadius = f2(rad) + "px";
        l.dimEl.style.opacity = f2(wash * s.dimA);
        l.cardEl.style.boxShadow = `0 0 0 1px color-mix(in srgb, var(--xp-ink) ${f2(10 * s.k + 30 * s.f)}%, transparent), ` +
          `0 1px 2px color-mix(in srgb, var(--xp-ink) ${f2(8 * s.k)}%, transparent)`;
        if (l.clone) { l.clone.style.left = f2(s.padE) + "px"; l.clone.style.top = f2(s.padE) + "px"; }

        order.push({ e: l.slotEl, k: s.zp + .1 }, { e: l.shadowEl, k: s.zp + .2 }, { e: l.cardEl, k: s.z + .3 });

        // Guides from the card's front corners down to where it came from.
        if (guides) {
          const go = .7 * smooth(s.e / 30) * (1 - .6 * s.dimA);
          const yb = c.y + c.h;
          line(l.guideEls[0], project(c.x, yb, s.z, m, O), project(c.x, yb, s.zp, m, O), go);
          line(l.guideEls[1], project(c.x + c.w, yb, s.z, m, O), project(c.x + c.w, yb, s.zp, m, O), go);
        }
        // Label + leader line.
        if (l.label) {
          const [A, B] = labelPoints(i, m, O);
          line(l.leaderEl, A, B, s.lab);
          l.dotEl.setAttribute("cx", f2(A.x)); l.dotEl.setAttribute("cy", f2(A.y)); l.dotEl.setAttribute("r", 3);
          l.dotEl.style.opacity = f2(s.lab);
          const ax = l.side === "left" ? "-100%" : l.side === "top" ? "-50%" : "0%", ay = l.side === "top" ? "-100%" : "-50%";
          l.labelEl.style.transform = `translate(${f2(B.x)}px, ${f2(B.y)}px) translate(${ax}, ${ay})`;
          l.labelEl.style.opacity = f2(s.lab);
          l.labelEl.style.setProperty("--f", f2(s.f));
        }
      });
      order.sort((a, b) => a.k - b.k).forEach((o, r) => { o.e.style.zIndex = 1 + r; });
    }

    // ---------- Camera helpers (page coordinates, any t) ----------
    const ensureM = () => M || measure(null);
    const bbox = (pts) => {
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    };
    const union = (rs) => bbox(rs.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]));

    /** Projected rect of a layer's card at time t (index, label or selector). withLabel: include its label. */
    function rectAt(ref, t, { withLabel = false } = {}) {
      ensureM();
      const i = indexOf(ref), m = model(t), O = origin(), c = cardRect(i, m), z = m.lay[i].z;
      if (!c) return { x: 0, y: 0, w: 0, h: 0 };
      const r = bbox([[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]].map(([x, y]) => project(x, y, z, m, O)));
      if (!withLabel || !L[i].label) return r;
      const B = labelPoints(i, m, O)[1], el = L[i].labelEl;
      const w = el.offsetWidth || L[i].label.length * 8 + 24, h = el.offsetHeight || 30, side = L[i].side;
      const lx = side === "left" ? B.x - w : side === "top" ? B.x - w / 2 : B.x, ly = side === "top" ? B.y - h : B.y - h / 2;
      return union([r, { x: lx, y: ly, w, h }]);
    }
    /** Projected bounds of the slab + every layer (+ labels) at time t. */
    function boundsAt(t, { labels = true, slab = false } = {}) {
      ensureM();
      const m = model(t), O = origin(), R = M.root;
      const rs = L.map((_, i) => rectAt(i, t, { withLabel: labels }));
      if (slab) rs.push(bbox([[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h + thickness], [R.x + R.w, R.y + R.h + thickness]].map(([x, y]) => project(x, y, 0, m, O))));
      return union(rs);
    }
    /** Camera key centred on a layer at time `at` (default t). Pass s yourself. */
    const camKey = (ref, { t, s, at = t, dx = 0, dy = 0, ease: e, withLabel = true }) =>
      ({ t, s, dx, dy, ...(e ? { ease: e } : {}), rect: () => rectAt(ref, at, { withLabel }) });
    /** Camera key that fits the whole exploded view at time `at` into the stage (scale computed lazily). */
    function fitKey({ t, at = t, margin = 60, minS = .5, maxS = 2, stageW = 1920, stageH = 1080, dx = 0, dy = 0, ease: e, slab = false }) {
      return {
        t, dx, dy, ...(e ? { ease: e } : {}),
        get s() { const b = boundsAt(at, { slab }); return Math.max(minS, Math.min(maxS, stageW / (b.w + 2 * margin), stageH / (b.h + 2 * margin))); },
        rect: () => boundsAt(at, { slab }),
      };
    }

    Object.assign(state, { times, rectAt, boundsAt, camKey, fitKey, project: (x, y, z, t) => { ensureM(); return project(x, y, z, model(t)); }, model, overlay });
    return state;
  }

  global.createExplode = createExplode;
})(window);
