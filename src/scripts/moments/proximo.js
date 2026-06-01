/* Momento hero — Próximo Partido (versus intro estilo arcade).
   Los dos equipos entran desde los costados y el "VS" golpea al centro.
   Targets:
   - [data-moment="home-team"]  carta equipo local
   - [data-moment="away-team"]  carta equipo visitante
   - [data-moment="vs"]         bloque central VS
   - [data-moment="swoosh"]     energía decorativa (opcional)
*/
import { gsap } from "gsap";

export default function proximo(section) {
  const home = section.querySelector('[data-moment="home-team"]');
  const away = section.querySelector('[data-moment="away-team"]');
  const vs = section.querySelector('[data-moment="vs"]');
  const swoosh = section.querySelector('[data-moment="swoosh"]');

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  if (home) tl.from(home, { x: -60, opacity: 0, duration: 0.5, clearProps: "transform" }, 0);
  if (away) tl.from(away, { x: 60, opacity: 0, duration: 0.5, clearProps: "transform" }, 0);
  if (vs) {
    tl.from(
      vs,
      { scale: 0, opacity: 0, rotate: -12, duration: 0.5, ease: "back.out(2)" },
      0.28
    );
  }
  if (swoosh) {
    tl.from(swoosh, { scaleX: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.45 }, 0.3);
  }

  /* Pequeño "latido" del VS al asentarse. */
  if (vs) {
    tl.to(vs, { scale: 1.06, duration: 0.16, yoyo: true, repeat: 1, ease: "sine.inOut" });
  }
}
