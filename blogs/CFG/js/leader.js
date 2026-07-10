(() => {
  "use strict";

  const STORAGE_KEY = "cfg-live-session-v1";
  const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  const stages = [
    {
      id: "opening",
      minutes: 6,
      title: "Opening",
      prompt: "When you imagine a successful person, what do you picture—and what do you assume that person feels inside?",
      transition: "Those are not all bad desires. Now let’s ask what happens when success must carry the weight of our identity."
    },
    {
      id: "roots",
      minutes: 6,
      title: "Biblical foundation",
      prompt: "What is the difference between using our abilities faithfully and using them to prove our value?",
      transition: "Work is a good gift. Naaman’s story shows what happens when our gifts cannot meet our deepest need."
    },
    {
      id: "story",
      minutes: 14,
      title: "Naaman’s story",
      prompt: "Why was Naaman more willing to do ‘some great thing’ than to receive a simple instruction?",
      transition: "Naaman’s anger exposes more than pride. It gives us a mirror for examining what success promises us."
    },
    {
      id: "diagnosis",
      minutes: 8,
      title: "Personal diagnosis",
      prompt: "Give everyone quiet time with the five diagnostic statements. No one needs to share what they checked.",
      transition: "Success tells us to prove ourselves. The gospel invites us to receive what we could never earn."
    },
    {
      id: "grace",
      minutes: 10,
      title: "Barter and grace",
      prompt: "Where are we tempted to think, ‘If I perform well, God and other people will owe me’—and how does grace answer that?",
      transition: "Jesus has already done the great saving work. Let’s bring that freedom into our own lives."
    },
    {
      id: "discuss",
      minutes: 12,
      title: "Discussion",
      prompt: "Choose the questions that will help this group move from honest diagnosis toward received grace.",
      transition: "Move from insight to one small, concrete act of trust for the coming week."
    },
    {
      id: "practice",
      minutes: 4,
      title: "Response and prayer",
      prompt: "Invite each person to notice, receive, and practice—then close with the prayer on the group page.",
      transition: "Work hard, but do not ask your work to tell you who you are."
    }
  ];

  const progressBar = document.querySelector("#progress-bar");
  const navLinks = [...document.querySelectorAll(".jump-nav a")];
  const sections = [...document.querySelectorAll("main section[id]")];
  let activeSectionId = "";
  let scrollFrame = 0;

  function updateProgress() {
    scrollFrame = 0;
    if (!progressBar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? window.scrollY / max : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
  }

  function centerActiveLink(link) {
    const nav = link?.closest(".jump-nav");
    const scrollArea = nav?.querySelector(".jump-nav-track") || nav;
    if (!scrollArea || scrollArea.scrollWidth <= scrollArea.clientWidth) return;
    const areaRect = scrollArea.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const left = scrollArea.scrollLeft
      + (linkRect.left - areaRect.left)
      - ((areaRect.width - linkRect.width) / 2);
    const behavior = REDUCED_MOTION?.matches ? "auto" : "smooth";

    if (typeof scrollArea.scrollTo === "function") {
      scrollArea.scrollTo({ left: Math.max(0, left), behavior });
    } else {
      scrollArea.scrollLeft = Math.max(0, left);
    }
  }

  function setActiveSection(id) {
    if (!id || id === activeSectionId) return;
    activeSectionId = id;
    let activeLink = null;

    navLinks.forEach((link) => {
      const isActive = link.hash === `#${id}`;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "location");
        activeLink = link;
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (activeLink) centerActiveLink(activeLink);
  }

  function sectionNearestReadingLine() {
    if (!sections.length) return null;
    const readingLine = Math.min(window.innerHeight * 0.32, 240);
    let nearest = sections[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const containsLine = rect.top <= readingLine && rect.bottom > readingLine;
      const distance = containsLine ? -1 : Math.abs(rect.top - readingLine);
      if (distance < nearestDistance) {
        nearest = section;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  function updateActiveSection() {
    const section = sectionNearestReadingLine();
    if (section?.id) setActiveSection(section.id);
  }

  function requestScrollUpdate() {
    if (scrollFrame) return;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
    scrollFrame = schedule(() => {
      updateProgress();
      if (!("IntersectionObserver" in window)) updateActiveSection();
    });
  }

  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(() => updateActiveSection(), {
      rootMargin: "-20% 0px -60%",
      threshold: [0, 0.1, 0.35, 0.65]
    });
    sections.forEach((section) => observer.observe(section));
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (link.hash) setActiveSection(link.hash.slice(1));
    });
  });

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate);
  updateProgress();
  updateActiveSection();

  const live = {
    dialog: document.querySelector("#live-mode"),
    open: document.querySelector("#live-open"),
    close: document.querySelector("#live-close"),
    kicker: document.querySelector("#live-stage-kicker"),
    title: document.querySelector("#live-stage-title"),
    duration: document.querySelector("#live-stage-duration"),
    timer: document.querySelector("#timer-display"),
    prompt: document.querySelector("#live-prompt"),
    transition: document.querySelector("#live-transition"),
    progress: document.querySelector("#live-progress"),
    status: document.querySelector("#live-status"),
    start: document.querySelector("#timer-start"),
    pause: document.querySelector("#timer-pause"),
    reset: document.querySelector("#timer-reset"),
    previous: document.querySelector("#stage-prev"),
    next: document.querySelector("#stage-next"),
    groupLink: document.querySelector("#group-section-link")
  };

  if (!live.dialog || !live.open) return;

  let tickInterval = 0;
  let lastFocusedElement = null;
  let fallbackDialogOpen = false;

  function durationFor(stageIndex) {
    return stages[stageIndex].minutes * 60 * 1000;
  }

  function freshState(stageIndex = 0) {
    return {
      stageIndex,
      status: "paused",
      remainingMs: durationFor(stageIndex),
      deadline: null
    };
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const stageIndex = Number.isInteger(stored?.stageIndex)
        ? Math.min(stages.length - 1, Math.max(0, stored.stageIndex))
        : 0;
      const duration = durationFor(stageIndex);
      const status = ["paused", "running", "complete"].includes(stored?.status)
        ? stored.status
        : "paused";
      let remainingMs = Number.isFinite(stored?.remainingMs)
        ? Math.min(duration, Math.max(0, stored.remainingMs))
        : duration;
      let deadline = Number.isFinite(stored?.deadline) ? stored.deadline : null;

      if (status === "complete") return { stageIndex, status, remainingMs: 0, deadline: null };
      if (status === "running" && deadline) {
        remainingMs = Math.max(0, deadline - Date.now());
        if (remainingMs === 0) return { stageIndex, status: "complete", remainingMs: 0, deadline: null };
        return { stageIndex, status, remainingMs, deadline };
      }

      return { stageIndex, status: "paused", remainingMs, deadline: null };
    } catch (_) {
      return freshState();
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        stageIndex: state.stageIndex,
        status: state.status,
        remainingMs: Math.round(state.remainingMs),
        deadline: state.deadline
      }));
    } catch (_) {
      // The live guide still works when storage is unavailable (including some file:// contexts).
    }
  }

  function translate(key, fallback) {
    const translated = window.CFG_I18N?.t?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  function interpolate(template, values) {
    return Object.entries(values).reduce(
      (text, [key, value]) => text.split(`{${key}}`).join(value),
      template
    );
  }

  function currentLanguage() {
    const language = window.CFG_I18N?.current?.()
      || new URLSearchParams(window.location.search).get("lang")
      || document.documentElement.lang;
    return language === "ja" ? "ja" : "en";
  }

  function localizedGroupLink(sectionId) {
    const target = `index.html#${sectionId}`;
    if (typeof window.CFG_I18N?.link === "function") {
      const localized = window.CFG_I18N.link(target);
      if (localized) return String(localized);
    }
    return `index.html?lang=${encodeURIComponent(currentLanguage())}#${sectionId}`;
  }

  function stageText(stage, part) {
    return translate(`live.stage.${stage.id}.${part}`, stage[part]);
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function remainingNow() {
    if (state.status !== "running" || !state.deadline) return state.remainingMs;
    return Math.max(0, state.deadline - Date.now());
  }

  function statusFallback(status) {
    return {
      paused: "Paused",
      running: "Timer running",
      complete: "Time complete"
    }[status];
  }

  function renderTimer({ announce = false } = {}) {
    const duration = durationFor(state.stageIndex);
    const remaining = remainingNow();
    const percent = Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100));

    state.remainingMs = remaining;
    if (live.timer) {
      const formatted = formatTime(remaining);
      live.timer.textContent = formatted;
      live.timer.setAttribute("aria-label", interpolate(
        translate("live.timer.aria", "{time} remaining"),
        { time: formatted }
      ));
    }

    if (live.progress) {
      if ("HTMLProgressElement" in window && live.progress instanceof HTMLProgressElement) {
        live.progress.max = duration;
        live.progress.value = duration - remaining;
      } else {
        live.progress.style.width = `${percent}%`;
        live.progress.setAttribute("role", "progressbar");
        live.progress.setAttribute("aria-valuemin", "0");
        live.progress.setAttribute("aria-valuemax", "100");
        live.progress.setAttribute("aria-valuenow", String(Math.round(percent)));
      }
    }

    live.dialog.dataset.status = state.status;
    live.dialog.classList.toggle("is-complete", state.status === "complete");
    if (live.start) live.start.disabled = state.status === "running" || state.status === "complete";
    if (live.pause) live.pause.disabled = state.status !== "running";

    if (live.status) {
      const statusText = translate(`live.status.${state.status}`, statusFallback(state.status));
      if (live.status.textContent !== statusText) live.status.textContent = statusText;
    }
  }

  function renderStage({ announce = false } = {}) {
    const stage = stages[state.stageIndex];
    const title = stageText(stage, "title");
    const kicker = interpolate(
      translate("live.stage.kicker", "Stage {current} of {total}"),
      { current: state.stageIndex + 1, total: stages.length }
    );
    const duration = interpolate(
      translate("live.durationLabel", "{minutes} minutes"),
      { minutes: stage.minutes }
    );

    if (live.kicker) live.kicker.textContent = kicker;
    if (live.title) live.title.textContent = title;
    if (live.duration) live.duration.textContent = duration;
    if (live.prompt) live.prompt.textContent = stageText(stage, "prompt");
    if (live.transition) live.transition.textContent = stageText(stage, "transition");
    if (live.previous) live.previous.disabled = state.stageIndex === 0;
    if (live.next) live.next.disabled = state.stageIndex === stages.length - 1;

    if (live.groupLink) {
      live.groupLink.href = localizedGroupLink(stage.id);
      const groupLinkLabel = interpolate(
        translate("live.openGroup", "Open group page: {title}"),
        { title }
      );
      const labelElement = live.groupLink.querySelector("span");
      if (labelElement) labelElement.textContent = groupLinkLabel;
      else live.groupLink.textContent = groupLinkLabel;
      live.groupLink.setAttribute("aria-label", groupLinkLabel);
    }

    renderTimer({ announce });
  }

  function stopTicker() {
    if (!tickInterval) return;
    window.clearInterval(tickInterval);
    tickInterval = 0;
  }

  function completeStage() {
    stopTicker();
    state.status = "complete";
    state.remainingMs = 0;
    state.deadline = null;
    saveState();
    renderTimer({ announce: true });
  }

  function tick() {
    if (state.status !== "running") {
      stopTicker();
      return;
    }
    if (remainingNow() <= 0) {
      completeStage();
      return;
    }
    renderTimer();
  }

  function startTicker() {
    stopTicker();
    if (state.status !== "running") return;
    tickInterval = window.setInterval(tick, 250);
    tick();
  }

  function startTimer() {
    if (state.status === "running" || state.status === "complete") return;
    if (state.remainingMs <= 0) state.remainingMs = durationFor(state.stageIndex);
    state.status = "running";
    state.deadline = Date.now() + state.remainingMs;
    saveState();
    renderTimer({ announce: true });
    startTicker();
  }

  function pauseTimer() {
    if (state.status !== "running") return;
    state.remainingMs = remainingNow();
    if (state.remainingMs <= 0) {
      completeStage();
      return;
    }
    state.status = "paused";
    state.deadline = null;
    stopTicker();
    saveState();
    renderTimer({ announce: true });
  }

  function resetTimer() {
    stopTicker();
    state = freshState(state.stageIndex);
    saveState();
    renderStage({ announce: true });
  }

  function changeStage(offset) {
    const stageIndex = Math.min(stages.length - 1, Math.max(0, state.stageIndex + offset));
    if (stageIndex === state.stageIndex) return;
    stopTicker();
    state = freshState(stageIndex);
    saveState();
    renderStage({ announce: true });
  }

  function dialogIsNative() {
    return "HTMLDialogElement" in window
      && live.dialog instanceof HTMLDialogElement
      && typeof live.dialog.showModal === "function";
  }

  function openLiveMode() {
    lastFocusedElement = document.activeElement;
    live.dialog.hidden = false;
    document.body.classList.add("live-mode-open");

    if (dialogIsNative()) {
      if (!live.dialog.open) live.dialog.showModal();
    } else {
      fallbackDialogOpen = true;
      live.dialog.setAttribute("open", "");
      live.dialog.setAttribute("role", "dialog");
      live.dialog.setAttribute("aria-modal", "true");
    }

    renderStage();
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
    schedule(() => (live.close || live.start || live.dialog).focus());
  }

  function restoreFocus() {
    if (lastFocusedElement instanceof HTMLElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  function finishClose() {
    document.body.classList.remove("live-mode-open");
    fallbackDialogOpen = false;
    if (!dialogIsNative()) live.dialog.hidden = true;
    restoreFocus();
  }

  function closeLiveMode() {
    if (dialogIsNative() && live.dialog.open) {
      live.dialog.close();
      return;
    }
    live.dialog.removeAttribute("open");
    finishClose();
  }

  function trapFallbackFocus(event) {
    if (!fallbackDialogOpen || event.key !== "Tab") return;
    const focusable = [...live.dialog.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )].filter((element) => !element.hidden && element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  live.status?.setAttribute("aria-live", "polite");
  live.status?.setAttribute("aria-atomic", "true");
  live.title?.setAttribute("aria-live", "polite");
  live.title?.setAttribute("aria-atomic", "true");
  live.timer?.setAttribute("role", "timer");
  const liveOpeners = [...new Set([live.open, ...document.querySelectorAll("[data-open-live]")])];
  liveOpeners.forEach((button) => button.addEventListener("click", openLiveMode));
  live.close?.addEventListener("click", closeLiveMode);
  live.start?.addEventListener("click", startTimer);
  live.pause?.addEventListener("click", pauseTimer);
  live.reset?.addEventListener("click", resetTimer);
  live.previous?.addEventListener("click", () => changeStage(-1));
  live.next?.addEventListener("click", () => changeStage(1));

  live.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLiveMode();
  });
  live.dialog.addEventListener("close", finishClose);

  document.addEventListener("keydown", (event) => {
    if (fallbackDialogOpen && event.key === "Escape") {
      event.preventDefault();
      closeLiveMode();
      return;
    }
    trapFallbackFocus(event);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
  window.addEventListener("pagehide", saveState);
  const handleLanguageChange = () => renderStage();
  document.addEventListener("cfg:languagechange", handleLanguageChange);
  window.addEventListener("cfg:languagechange", handleLanguageChange);

  renderStage();
  if (state.status === "running") startTicker();
})();
