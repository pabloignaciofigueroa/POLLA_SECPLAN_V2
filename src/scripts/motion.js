/* =========================================================
   motion.js — Runtime de animación compartido (global).
   Cargado una vez desde BaseLayout (<script> bundleado por Astro).
   La navegación es cross-document (recarga real), así que este
   script vuelve a correr en cada página: no hay estado SPA que mantener.

   Responsabilidades:
   1. Guarda de reduced-motion (si reduce → todo visible, sin GSAP).
   2. Reveal por viewport: IntersectionObserver agrega .in-view a [data-animate].
   3. Count-up de [data-countup].
   4. Dispatcher de momentos "hero": import() dinámico del módulo de la
      sección presente en el DOM → GSAP queda en un chunk compartido y solo
      se descarga en páginas que lo usan.
   ========================================================= */

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Mapa sección → módulo de momento GSAP (lazy).
   Solo las secciones cuyo "momento hero" se beneficia de una timeline GSAP
   (secuencia orquestada / FLIP). El resto cobra vida con la capa CSS
   ([data-animate], count-up, clases .is-*) y NO descarga GSAP. */
const MOMENTS = {
  inicio: () => import("./moments/inicio.js"),
  jugador: () => import("./moments/jugador.js"),
  "proximo-partido": () => import("./moments/proximo.js"),
  estadisticas: () => import("./moments/estadisticas.js"),
};
/* Tabla NO usa momento de carga (su entrada es CSS). GSAP/Flip se importa de
   forma diferida dentro de tabla.client.js solo cuando hay reordenamiento. */

/* ---------------------------------------------------------
   1. Reveal por viewport
   --------------------------------------------------------- */
function revealAll() {
  document.querySelectorAll("[data-animate]").forEach((el) => el.classList.add("in-view"));
}

function setupReveal() {
  const items = document.querySelectorAll("[data-animate]");
  if (!items.length) return;

  if (REDUCED || !("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  const io = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------
   2. Count-up de números
   [data-countup] contiene el valor final en el markup (visible sin JS).
   data-countup-duration opcional (ms). Mantiene sufijos no numéricos.
   --------------------------------------------------------- */
function animateCountUp(el) {
  const raw = (el.getAttribute("data-countup") || el.textContent || "").trim();
  const target = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(target)) return;

  const suffix = raw.replace(/[0-9.,\-\s]/g, "");
  const decimals = (raw.split(".")[1] || "").length;
  const duration = parseInt(el.getAttribute("data-countup-duration") || "1100", 10);
  const start = performance.now();

  const format = (n) =>
    (decimals ? n.toFixed(decimals) : Math.round(n).toString()) + (suffix ? suffix : "");

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = format(target * eased);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = format(target);
  }
  requestAnimationFrame(frame);
}

function setupCountUp() {
  const nums = document.querySelectorAll("[data-countup]");
  if (!nums.length) return;

  if (REDUCED || !("IntersectionObserver" in window)) return; // deja el valor final del markup

  const io = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCountUp(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.5 }
  );
  nums.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------
   3. Dispatcher de momentos hero (GSAP lazy)
   --------------------------------------------------------- */
function setupMoments() {
  if (REDUCED) return; // sin animaciones pesadas en reduced-motion
  // Dentro de <main>: el <header> también lleva data-section="header" y, al ir
  // primero en el DOM, ganaba el querySelector y ningún momento llegaba a cargar.
  const section = document.querySelector("main [data-section]") || document.querySelector("[data-section]:not([data-section='header'])");
  if (!section) return;
  const name = section.getAttribute("data-section");
  const loader = MOMENTS[name];
  if (!loader) return;

  /* Pre-oculta los elementos del momento mientras GSAP llega (import async),
     para evitar el "flash" del estado final antes de que la timeline fije el
     estado inicial. visibility:hidden reserva el layout → no genera CLS.
     Como esto solo ocurre desde JS, si motion.js no corre nada queda oculto. */
  const owned = section.querySelectorAll("[data-moment]");
  owned.forEach((el) => {
    el.style.visibility = "hidden";
  });
  const reveal = () => owned.forEach((el) => (el.style.visibility = ""));

  loader()
    .then((mod) => {
      reveal();
      if (typeof mod.default === "function") mod.default(section);
    })
    .catch(() => {
      /* si falla la carga del momento, mostramos igual (las entradas CSS ya
         dejaron el resto del sitio vivo) */
      reveal();
    });
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
function init() {
  setupReveal();
  setupCountUp();
  setupMoments();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
