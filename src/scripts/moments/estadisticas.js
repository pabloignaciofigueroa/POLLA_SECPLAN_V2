/* Momento hero — Estadísticas (Data Center bloqueado).
   El orbe de candado entra y queda flotando con un latido de brillo (no gira:
   un candado girando se ve raro). El "burst" de desbloqueo lo dispara
   estadisticas.client.js con .is-unlock-burst.
   Targets:
   - [data-moment="lock-orb"]  contenedor del orbe (incluye halos ::before/::after)
*/
import { gsap } from "gsap";

export default function estadisticas(section) {
  const orb = section.querySelector('[data-moment="lock-orb"]');
  if (!orb) return;

  gsap.from(orb, { opacity: 0, scale: 0.8, duration: 0.7, ease: "back.out(1.6)" });

  /* Float idle + latido de brillo (filter brightness). */
  gsap.to(orb, { y: -10, duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true });
  gsap.to(orb, {
    filter: "drop-shadow(0 18px 30px rgba(18,109,255,0.22)) brightness(1.12)",
    duration: 1.9,
    ease: "sine.inOut",
    repeat: -1,
    yoyo: true,
  });
}
