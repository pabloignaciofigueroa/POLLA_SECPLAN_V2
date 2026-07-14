// Marquee de INICIO — etapa SEMIFINALES. Filtra las banderas del SSR (los 32 clasificados) a los
// 4 que AVANZARON de cuartos. Fuente de verdad: resultados de Supabase (igual que /tabla y
// /proximo) con fallback a localStorage + seed. 100% local si Supabase no está configurado.
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";
import { attachRemoteResults } from "../../lib/knockout/remoteResults.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";

(() => {
  const marquee = document.querySelector('[data-section="flag-marquee"]');
  if (!marquee) return;
  const track = marquee.querySelector("[data-marquee-track]");
  const payloadNode = marquee.querySelector("[data-marquee-payload]");
  if (!track || !payloadNode) return;

  let payload = {};
  try { payload = JSON.parse(payloadNode.textContent || "{}"); } catch { payload = {}; }
  const matches = payload.matches ?? [];
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };

  // Supabase (fuente de verdad cross-device). null hasta que llega; mientras, seed + localStorage.
  let remoteResults = null;
  const effSeed = () => (remoteResults ? { slotAssignments: seed.slotAssignments, results: remoteResults } : seed);

  // Códigos de los que avanzaron = winnerCode de los cruces QF (cuartos) ya finalizados.
  const advancerCodes = () => {
    const live = readLiveKnockout(effSeed());
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results });
    const set = new Set();
    for (const r of resolved) {
      if (r.match.round === "QF" && r.winnerCode) set.add(r.winnerCode);
    }
    return set;
  };

  const apply = () => {
    const set = advancerCodes();
    // Si aún no hay una ronda completa de clasificados (resultados no cargados todavía), se deja el
    // fallback SSR (los 32) en vez de colapsar el marquee a 1-2 banderas.
    if (set.size < 2) return;
    track.querySelectorAll("[data-team-code]").forEach((chip) => {
      const code = chip.getAttribute("data-team-code");
      chip.style.display = set.has(code) ? "" : "none";
    });
  };

  apply();
  subscribeLiveKnockout(apply);
  attachRemoteResults((res) => { remoteResults = res; apply(); });
})();
