// Admin LOCAL de la llave: asigna clasificados de placeholders + carga resultados.
// Escribe en localStorage (polla:knockoutResults) y re-resuelve las etiquetas. 100% local.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";
import { readLocalKnockout, writeLocalKnockout } from "../../lib/knockout/liveResults.js";

(() => {
  const section = document.querySelector('[data-section="admin"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-admin-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seedAssignments = payload.seedAssignments ?? {};

  // Estado editable (local sobre seed).
  const local = readLocalKnockout();
  const assignments = { ...seedAssignments, ...(local.slotAssignments ?? {}) };
  const results = { ...(local.results ?? {}) }; // map matchId -> { matchId, homeScore, awayScore, winner }

  const toScore = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  const isTie = (h, a) => h !== null && a !== null && h === a;

  const persist = () => writeLocalKnockout({ slotAssignments: assignments, results });

  const resolveAll = () => {
    const resolved = resolveBracket(matches, { assignments, results, teamsByCode });
    return new Map(resolved.map((r) => [r.match.id, r]));
  };

  const reflectWinnerButtons = (row, winner) => {
    row.querySelectorAll("[data-adm-winner]").forEach((btn) => {
      const active = winner === btn.getAttribute("data-adm-winner");
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.dataset.active = active ? "true" : "false";
    });
  };

  // Botón de estado del cruce: EN VIVO (rojo, default al cargar marcador) / FINALIZADO (verde).
  const reflectState = (row, result) => {
    const btn = row.querySelector("[data-adm-state]");
    if (!btn) return;
    const hasScore = result && (result.homeScore != null || result.awayScore != null);
    if (!hasScore) { btn.hidden = true; return; }
    btn.hidden = false;
    const isFinal = result.status === "final";
    btn.dataset.state = isFinal ? "final" : "live";
    btn.textContent = isFinal ? "Finalizado" : "En vivo";
    btn.setAttribute("aria-pressed", isFinal ? "true" : "false");
  };

  const renderLabels = () => {
    const byId = resolveAll();
    section.querySelectorAll("[data-adm-match]").forEach((row) => {
      const id = row.getAttribute("data-adm-match");
      const r = byId.get(id);
      if (!r) return;
      const nameHome = row.querySelector('[data-adm-name="home"]');
      const nameAway = row.querySelector('[data-adm-name="away"]');
      const pickHome = row.querySelector('[data-adm-pick="home"]');
      const pickAway = row.querySelector('[data-adm-pick="away"]');
      if (nameHome) nameHome.textContent = r.slotA.name;
      if (nameAway) nameAway.textContent = r.slotB.name;
      if (pickHome) pickHome.textContent = r.slotA.shortCode || "LOC";
      if (pickAway) pickAway.textContent = r.slotB.shortCode || "VIS";
      row.dataset.played = r.played ? "true" : "false";
      // Habilitar carga solo si ambos lados son concretos.
      const enterable = Boolean(r.codeA) && Boolean(r.codeB);
      row.querySelectorAll("[data-adm-score]").forEach((inp) => (inp.disabled = !enterable));
      row.querySelectorAll("[data-adm-winner]").forEach((b) => (b.disabled = !enterable));
    });
  };

  // --- asignaciones ---
  section.querySelectorAll("[data-adm-assign]").forEach((select) => {
    const code = select.getAttribute("data-adm-assign");
    if (assignments[code]) select.value = assignments[code];
    select.addEventListener("change", () => {
      const v = select.value;
      if (v) assignments[code] = v;
      else delete assignments[code];
      persist();
      renderLabels();
    });
  });

  // --- resultados ---
  section.querySelectorAll("[data-adm-match]").forEach((row) => {
    const id = row.getAttribute("data-adm-match");
    const homeInput = row.querySelector('[data-adm-score="home"]');
    const awayInput = row.querySelector('[data-adm-score="away"]');
    const winButtons = Array.from(row.querySelectorAll("[data-adm-winner]"));

    const stateBtn = row.querySelector("[data-adm-state]");

    const stored = results[id];
    if (stored) {
      if (homeInput && stored.homeScore != null) homeInput.value = String(stored.homeScore);
      if (awayInput && stored.awayScore != null) awayInput.value = String(stored.awayScore);
      reflectWinnerButtons(row, stored.winner ?? null);
      reflectState(row, stored);
    }

    const sync = () => {
      const h = toScore(homeInput ? homeInput.value : null);
      const a = toScore(awayInput ? awayInput.value : null);
      if (h === null && a === null) {
        delete results[id];
        reflectWinnerButtons(row, null);
        reflectState(row, null);
        persist();
        renderLabels();
        return;
      }
      const cur = results[id] ?? { matchId: id, homeScore: null, awayScore: null, winner: null };
      cur.homeScore = h;
      cur.awayScore = a;
      if (h !== null && a !== null && !isTie(h, a)) cur.winner = h > a ? "home" : "away";
      // Editar un marcador lo deja EN VIVO (no avanza ni puntúa) hasta que se finalice.
      if (cur.status !== "final") cur.status = "live";
      results[id] = cur;
      reflectWinnerButtons(row, cur.winner ?? null);
      reflectState(row, cur);
      persist();
      renderLabels();
    };

    if (homeInput) homeInput.addEventListener("input", sync);
    if (awayInput) awayInput.addEventListener("input", sync);

    // Toggle EN VIVO ⟷ FINALIZADO (al finalizar, el ganador avanza el cuadro y suma puntos).
    if (stateBtn) {
      stateBtn.addEventListener("click", () => {
        const cur = results[id];
        if (!cur || (cur.homeScore == null && cur.awayScore == null)) return;
        cur.status = cur.status === "final" ? "live" : "final";
        results[id] = cur;
        reflectState(row, cur);
        persist();
        renderLabels();
      });
    }

    winButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const cur = results[id] ?? { matchId: id, homeScore: toScore(homeInput?.value), awayScore: toScore(awayInput?.value), winner: null };
        const clicked = btn.getAttribute("data-adm-winner");
        // Si hay ganador por marcador, no se puede elegir al perdedor.
        if (cur.homeScore !== null && cur.awayScore !== null && !isTie(cur.homeScore, cur.awayScore)) {
          cur.winner = cur.homeScore > cur.awayScore ? "home" : "away";
        } else {
          cur.winner = clicked;
        }
        results[id] = cur;
        reflectWinnerButtons(row, cur.winner);
        persist();
        renderLabels();
      });
    });
  });

  // --- limpiar ---
  const clearBtn = section.querySelector("[data-adm-clear]");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      for (const k of Object.keys(assignments)) delete assignments[k];
      for (const k of Object.keys(results)) delete results[k];
      writeLocalKnockout({ slotAssignments: {}, results: {} });
      section.querySelectorAll("[data-adm-assign]").forEach((s) => (s.value = ""));
      section.querySelectorAll('[data-adm-score]').forEach((i) => (i.value = ""));
      section.querySelectorAll("[data-adm-match]").forEach((row) => { reflectWinnerButtons(row, null); reflectState(row, null); });
      renderLabels();
    });
  }

  renderLabels();
})();
