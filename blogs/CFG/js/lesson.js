(function () {
  "use strict";

  const progressBar = document.querySelector("#progress-bar");
  const nav = document.querySelector(".jump-nav-track");
  const navLinks = [...document.querySelectorAll(".jump-nav a[href^='#']")];
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  function centerActiveLink(link) {
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const left = nav.scrollLeft + (linkRect.left - navRect.left) - ((navRect.width - linkRect.width) / 2);
    if (typeof nav.scrollTo === "function") {
      nav.scrollTo({ left: Math.max(0, left), behavior: reducedMotion?.matches ? "auto" : "smooth" });
    } else {
      nav.scrollLeft = Math.max(0, left);
    }
  }

  function updateProgress() {
    if (!progressBar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  function activate(section) {
    if (!section) return;
    const hash = `#${section.id}`;
    navLinks.forEach((link) => {
      const active = link.getAttribute("href") === hash;
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "location");
        centerActiveLink(link);
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function fallbackActiveSection() {
    const offset = window.innerHeight * .33;
    let current = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= offset) current = section;
    });
    activate(current);
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) activate(visible.target);
    }, { rootMargin: "-25% 0px -58%", threshold: [0, .15, .4] });
    sections.forEach((section) => observer.observe(section));
  } else {
    window.addEventListener("scroll", fallbackActiveSection, { passive: true });
    fallbackActiveSection();
  }

  navLinks.forEach((link) => link.addEventListener("click", () => {
    const section = document.querySelector(link.getAttribute("href"));
    activate(section);
  }));

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    requestAnimationFrame(() => {
      updateProgress();
      ticking = false;
    });
    ticking = true;
  }, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  // The reflection controls are intentionally session-only and never submitted.
  document.querySelectorAll(".diagnostic-list input").forEach((input) => {
    input.addEventListener("change", () => input.closest("label")?.classList.toggle("is-checked", input.checked));
  });
}());
