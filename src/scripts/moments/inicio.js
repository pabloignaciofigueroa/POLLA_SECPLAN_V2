/* Momento hero — Inicio.
   Secuencia poster: títulos entran y la COPA es el espectáculo: cae con rebote,
   queda flotando, con halo que respira, rayos de luz girando, un destello que
   recorre el oro y chispas que titilan.
   Solo se carga si NO hay reduced-motion (lo asegura motion.js).

   Targets (hooks en el markup):
   - [data-moment="title-main"] / [data-moment="title-accent"]  títulos
   - [data-moment="trophy"]        <figure> de la copa (escenario + float)
   - [data-moment="trophy-glow"]   halo
   - [data-trophy-rays]            rayos de luz
   - [data-trophy-shine]           destello especular (mask = webp copa)
   - .spark                        chispas
*/
import { gsap } from "gsap";

export default function inicio(section) {
  const titleMain = section.querySelector('[data-moment="title-main"]');
  const titleAccent = section.querySelector('[data-moment="title-accent"]');
  const stage = section.querySelector('[data-moment="trophy"]'); // <figure>
  const glow = section.querySelector('[data-moment="trophy-glow"]');
  const rays = section.querySelector("[data-trophy-rays]");
  const shine = section.querySelector("[data-trophy-shine]");
  const sparks = section.querySelectorAll(".spark");

  /* ---------- Entrada (timeline) ---------- */
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  if (titleMain) {
    tl.from(titleMain, { yPercent: 60, opacity: 0, duration: 0.6 }, 0);
  }
  if (titleAccent) {
    // fromTo con destino explícito + clearProps: interpolar a clipPath:none deja
    // el texto a medio recortar; así termina 100% abierto y revierte al CSS.
    tl.fromTo(
      titleAccent,
      { clipPath: "inset(0 100% 0 0)", opacity: 0 },
      { clipPath: "inset(0 0% 0 0)", opacity: 1, duration: 0.7, clearProps: "clipPath" },
      0.16
    );
  }
  if (stage) {
    // La copa cae desde arriba y rebota al asentarse.
    tl.from(stage, { yPercent: -45, scale: 0.82, opacity: 0, ease: "back.out(1.5)", duration: 1 }, 0.1);
  }
  if (glow) {
    // Flash del halo al aterrizar.
    tl.fromTo(glow, { opacity: 0.25 }, { opacity: 1, duration: 0.22, yoyo: true, repeat: 1, ease: "power2.out" }, 0.85);
  }

  /* ---------- Loops idle (arrancan al terminar la entrada) ---------- */
  function startIdle() {
    if (stage) {
      gsap.to(stage, { y: -16, duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true });
    }
    if (glow) {
      gsap.fromTo(glow, { opacity: 0.55 }, { opacity: 0.95, scale: 1.08, duration: 2.8, ease: "sine.inOut", repeat: -1, yoyo: true });
    }
    if (rays) {
      gsap.set(rays, { opacity: 0.55 });
      gsap.to(rays, { rotation: 360, duration: 38, ease: "none", repeat: -1 });
    }
    if (shine) {
      const shineTl = gsap.timeline({ repeat: -1, repeatDelay: 3.2 });
      shineTl
        .set(shine, { backgroundPosition: "150% 0", opacity: 0 })
        .to(shine, { opacity: 0.95, duration: 0.25 }, 0)
        .to(shine, { backgroundPosition: "-80% 0", duration: 0.9, ease: "power1.inOut" }, 0)
        .to(shine, { opacity: 0, duration: 0.3 }, 0.6);
    }
    if (sparks.length) {
      gsap.to(sparks, {
        scale: 1,
        opacity: 0.95,
        duration: 0.6,
        ease: "sine.inOut",
        stagger: { each: 0.45, from: "random", repeat: -1, yoyo: true },
      });
    }
  }
  tl.call(startIdle);
}
