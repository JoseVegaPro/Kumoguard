(() => {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const hudPing = document.getElementById("hud-ping");
  const hudUptime = document.getElementById("hud-uptime");
  const hudLink = document.getElementById("hud-link");

  const startedAt = Date.now();
  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function renderUptime() {
    if (!hudUptime) return;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    hudUptime.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function randomPing() {
    if (!hudPing) return;
    const base = 18 + Math.random() * 40;
    const spike = Math.random() < 0.08 ? Math.random() * 120 : 0;
    hudPing.textContent = String(Math.round(base + spike));
  }

  const linkPhrases = [
    "NETRUN // SYNC",
    "UPLINK // ARMED",
    "ROUTE // CLEAN",
    "SIGNAL // LOCKED",
    "TRACE // NONE",
  ];

  function rotateLink() {
    if (!hudLink) return;
    const phrase = linkPhrases[Math.floor(Math.random() * linkPhrases.length)];
    hudLink.textContent = phrase;
  }

  renderUptime();
  randomPing();
  rotateLink();
  window.setInterval(renderUptime, 1000);
  window.setInterval(randomPing, prefersReducedMotion ? 2500 : 900);
  window.setInterval(rotateLink, prefersReducedMotion ? 6000 : 2600);

  const canvas = document.getElementById("neonfield");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    mouseX: 0,
    mouseY: 0,
    hasMouse: false,
    particles: [],
  };

  const palette = [
    { r: 0, g: 240, b: 255 },
    { r: 255, g: 43, b: 214 },
    { r: 252, g: 238, b: 9 },
  ];

  function resize() {
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.w = Math.floor(window.innerWidth);
    state.h = Math.floor(window.innerHeight);
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const count = prefersReducedMotion ? 32 : Math.max(60, Math.min(120, Math.floor((state.w * state.h) / 22000)));
    state.particles = createParticles(count);
  }

  function createParticles(count) {
    const particles = [];
    for (let idx = 0; idx < count; idx++) {
      const color = palette[idx % palette.length];
      const speed = prefersReducedMotion ? 0.18 : 0.55;
      particles.push({
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        r: 1.0 + Math.random() * 1.6,
        c: color,
        p: 0.35 + Math.random() * 0.55,
      });
    }
    return particles;
  }

  function drawGrid() {
    const spacing = 46;
    const offsetX = (Date.now() / 90) % spacing;
    const offsetY = (Date.now() / 120) % spacing;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "rgba(0, 240, 255, 0.35)";
    ctx.lineWidth = 1;
    for (let x = -spacing; x < state.w + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + offsetX, 0);
      ctx.lineTo(x + offsetX, state.h);
      ctx.stroke();
    }
    for (let y = -spacing; y < state.h + spacing; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y + offsetY);
      ctx.lineTo(state.w, y + offsetY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function step() {
    ctx.clearRect(0, 0, state.w, state.h);

    drawGrid();

    const linkDist = prefersReducedMotion ? 90 : 120;
    const linkDist2 = linkDist * linkDist;
    const mx = state.mouseX;
    const my = state.mouseY;

    for (const p of state.particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20) p.x = state.w + 20;
      if (p.x > state.w + 20) p.x = -20;
      if (p.y < -20) p.y = state.h + 20;
      if (p.y > state.h + 20) p.y = -20;

      if (state.hasMouse && !prefersReducedMotion) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < 240 * 240 && d2 > 0.001) {
          const force = (240 - Math.sqrt(d2)) / 240;
          p.vx += (dx / Math.sqrt(d2)) * force * 0.02;
          p.vy += (dy / Math.sqrt(d2)) * force * 0.02;
        }
      }

      const speedLimit = prefersReducedMotion ? 0.35 : 1.35;
      p.vx = Math.max(-speedLimit, Math.min(speedLimit, p.vx));
      p.vy = Math.max(-speedLimit, Math.min(speedLimit, p.vy));

      ctx.beginPath();
      ctx.globalAlpha = p.p;
      ctx.fillStyle = `rgba(${p.c.r}, ${p.c.g}, ${p.c.b}, 0.95)`;
      ctx.shadowColor = `rgba(${p.c.r}, ${p.c.g}, ${p.c.b}, 0.50)`;
      ctx.shadowBlur = prefersReducedMotion ? 6 : 14;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    for (let i = 0; i < state.particles.length; i++) {
      const a = state.particles[i];
      for (let j = i + 1; j < state.particles.length; j++) {
        const b = state.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > linkDist2) continue;
        const t = 1 - d2 / linkDist2;
        const alpha = 0.10 * t;

        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `rgba(${a.c.r}, ${a.c.g}, ${a.c.b}, ${alpha})`);
        grad.addColorStop(1, `rgba(${b.c.r}, ${b.c.g}, ${b.c.b}, ${alpha})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

  }

  function onMove(evt) {
    state.hasMouse = true;
    state.mouseX = evt.clientX;
    state.mouseY = evt.clientY;
  }

  function burst(x, y) {
    if (prefersReducedMotion) return;
    for (let k = 0; k < 14; k++) {
      const color = palette[(Math.random() * palette.length) | 0];
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3.2,
        vy: (Math.random() - 0.5) * 3.2,
        r: 0.9 + Math.random() * 1.4,
        c: color,
        p: 0.55,
        ttl: 140 + Math.random() * 80,
      });
    }
  }

  function prune() {
    state.particles = state.particles.filter((p) => {
      if (p.ttl == null) return true;
      p.ttl -= 1;
      p.p *= 0.992;
      return p.ttl > 0 && p.p > 0.02;
    });
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    onMove(t);
  }, { passive: true });
  window.addEventListener("click", (e) => burst(e.clientX, e.clientY), { passive: true });

  window.addEventListener("resize", resize);
  resize();

  if (prefersReducedMotion) {
    step();
  } else {
    (function animate() {
      prune();
      step();
      requestAnimationFrame(animate);
    })();
  }
})();
