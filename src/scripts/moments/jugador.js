/* Momento hero — Jugador (character select).
   "Reparto de cromos": las cartas del grid entran escalonadas, y la carta del
   jugador seleccionado aparece con un glow idle.
   Targets:
   - [data-moment="selected-card"] portrait grande del jugador activo
   - [data-moment="player-grid"]   contenedor del grid; sus hijos son las cartas
*/
import { gsap } from "gsap";

export default function jugador(section) {
  const selected = section.querySelector('[data-moment="selected-card"]');
  const grid = section.querySelector('[data-moment="player-grid"]');
  const cards = grid ? Array.from(grid.children) : [];

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  if (selected) {
    tl.from(selected, { opacity: 0, y: 24, scale: 0.96, duration: 0.6 }, 0);
  }

  if (cards.length) {
    tl.from(
      cards,
      {
        opacity: 0,
        y: 30,
        rotateX: 20,
        scale: 0.94,
        transformOrigin: "50% 100%",
        duration: 0.5,
        stagger: { each: 0.045, from: "start" },
        ease: "back.out(1.4)",
        clearProps: "transform", // libera el transform para que el :hover de la carta funcione
      },
      0.12
    );
  }
}
