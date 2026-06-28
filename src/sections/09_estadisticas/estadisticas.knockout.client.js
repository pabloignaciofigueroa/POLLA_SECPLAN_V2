// Estadisticas de eliminatorias. 100% local. Consenso de la oficina por cruce + tu resumen.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket, deriveActualPodium } from "../../lib/knockout/bracket.js";
import { buildMatchConsensus, countCartones, buildPlayerProfile } from "../../lib/knockout/community.js";
import { buildKnockoutLeaderboard } from "../../lib/knockout/scoring.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";

(() => {
  const section = document.querySelector('[data-section="estadisticas"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-estadisticas-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const players = payload.players ?? [];
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };
  const submissions = payload.submissions ?? [];

  const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const readJson = (k, fb) => { try { const p = JSON.parse(safeGet(k) || "null"); return p && typeof p === "object" ? p : fb; } catch { return fb; } };
  const getPlayerId = () => {
    try { const q = new URL(window.location.href).searchParams.get("player"); if (q) return q; } catch {}
    return safeGet("polla:selectedPlayerId") || "invitado";
  };

  const $ = (s) => section.querySelector(s);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const countUp = (el, to) => {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (reduce || from === to || !Number.isFinite(to)) { el.textContent = String(to); return; }
    const t0 = performance.now(), dur = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const buildBuckets = () => {
    const predictionsByPlayer = {};
    const podiumByPlayer = {};
    for (const sub of submissions) {
      if (!sub || !sub.playerId) continue;
      predictionsByPlayer[sub.playerId] = sub.predictions ?? {};
      podiumByPlayer[sub.playerId] = sub.podium ?? {};
    }
    const lsPreds = readJson("polla:knockoutPredictions", {});
    for (const [pid, b] of Object.entries(lsPreds)) predictionsByPlayer[pid] = b;
    const lsPod = readJson("polla:podiumPredictions", {});
    for (const [pid, p] of Object.entries(lsPod)) podiumByPlayer[pid] = p;
    return { predictionsByPlayer, podiumByPlayer };
  };

  const render = () => {
    const live = readLiveKnockout(seed);
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    const resolvedById = new Map(resolved.map((r) => [r.match.id, r]));
    const { predictionsByPlayer, podiumByPlayer } = buildBuckets();

    // Cruces con ambos equipos concretos (consenso relevante).
    const concreteIds = resolved.filter((r) => r.codeA && r.codeB).map((r) => r.match.id);
    const consensus = buildMatchConsensus(predictionsByPlayer, concreteIds);

    // --- tu resumen ---
    const playerId = getPlayerId();
    const myBucket = predictionsByPlayer[playerId] ?? {};
    const myPodium = podiumByPlayer[playerId] ?? {};
    const prof = buildPlayerProfile(myBucket, myPodium);
    const hasResults = Object.keys(live.results).length > 0;
    const actualPodium = hasResults ? deriveActualPodium(matches, { assignments: live.assignments, results: live.results, teamsByCode }) : null;
    const board = buildKnockoutLeaderboard({ players, predictionsByPlayer, podiumByPlayer, results: live.results, actualPodium });
    const myRow = board.find((r) => r.playerId === playerId);

    const predicted = $("[data-es-predicted]");
    const podium = $("[data-es-podium]");
    const points = $("[data-es-points]");
    const cartonesNote = $("[data-es-cartones]");
    if (predicted) countUp(predicted, prof.predicted);
    if (podium) podium.textContent = `${prof.podiumFilled}/4`;
    if (points) countUp(points, myRow ? myRow.total : 0);
    if (cartonesNote) {
      const n = countCartones(predictionsByPlayer);
      cartonesNote.textContent = n === 0 ? "Aún sin cartones cargados." : `${n} ${n === 1 ? "cartón cargado" : "cartones cargados"}.`;
    }

    // --- consenso ---
    const list = $("[data-es-consensus]");
    if (!list) return;
    const rows = concreteIds
      .map((id) => ({ r: resolvedById.get(id), c: consensus[id] }))
      .filter((x) => x.r && x.c && x.c.total > 0)
      .sort((a, b) => b.c.total - a.c.total || a.r.match.matchNumber - b.r.match.matchNumber);

    if (!rows.length) {
      list.innerHTML = '<li class="es-vote-empty">El consenso aparece cuando hay cartones cargados y cruces con ambos equipos definidos.</li>';
      return;
    }

    list.innerHTML = rows
      .map(({ r, c }) => {
        const leanTeam = c.advHome >= c.advAway ? r.slotA.shortCode : r.slotB.shortCode;
        const top = c.topScores[0] ? `top ${c.topScores[0].score} (${c.topScores[0].count})` : "—";
        const tot2 = (c.advHome + c.advAway) || 1;
        const hp = Math.round((100 * c.advHome) / tot2);
        const ap = 100 - hp;
        const fA = r.slotA.flag ? `<img src="${r.slotA.flag}" alt="">` : "";
        const fB = r.slotB.flag ? `<img src="${r.slotB.flag}" alt="">` : "";
        return `<li class="es-vote">
          <div class="es-vote-head">
            <span class="es-vote-team">${fA}${r.slotA.shortCode}</span>
            <span class="es-vote-id">${r.match.id}</span>
            <span class="es-vote-team es-vote-team--away">${r.slotB.shortCode}${fB}</span>
          </div>
          <div class="es-vote-bar">
            <span class="es-vote-fill es-vote-fill--home" style="width:${hp}%">${c.advHome}</span>
            <span class="es-vote-fill es-vote-fill--away" style="width:${ap}%">${c.advAway}</span>
          </div>
          <div class="es-vote-meta"><span>${c.consensusPct}% → ${leanTeam}</span><span>${c.total} cartones · ${top}</span></div>
        </li>`;
      })
      .join("");
  };

  render();
  subscribeLiveKnockout(render);
})();
