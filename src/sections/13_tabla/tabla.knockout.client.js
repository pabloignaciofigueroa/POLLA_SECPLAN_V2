// Ranking de eliminatorias (PODIO + ESCALERA). 100% local. Puntua cartones contra los
// resultados vivos del admin, reordena en vivo, y suma espectaculo: count-up de puntos,
// .is-score-pop al cambiar, flechas de movimiento y .is-row-rise al subir.
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { deriveActualPodium, resolveBracket } from "../../lib/knockout/bracket.js";
import { buildKnockoutLeaderboard } from "../../lib/knockout/scoring.js";
import { findNextMatch } from "../../lib/knockout/schedule.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";

(() => {
  const section = document.querySelector('[data-section="tabla"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-tabla-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const players = payload.players ?? [];
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };
  const submissions = payload.submissions ?? [];

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const readJson = (k, fb) => { try { const p = JSON.parse(safeGet(k) || "null"); return p && typeof p === "object" ? p : fb; } catch { return fb; } };

  const body = section.querySelector("[data-tabla-body]");
  const noteNode = section.querySelector("[data-tabla-note]");
  const defaultNote = noteNode ? noteNode.textContent : "";
  const rowById = new Map(players.map((p) => [p.id, section.querySelector(`[data-tabla-row="${p.id}"]`)]));

  // ===== Panel derecho: cruce activo/próximo + predicciones por jugador =====
  const cruceBox = section.querySelector("[data-tabla-cruce]");
  const cruceWhen = section.querySelector("[data-tabla-cruce-when]");
  const cruceHome = section.querySelector("[data-tabla-cruce-home]");
  const cruceAway = section.querySelector("[data-tabla-cruce-away]");
  const cruceScore = section.querySelector("[data-tabla-cruce-score]");
  const cruceState = section.querySelector("[data-tabla-cruce-state]");
  const predsBox = section.querySelector("[data-tabla-preds]");
  const predRowById = new Map(players.map((p) => [p.id, section.querySelector(`[data-tabla-pred="${p.id}"]`)]));

  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const fmtWhen = (m) => {
    if (!m || !m.dateCL) return "Por definir";
    const p = String(m.dateCL).split("-").map(Number);
    return `${p[2]} ${MES[(p[1] || 1) - 1] || ""} · ${m.timeCL || ""}`;
  };
  const setText = (el, t) => { if (el) el.textContent = t; };
  // Puntos simples por cruce jugado (panel informativo; el ranking usa el motor oficial de scoring).
  const matchPts = (pred, res) => {
    if (!pred || !res || res.homeScore == null || res.awayScore == null) return null;
    if (pred.homeScore == null || pred.awayScore == null) return 0;
    if (Number(pred.homeScore) === Number(res.homeScore) && Number(pred.awayScore) === Number(res.awayScore)) return 3;
    return Math.sign(pred.homeScore - pred.awayScore) === Math.sign(res.homeScore - res.awayScore) ? 1 : 0;
  };

  const renderCruce = (live, predictionsByPlayer) => {
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    const next = findNextMatch(resolved);
    if (!next) {
      setText(cruceWhen, "Por definir"); setText(cruceHome, "—"); setText(cruceAway, "—");
      setText(cruceScore, "– : –"); setText(cruceState, "Por definir");
      if (cruceBox) cruceBox.dataset.state = "pending";
      predRowById.forEach((row) => {
        if (!row) return;
        setText(row.querySelector("[data-pred-score]"), "– : –");
        setText(row.querySelector("[data-pred-adv]"), "–");
        setText(row.querySelector("[data-pred-pts]"), "–");
        const f = row.querySelector("[data-pred-flag]");
        if (f) f.dataset.empty = "true";
        row.dataset.ptsPos = "false";
      });
      return;
    }
    const m = next.match;
    const res = live.results[m.id];
    const hasScore = res && res.homeScore != null && res.awayScore != null;
    const isFinal = hasScore && res.status === "final";
    const isLive = hasScore && !isFinal;
    setText(cruceWhen, fmtWhen(m));
    setText(cruceHome, next.slotA.name || "—");
    setText(cruceAway, next.slotB.name || "—");
    setText(cruceScore, hasScore ? `${res.homeScore} : ${res.awayScore}` : "– : –");
    setText(cruceState, isFinal ? "Finalizado" : isLive ? "En vivo" : "Por jugar");
    if (cruceBox) cruceBox.dataset.state = isFinal ? "done" : isLive ? "live" : "upcoming";

    predRowById.forEach((row, pid) => {
      if (!row) return;
      const pred = (predictionsByPlayer[pid] || {})[m.id];
      const scoreEl = row.querySelector("[data-pred-score]");
      const advEl = row.querySelector("[data-pred-adv]");
      const ptsEl = row.querySelector("[data-pred-pts]");
      const flagEl = row.querySelector("[data-pred-flag]");
      if (pred && pred.homeScore != null && pred.awayScore != null) {
        setText(scoreEl, `${pred.homeScore} : ${pred.awayScore}`);
        const adv = pred.advances === "home" ? next.slotA.shortCode : pred.advances === "away" ? next.slotB.shortCode : "–";
        setText(advEl, adv || "–");
        // Banderita del equipo que el jugador hace avanzar (a quién le va).
        const flag = pred.advances === "home" ? next.slotA.flag : pred.advances === "away" ? next.slotB.flag : null;
        if (flagEl) {
          if (flag) { flagEl.style.backgroundImage = `url("${flag}")`; flagEl.dataset.empty = "false"; }
          else { flagEl.style.backgroundImage = ""; flagEl.dataset.empty = "true"; }
        }
      } else {
        setText(scoreEl, "– : –");
        setText(advEl, "–");
        if (flagEl) { flagEl.style.backgroundImage = ""; flagEl.dataset.empty = "true"; }
      }
      // EN VIVO también suma (provisional): la gracia es que el puntaje cambie con cada gol.
      const pts = matchPts(pred, hasScore ? res : null);
      setText(ptsEl, pts == null ? "–" : String(pts));
      row.dataset.ptsPos = pts > 0 ? "true" : "false";
      row.dataset.ptsLive = isLive && pts > 0 ? "true" : "false";
    });

    // Reordenar por cercanía al marcador ACTUAL: el más parecido primero, mismo resultado agrupado,
    // luego por probabilidad de acertarle (menor distancia = más probable). Sin pronóstico, al final.
    const ah = hasScore ? Number(res.homeScore) : null;
    const aa = hasScore ? Number(res.awayScore) : null;
    const order = players.map((p) => {
      const pred = (predictionsByPlayer[p.id] || {})[m.id];
      const has = pred && pred.homeScore != null && pred.awayScore != null;
      const ph = has ? Number(pred.homeScore) : 99;
      const pa = has ? Number(pred.awayScore) : 99;
      const dist = has && hasScore ? Math.abs(ph - ah) + Math.abs(pa - aa) : 0;
      return { row: predRowById.get(p.id), has: has ? 1 : 0, dist, ph, pa, name: p.name };
    });
    order.sort((x, y) =>
      y.has - x.has ||
      x.dist - y.dist ||
      x.ph - y.ph || x.pa - y.pa ||
      String(x.name).localeCompare(String(y.name)),
    );
    if (predsBox) order.forEach((o) => { if (o.row) predsBox.appendChild(o.row); });
  };

  const prevPos = new Map();
  let firstRun = true;

  const fire = (el, cls) => { if (!el || reduce) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const countUp = (el, to) => {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (reduce || from === to) { el.textContent = String(to); return; }
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
    for (const [pid, bucket] of Object.entries(lsPreds)) predictionsByPlayer[pid] = bucket;
    const lsPod = readJson("polla:podiumPredictions", {});
    for (const [pid, pod] of Object.entries(lsPod)) podiumByPlayer[pid] = pod;
    return { predictionsByPlayer, podiumByPlayer };
  };

  const render = () => {
    const live = readLiveKnockout(seed);
    const hasResults = Object.keys(live.results).length > 0;
    const actualPodium = hasResults
      ? deriveActualPodium(matches, { assignments: live.assignments, results: live.results, teamsByCode })
      : null;
    const { predictionsByPlayer, podiumByPlayer } = buildBuckets();

    const rows = buildKnockoutLeaderboard({
      players,
      predictionsByPlayer,
      podiumByPlayer,
      results: live.results,
      actualPodium,
    });

    rows.forEach((row, i) => {
      const card = rowById.get(row.playerId);
      if (!card) return;
      const posCell = card.querySelector('[data-cell="pos"]');
      if (posCell) posCell.textContent = String(row.position);

      const totalCell = card.querySelector('[data-cell="total"]');
      const totalChanged = totalCell && (parseInt(totalCell.textContent, 10) || 0) !== row.total;
      countUp(totalCell, row.total);
      const matchCell = card.querySelector('[data-cell="match"]');
      const podCell = card.querySelector('[data-cell="podium"]');
      if (matchCell) matchCell.textContent = String(row.matchPoints);
      if (podCell) podCell.textContent = String(row.podiumPoints);

      card.dataset.leader = i === 0 && row.total > 0 ? "true" : "false";

      // Movimiento (solo con torneo en curso y cambio real de posicion).
      const before = prevPos.get(row.playerId);
      if (!firstRun && hasResults && before != null && before !== row.position) {
        const up = before > row.position;
        card.dataset.change = up ? "up" : "down";
        if (up) fire(card, "is-row-rise");
      } else {
        card.dataset.change = "same";
      }
      if (totalChanged && row.total > 0) fire(card.querySelector(".tk-pts"), "is-score-pop");
      prevPos.set(row.playerId, row.position);

      if (body) body.appendChild(card); // reordena segun ranking
    });

    if (body) body.dataset.started = hasResults ? "true" : "false";
    if (noteNode) noteNode.textContent = hasResults ? "En vivo · actualizado" : "Torneo no iniciado";
    renderCruce(live, predictionsByPlayer);
    firstRun = false;
  };

  render();
  subscribeLiveKnockout(render);
})();
