// Resolucion VIVA + hidratacion del bracket de /fixture (solo lectura). 100% local.
// Re-resuelve la llave con los resultados de localStorage (admin) y parchea: equipos
// resueltos, ganador, desbloqueo, y el pronostico guardado del jugador. No escribe nada.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";

(() => {
  const section = document.querySelector('[data-section="fixture"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-knockout-readonly]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };

  const safeGet = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
  const getPlayerId = () => {
    try { const q = new URL(window.location.href).searchParams.get("player"); if (q) return q; } catch {}
    return safeGet("polla:selectedPlayerId") || "invitado";
  };
  const readPlayerBucket = () => {
    try {
      const all = JSON.parse(safeGet("polla:knockoutPredictions") || "{}");
      return (all && all[getPlayerId()]) || {};
    } catch { return {}; }
  };

  // La bandera escala con la ronda (--ko-rs heredada del nodo): en 16avos llega a ~3.1rem con anillo.
  const flagHtml = (slot) => {
    const sz = "calc(1.85rem * var(--ko-rs, 1))";
    return slot.flag
      ? `<img src="${slot.flag}" alt="" loading="lazy" decoding="async" width="64" height="48" style="width:${sz};height:${sz};border-radius:999px;object-fit:cover;display:block;border:2px solid #fff;box-shadow:0 2px 8px rgba(7,23,53,0.28);">`
      : `<span style="display:inline-grid;place-items:center;width:${sz};height:${sz};border-radius:999px;background:rgba(18,109,255,0.10);color:#1a3a8a;border:1px dashed rgba(7,23,53,0.18);font-weight:900;font-size:calc(0.8rem * var(--ko-rs, 1));">?</span>`;
  };

  const patchSlot = (card, side, slot, isWinner) => {
    const flagSpan = card.querySelector(`[data-ko-flag="${side}"]`);
    const nameSpan = card.querySelector(`[data-ko-name="${side}"]`);
    if (flagSpan) flagSpan.innerHTML = flagHtml(slot);
    if (nameSpan) {
      nameSpan.textContent = slot.name;
      nameSpan.dataset.concrete = slot.concrete ? "true" : "false";
    }
    const row = card.querySelector(`.ko-row[data-slot="${side}"]`);
    if (row) row.dataset.winner = isWinner ? "true" : "false";
  };

  const cards = Array.from(section.querySelectorAll("[data-ko-match]"));

  const render = () => {
    const live = readLiveKnockout(seed);
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    const byId = new Map(resolved.map((r) => [r.match.id, r]));
    const bucket = readPlayerBucket();

    cards.forEach((card) => {
      const id = card.getAttribute("data-ko-match");
      const r = byId.get(id);
      if (!r) return;

      patchSlot(card, "home", r.slotA, r.played && r.winnerCode && r.codeA === r.winnerCode);
      patchSlot(card, "away", r.slotB, r.played && r.winnerCode && r.codeB === r.winnerCode);

      const pill = card.querySelector("[data-ko-status-pill]");
      const lockNote = card.querySelector("[data-ko-locknote]");
      if (r.played) {
        card.dataset.locked = "true";
        if (pill) pill.textContent = "Final";
        if (lockNote) lockNote.textContent = "";
      } else if (r.predictionEnabled) {
        card.removeAttribute("data-locked");
        if (pill) pill.textContent = "Por jugar";
        if (lockNote) lockNote.textContent = "";
      } else {
        card.dataset.locked = "true";
        if (pill) pill.textContent = "Bloqueado";
      }

      // Pronostico guardado del jugador (su marcador + a quién hizo avanzar).
      const pred = bucket[id];
      const homeBox = card.querySelector('[data-ko-score="home"]');
      const awayBox = card.querySelector('[data-ko-score="away"]');
      const advBox = card.querySelector("[data-ko-advance]");
      if (homeBox) homeBox.textContent = pred && pred.homeScore != null ? String(pred.homeScore) : "—";
      if (awayBox) awayBox.textContent = pred && pred.awayScore != null ? String(pred.awayScore) : "—";
      if (advBox) {
        if (pred && (pred.advances === "home" || pred.advances === "away")) {
          const sc = pred.advances === "home" ? r.slotA.shortCode : r.slotB.shortCode;
          advBox.textContent = `tu pick: ${sc || (pred.advances === "home" ? "Local" : "Visita")}`;
        } else {
          advBox.textContent = "—";
        }
      }
    });
  };

  render();
  subscribeLiveKnockout(render);
})();
