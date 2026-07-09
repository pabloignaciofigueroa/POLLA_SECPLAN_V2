// EQUIPOS (master-detail) — etapa CUARTOS. Deriva los 8 clasificados desde la fuente de verdad de
// resultados (Supabase, igual que /tabla y /proximo; fallback a localStorage + seed), pinta la lista
// de la derecha y la portada grande de la izquierda. No toca datos ni predicciones.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";
import { attachRemoteResults } from "../../lib/knockout/remoteResults.js";

(() => {
  const section = document.querySelector('[data-section="equipos"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-equipos-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const teams = payload.teams ?? [];
  const matches = payload.matches ?? [];
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };
  const teamByCode = new Map(teams.map((t) => [t.code, t]));
  const teamsByCode = buildTeamsByCode(teams);

  let remoteResults = null;
  const effSeed = () => (remoteResults ? { slotAssignments: seed.slotAssignments, results: remoteResults } : seed);

  const listEl = section.querySelector("[data-eq-list]");
  const coverImg = section.querySelector("[data-eq-cover]");
  const nameEl = section.querySelector("[data-eq-name]");
  const confEl = section.querySelector("[data-eq-conf]");
  if (!listEl) return;

  const coverSrc = (t) => t?.coverImage || (t?.id ? `/assets/teams/covers/${t.id}.webp` : "");

  const selectTeam = (code) => {
    const t = teamByCode.get(code);
    if (!t) return;
    if (coverImg) { coverImg.src = coverSrc(t); coverImg.alt = `Portada de ${t.name}`; }
    if (nameEl) nameEl.textContent = t.name;
    if (confEl) confEl.textContent = t.confederation || "";
    listEl.querySelectorAll("[data-code]").forEach((btn) => {
      btn.setAttribute("aria-current", btn.getAttribute("data-code") === code ? "true" : "false");
    });
  };

  // Los 8 = los equipos concretos de los 4 cruces de cuartos (QF), ordenados por horario y con
  // cada pareja adyacente (local y visita del mismo cruce).
  const advancerCodes = () => {
    const live = readLiveKnockout(effSeed());
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    const qf = resolved
      .filter((r) => r.match.round === "QF")
      .sort((a, b) =>
        `${a.match.dateCL ?? ""}T${a.match.timeCL ?? ""}`.localeCompare(`${b.match.dateCL ?? ""}T${b.match.timeCL ?? ""}`),
      );
    const codes = [];
    for (const r of qf) {
      if (r.codeA) codes.push(r.codeA);
      if (r.codeB) codes.push(r.codeB);
    }
    return codes;
  };

  const render = () => {
    const codes = advancerCodes();
    // Mientras no haya una ronda completa de clasificados (resultados aún cargando), mantener el
    // estado "cargando" en vez de mostrar 1-2 equipos sueltos.
    if (codes.length < 8) {
      if (!listEl.querySelector("[data-code]")) {
        listEl.innerHTML = '<p class="eq-list-empty">Cargando clasificados…</p>';
      }
      return;
    }
    const prevSelected = listEl.querySelector('[aria-current="true"]')?.getAttribute("data-code");
    listEl.innerHTML = codes
      .map((code) => {
        const t = teamByCode.get(code) || { name: code, shortCode: code, flag: null };
        const flag = t.flag ? `<img class="eq-item-flag" src="${t.flag}" alt="" loading="lazy" decoding="async" width="64" height="48">` : `<span class="eq-item-flag" aria-hidden="true"></span>`;
        return `<button type="button" class="eq-item" data-code="${code}" aria-current="false">${flag}<span class="eq-item-name">${t.name}</span></button>`;
      })
      .join("");
    listEl.querySelectorAll("[data-code]").forEach((btn) => {
      btn.addEventListener("click", () => selectTeam(btn.getAttribute("data-code")));
    });
    // Mantener la selección previa si sigue clasificada; si no, el primero.
    selectTeam(prevSelected && codes.includes(prevSelected) ? prevSelected : codes[0]);
  };

  render();
  subscribeLiveKnockout(render);
  attachRemoteResults((res) => { remoteResults = res; render(); });
})();
