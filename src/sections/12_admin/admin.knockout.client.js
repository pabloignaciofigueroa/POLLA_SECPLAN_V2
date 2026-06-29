// Admin LOCAL de la llave: asigna clasificados de placeholders + carga resultados.
// Escribe en localStorage (polla:knockoutResults) y re-resuelve las etiquetas. 100% local.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";
import { readLocalKnockout, writeLocalKnockout } from "../../lib/knockout/liveResults.js";
import { upsertResult, deleteResult, deleteAllResults, isSupabaseConfigured } from "../../lib/supabase/knockoutData.js";

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
      row.querySelectorAll("[data-adm-winner], [data-adm-step], [data-adm-update], [data-adm-finish]").forEach((b) => (b.disabled = !enterable));
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
  // Edición con steppers (−/+) o tipeo = borrador local (NO se persiste hasta ACTUALIZAR/FINALIZAR).
  // ACTUALIZAR -> guarda EN VIVO (no avanza ni suma). FINALIZAR -> confirma + guarda FINAL (avanza + suma).
  section.querySelectorAll("[data-adm-match]").forEach((row) => {
    const id = row.getAttribute("data-adm-match");
    const homeInput = row.querySelector('[data-adm-score="home"]');
    const awayInput = row.querySelector('[data-adm-score="away"]');
    const winButtons = Array.from(row.querySelectorAll("[data-adm-winner]"));
    const stepButtons = Array.from(row.querySelectorAll("[data-adm-step]"));
    const updateBtn = row.querySelector("[data-adm-update]");
    const finishBtn = row.querySelector("[data-adm-finish]");

    const stored = results[id];
    if (stored) {
      if (homeInput && stored.homeScore != null) homeInput.value = String(stored.homeScore);
      if (awayInput && stored.awayScore != null) awayInput.value = String(stored.awayScore);
      row.dataset.draftWinner = stored.winner ?? "";
      reflectWinnerButtons(row, stored.winner ?? null);
      reflectState(row, stored);
    }

    const markDirty = (on) => { if (updateBtn) updateBtn.dataset.dirty = on ? "true" : "false"; };

    // Persiste el marcador actual con el estado dado (live/final) y propaga a /tabla, /fixture, etc.
    const commit = (status) => {
      const h = toScore(homeInput ? homeInput.value : null);
      const a = toScore(awayInput ? awayInput.value : null);
      if (h === null && a === null) {
        delete results[id];
        row.dataset.draftWinner = "";
        reflectWinnerButtons(row, null);
        reflectState(row, null);
        markDirty(false);
        persist();
        renderLabels();
        if (isSupabaseConfigured()) deleteResult(id);
        return;
      }
      const cur = results[id] ?? { matchId: id, homeScore: null, awayScore: null, winner: null };
      cur.homeScore = h;
      cur.awayScore = a;
      if (h !== null && a !== null && !isTie(h, a)) cur.winner = h > a ? "home" : "away";
      else cur.winner = row.dataset.draftWinner || null;
      cur.status = status;
      results[id] = cur;
      reflectWinnerButtons(row, cur.winner ?? null);
      reflectState(row, cur);
      markDirty(false);
      persist();
      renderLabels();
      // Propaga el resultado a Supabase para que se vea en OTROS dispositivos (incógnito, etc.).
      // Requiere la policy de escritura (migración 0002). Si falla, queda local y avisa por consola.
      if (isSupabaseConfigured()) {
        upsertResult(cur).then((ok) => {
          if (!ok) console.warn(`[admin] No se pudo escribir ${id} en Supabase. ¿Corriste la migración 0002 (policy de escritura)?`);
        });
      }
    };

    // Steppers −/+ (clamp a >= 0) y tipeo: editan el borrador y marcan "sin guardar".
    const bump = (input, delta) => {
      if (!input || input.disabled) return;
      const cur = toScore(input.value);
      input.value = String(Math.max(0, (cur === null ? 0 : cur) + delta));
      markDirty(true);
    };
    stepButtons.forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        bump(b.getAttribute("data-adm-step") === "home" ? homeInput : awayInput, Number(b.getAttribute("data-dir")) || 0);
      });
    });
    if (homeInput) homeInput.addEventListener("input", () => markDirty(true));
    if (awayInput) awayInput.addEventListener("input", () => markDirty(true));

    winButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const h = toScore(homeInput ? homeInput.value : null);
        const a = toScore(awayInput ? awayInput.value : null);
        const w = h !== null && a !== null && !isTie(h, a) ? (h > a ? "home" : "away") : btn.getAttribute("data-adm-winner");
        row.dataset.draftWinner = w || "";
        reflectWinnerButtons(row, w);
        markDirty(true);
      });
    });

    if (updateBtn) updateBtn.addEventListener("click", () => commit("live"));
    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        const h = toScore(homeInput ? homeInput.value : null);
        const a = toScore(awayInput ? awayInput.value : null);
        if (h === null || a === null) { window.alert("Cargá el marcador completo antes de finalizar."); return; }
        const home = row.querySelector('[data-adm-name="home"]')?.textContent ?? "Local";
        const away = row.querySelector('[data-adm-name="away"]')?.textContent ?? "Visita";
        const ok = window.confirm(`¿Finalizar ${home} ${h} - ${a} ${away}?\n\nAvanza el ganador en el cuadro y suma los puntos. Cierra el marcador.`);
        if (!ok) return;
        commit("final");
      });
    }
  });

  // --- limpiar ---
  const clearBtn = section.querySelector("[data-adm-clear]");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      for (const k of Object.keys(assignments)) delete assignments[k];
      for (const k of Object.keys(results)) delete results[k];
      writeLocalKnockout({ slotAssignments: {}, results: {} });
      if (isSupabaseConfigured()) deleteAllResults();
      section.querySelectorAll("[data-adm-assign]").forEach((s) => (s.value = ""));
      section.querySelectorAll('[data-adm-score]').forEach((i) => (i.value = ""));
      section.querySelectorAll("[data-adm-match]").forEach((row) => {
        reflectWinnerButtons(row, null);
        reflectState(row, null);
        row.dataset.draftWinner = "";
        const u = row.querySelector("[data-adm-update]");
        if (u) u.dataset.dirty = "false";
      });
      renderLabels();
    });
  }

  renderLabels();
})();
