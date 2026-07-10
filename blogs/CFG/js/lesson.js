const progressBar = document.querySelector("#progress-bar");
const navLinks = [...document.querySelectorAll(".jump-nav a")];
const sections = [...document.querySelectorAll("[data-section]")];
const lessonSections = [...document.querySelectorAll(".lesson-section")];

lessonSections.forEach((section, index) => {
  const next = lessonSections[index + 1];
  if (!next) return;
  const link = document.createElement("a");
  link.className = "next-section";
  link.href = `#${next.id}`;
  link.innerHTML = `<div><span>Next</span><strong>${next.dataset.section}</strong></div><b aria-hidden="true">↓</b>`;
  section.appendChild(link);
});

function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? window.scrollY / max : 0;
  progressBar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

  if (!visible?.target.id) return;
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.hash === `#${visible.target.id}`);
  });
}, { rootMargin: "-25% 0px -55%", threshold: [0, .2, .5] });

sections.forEach((section) => observer.observe(section));
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);
updateProgress();
