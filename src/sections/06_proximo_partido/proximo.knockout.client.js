// Proximo cruce de la llave. 100% local. Resuelve en vivo, muestra cuenta regresiva,
// tu pronostico y los resultados recientes. Se actualiza con los resultados del admin.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";
import { findNextMatch, recentResults } from "../../lib/knockout/schedule.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";

(() => {
  const section = document.querySelector('[data-section="proximo"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-proximo-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };
  const roundLabelById = new Map(matches.map((m) => [m.id, m.roundLabel]));

  const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const getPlayerId = () => {
    try { const q = new URL(window.location.href).searchParams.get("player"); if (q) return q; } catch {}
    return safeGet("polla:selectedPlayerId") || "invitado";
  };
  const readBucket = () => {
    try { const all = JSON.parse(safeGet("polla:knockoutPredictions") || "{}"); return (all && all[getPlayerId()]) || {}; } catch { return {}; }
  };

  const $ = (sel) => section.querySelector(sel);

  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const fmtWhen = (m) => {
    if (!m || !m.dateCL) return "Por definir";
    const p = String(m.dateCL).split("-").map(Number);
    return `${p[2]} ${MES[(p[1] || 1) - 1] || ""} · ${m.timeCL || ""} hrs`;
  };

  const nowKey = () => {
    try {
      // Hora de Chile, "YYYY-MM-DDTHH:mm".
      const s = new Date().toLocaleString("sv-SE", { timeZone: "America/Santiago" });
      return s.slice(0, 16).replace(" ", "T");
    } catch { return null; }
  };

  let countdownTimer = null;
  const startCountdown = (match) => {
    if (countdownTimer) clearInterval(countdownTimer);
    const el = $("[data-px-countdown]");
    if (!el || !match?.dateCL || !match?.timeCL) { if (el) el.textContent = ""; return; }
    const target = new Date(`${match.dateCL}T${match.timeCL}:00-04:00`).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (!Number.isFinite(diff)) { el.textContent = ""; return; }
      if (diff <= 0) { el.textContent = "¡En juego / por jugarse!"; clearInterval(countdownTimer); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = d > 0 ? `faltan ${d}d ${h}h ${m}m` : `faltan ${h}h ${m}m ${s}s`;
      el.classList.remove("is-countdown-tick");
      void el.offsetWidth;
      el.classList.add("is-countdown-tick");
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  };

  const render = () => {
    const live = readLiveKnockout(seed);
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    const next = findNextMatch(resolved, { nowKey: nowKey() });
    const bucket = readBucket();

    const versus = $("[data-px-versus]");
    const empty = $("[data-px-empty]");
    const roundEl = $("[data-px-round]");
    const dateEl = $("[data-px-date]");
    const pickEl = $("[data-px-yourpick]");
    const stakeEl = $("[data-px-stake]");

    if (!next) {
      if (versus) versus.hidden = true;
      if (empty) empty.hidden = false;
      if (roundEl) roundEl.textContent = "Eliminatorias";
      if (dateEl) dateEl.textContent = "Por definir";
      if (pickEl) pickEl.textContent = "";
      if (stakeEl) stakeEl.textContent = "";
      startCountdown(null);
      renderRecent(resolved);
      return;
    }

    if (versus) versus.hidden = false;
    if (empty) empty.hidden = true;
    if (roundEl) roundEl.textContent = next.match.roundLabel;
    if (dateEl) dateEl.textContent = fmtWhen(next.match);

    const setSide = (side, slot) => {
      const panel = $(`[data-px-team="${side}"]`);
      const name = $(`[data-px-name="${side}"]`);
      if (panel) {
        if (slot.flag) panel.style.setProperty("--px-flag", `url("${slot.flag}")`);
        else panel.style.removeProperty("--px-flag");
        panel.dataset.hasFlag = slot.flag ? "true" : "false";
      }
      if (name) name.textContent = slot.name;
    };
    setSide("home", next.slotA);
    setSide("away", next.slotB);

    // Tu pronostico para este cruce.
    const pred = bucket[next.match.id];
    if (pickEl) {
      if (pred && pred.homeScore != null && pred.awayScore != null && pred.advances) {
        const adv = pred.advances === "home" ? next.slotA.shortCode : next.slotB.shortCode;
        pickEl.innerHTML = `Tu pronóstico: <strong>${pred.homeScore}-${pred.awayScore}</strong> · avanza ${adv}`;
      } else {
        pickEl.innerHTML = 'Aún no lo pronosticaste · <a href="/predicciones">Cargar pronóstico</a>';
      }
    }

    if (stakeEl) {
      const toLabel = next.match.winnerTo ? roundLabelById.get(next.match.winnerTo) : null;
      stakeEl.textContent = toLabel ? `En juego: el ganador avanza a ${toLabel}.` : "En juego: el título.";
    }

    startCountdown(next.match);
    renderRecent(resolved);
  };

  const renderRecent = (resolved) => {
    const list = $("[data-px-recent]");
    if (!list) return;
    const recent = recentResults(resolved, { limit: 6 });
    if (!recent.length) {
      list.innerHTML = '<li class="px-recent-empty">Aún sin resultados cargados.</li>';
      return;
    }
    list.innerHTML = recent
      .map((it) => {
        const live = readLiveKnockout(seed);
        const r = live.results[it.match.id] ?? {};
        const adv = it.winnerCode ? `→ ${teamsByCode.get(it.winnerCode)?.shortCode ?? it.winnerCode}` : "";
        return `<li class="px-recent-card"><span class="px-recent-id">${it.match.id}</span><span class="px-recent-teams">${it.slotA.shortCode}<span class="px-recent-score">${r.homeScore ?? "?"}-${r.awayScore ?? "?"}</span>${it.slotB.shortCode}</span><span class="px-recent-adv">${adv}</span></li>`;
      })
      .join("");
  };

  render();
  subscribeLiveKnockout(render);
})();
