function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyLanguage(root, lang) {
  const blocks = root.querySelectorAll("[data-lang]");
  for (const el of blocks) {
    const elLang = el.getAttribute("data-lang");
    el.style.display = elLang === lang ? "" : "none";
  }
}

function parseHashState() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return {};
  const params = new URLSearchParams(hash);
  const slide = Number.parseInt(params.get("s") ?? "", 10);
  const lang = params.get("lang");
  return {
    slide: Number.isFinite(slide) && slide > 0 ? slide - 1 : undefined,
    lang: lang === "ja" || lang === "en" ? lang : undefined,
  };
}

function setHashState({ slideIndex, lang }) {
  const params = new URLSearchParams();
  params.set("s", String(slideIndex + 1));
  params.set("lang", lang);
  const next = `#${params.toString()}`;
  if (window.location.hash !== next) window.location.hash = next;
}

document.addEventListener("DOMContentLoaded", async () => {
  const rootEl = document.documentElement;
  const slideEl = document.getElementById("slide");
  const slidesDataEl = document.getElementById("slides-data");
  const overviewEl = document.getElementById("overview");
  const overviewGridEl = document.getElementById("overview-grid");
  const counterEl = document.getElementById("counter");
  const progressEl = document.getElementById("progress-bar");

  const btnTheme = document.getElementById("btn-theme");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnOverview = document.getElementById("btn-overview");
  const btnLangEn = document.getElementById("btn-lang-en");
  const btnLangJa = document.getElementById("btn-lang-ja");

  let slides = [];
  let slideTitles = [];

  const state = {
    slideIndex: 0,
    lang: "en",
    overview: false,
    theme: "dark", // "dark" | "light"
  };

  function setTheme(theme) {
    state.theme = theme;
    rootEl.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem("kumoguard:26MC1:theme", theme);
    } catch {}
    if (btnTheme) btnTheme.textContent = theme === "light" ? "Light" : "Dark";
  }

  function toggleTheme() {
    setTheme(state.theme === "dark" ? "light" : "dark");
  }

  function updateButtons() {
    btnLangEn.setAttribute("aria-pressed", state.lang === "en" ? "true" : "false");
    btnLangJa.setAttribute("aria-pressed", state.lang === "ja" ? "true" : "false");
  }

  function updateChrome() {
    counterEl.textContent = `${state.slideIndex + 1} / ${slides.length}`;
    const pct = slides.length ? ((state.slideIndex + 1) / slides.length) * 100 : 0;
    progressEl.style.width = `${pct}%`;
    updateButtons();
  }

  function renderCurrentSlide() {
    slideEl.classList.add("is-transitioning");
    window.setTimeout(() => {
      const slideNode = slides[state.slideIndex];
      slideEl.innerHTML = slideNode ? slideNode.innerHTML : "";
      applyLanguage(slideEl, state.lang);
      slideEl.scrollTop = 0;
      slideEl.classList.remove("is-transitioning");
      updateChrome();
      setHashState({ slideIndex: state.slideIndex, lang: state.lang });
    }, 120);
  }

  function openOverview() {
    state.overview = true;
    overviewEl.classList.add("is-open");
    slideEl.style.display = "none";
  }

  function closeOverview() {
    state.overview = false;
    overviewEl.classList.remove("is-open");
    slideEl.style.display = "";
  }

  function toggleOverview() {
    if (state.overview) closeOverview();
    else openOverview();
  }

  function goTo(index) {
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    if (clamped === state.slideIndex) return;
    state.slideIndex = clamped;
    closeOverview();
    renderCurrentSlide();
  }

  function next() { goTo(state.slideIndex + 1); }
  function prev() { goTo(state.slideIndex - 1); }

  function setLang(lang) {
    state.lang = lang;
    applyLanguage(slideEl, state.lang);
    updateChrome();
    setHashState({ slideIndex: state.slideIndex, lang: state.lang });
  }

  if (!slidesDataEl) {
    slideEl.innerHTML = "<h2>Missing slides</h2><p>Expected an element with id=\"slides-data\".</p>";
    return;
  }

  slides = Array.from(slidesDataEl.querySelectorAll(":scope > section"));
  if (!slides.length) {
    slideEl.innerHTML = "<h2>No slides found</h2><p>Add one or more <code>&lt;section&gt;</code> elements inside <code>#slides-data</code>.</p>";
    return;
  }

  slideTitles = slides.map((node, idx) => {
    const title = node.getAttribute("data-title");
    if (title) return title;
    const h = node.querySelector("h1, h2, h3");
    return h?.textContent?.trim() || `Slide ${idx + 1}`;
  });

  overviewGridEl.innerHTML = "";
  slideTitles.forEach((title, idx) => {
    const card = document.createElement("button");
    card.className = "thumb";
    card.type = "button";
    card.innerHTML = `<div class="n">Slide ${idx + 1}</div><div class="t">${escapeHtml(title)}</div>`;
    card.addEventListener("click", () => goTo(idx));
    overviewGridEl.appendChild(card);
  });

  const fromHash = parseHashState();
  if (typeof fromHash.slide === "number") state.slideIndex = Math.max(0, Math.min(slides.length - 1, fromHash.slide));
  if (fromHash.lang) state.lang = fromHash.lang;

  try {
    const saved = window.localStorage.getItem("kumoguard:26MC1:theme");
    if (saved === "light" || saved === "dark") {
      state.theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      state.theme = "light";
    }
  } catch {}
  setTheme(state.theme);

  updateButtons();
  renderCurrentSlide();

  if (btnTheme) btnTheme.addEventListener("click", toggleTheme);
  btnPrev.addEventListener("click", prev);
  btnNext.addEventListener("click", next);
  btnOverview.addEventListener("click", toggleOverview);
  btnLangEn.addEventListener("click", () => setLang("en"));
  btnLangJa.addEventListener("click", () => setLang("ja"));

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartAt = 0;
  slideEl.addEventListener(
    "touchstart",
    (e) => {
      if (state.overview) return;
      const t = e.touches?.[0];
      if (!t) return;
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartAt = Date.now();
    },
    { passive: true },
  );
  slideEl.addEventListener(
    "touchend",
    (e) => {
      if (state.overview) return;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const dt = Date.now() - touchStartAt;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const looksHorizontal = absX > 80 && absX > absY * 2;
      const isQuickEnough = dt < 650;
      if (!looksHorizontal || !isQuickEnough) return;

      if (dx < 0) next();
      else prev();
    },
    { passive: true },
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
      e.preventDefault();
      next();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      prev();
      return;
    }
    if (e.key === "Home") { e.preventDefault(); goTo(0); return; }
    if (e.key === "End") { e.preventDefault(); goTo(slides.length - 1); return; }
    if (e.key.toLowerCase() === "o") { e.preventDefault(); toggleOverview(); return; }
    if (e.key.toLowerCase() === "e") { e.preventDefault(); setLang("en"); return; }
    if (e.key.toLowerCase() === "j") { e.preventDefault(); setLang("ja"); return; }
    if (e.key.toLowerCase() === "t") { e.preventDefault(); toggleTheme(); return; }
    if (e.key === "Escape" && state.overview) { e.preventDefault(); closeOverview(); return; }
  });

  window.addEventListener("hashchange", () => {
    const h = parseHashState();
    if (typeof h.slide === "number") goTo(h.slide);
    if (h.lang) setLang(h.lang);
  });
});
