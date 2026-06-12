import { subscribeLiveData } from "../../lib/liveMatch/liveMatchState.js";
import { resolveLiveMatchPhase } from "../../lib/liveMatch/liveMatchPhase.js";

(async () => {
  const section = document.querySelector('[data-section="tabla"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-tabla-payload]");
  const payload = payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};

  if (payload.resetStateUrl) {
    try {
      const resetModule = await import(payload.resetStateUrl);
      resetModule.ensurePollaStorageVersion?.();
    } catch {
      // La tabla puede renderizar el estado limpio sin storage.
    }
  }
  const players = payload.players ?? [];
  const avatarById = new Map(players.map((player) => [player.id, player.avatarThumb ?? player.avatar]));
  const results = payload.results ?? [];
  const basePredictions = payload.predictions ?? [];
  const scoringRules = payload.scoringRules ?? { exact: 3, tendency: 1, loneWolf: 5 };
  const previousPositions = payload.previousPositions ?? {};
  const currentMatchId = payload.displayMatchId ?? payload.currentMatchId;
  const matches = payload.matches ?? [];
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const matchIdByNumber = new Map(matches.map((match) => [match.matchNumber, match.id]));

  // Fuente unica de calculo (mismo modulo que usa el SSR). Puntaje 5/3/1/0 y
  // precision visual separada del puntaje. Sin el, no recalculamos en vivo.
  let scoring = null;
  if (payload.liveScoringUrl) {
    try {
      scoring = await import(payload.liveScoringUrl);
    } catch {
      scoring = null;
    }
  }

  const safeGet = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const readJson = (key, fallback) => {
    const raw = safeGet(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const calculateMovement = (position, previousPosition) => {
    if (!previousPosition) return "new";
    if (position < previousPosition) return "up";
    if (position > previousPosition) return "down";
    return "same";
  };

  const mergeLocalPredictions = () => {
    const merged = new Map(basePredictions.map((prediction) => [`${prediction.playerId}:${prediction.matchId}`, prediction]));
    const stored = readJson("polla:predictions", {});

    Object.entries(stored).forEach(([playerId, predictionsByMatch]) => {
      Object.values(predictionsByMatch || {}).forEach((prediction) => {
        if (!prediction?.matchId) return;
        merged.set(`${playerId}:${prediction.matchId}`, {
          playerId,
          matchId: prediction.matchId,
          homeScore: prediction.homeScore,
          awayScore: prediction.awayScore,
        });
      });
    });

    return Array.from(merged.values());
  };

  // Puntaje y precision via el modulo unico `scoring` (mismo que el SSR).
  const calculateStandings = (predictions, resultsArg = results) => {
    const finishedResults = resultsArg.filter(
      (result) => result.status === "finished" && Number.isInteger(result.homeScore) && Number.isInteger(result.awayScore)
    );
    const byPlayerMatch = new Map(predictions.map((prediction) => [`${prediction.playerId}:${prediction.matchId}`, prediction]));
    const predsByMatch = new Map();
    predictions.forEach((prediction) => {
      const list = predsByMatch.get(prediction.matchId) ?? [];
      list.push(prediction);
      predsByMatch.set(prediction.matchId, list);
    });

    const rows = players.map((player) => {
      let points = 0;
      let exactHits = 0;
      let tendencyHits = 0;
      let misses = 0;
      let goalDifference = 0;
      const streak = [];

      finishedResults.forEach((result) => {
        const prediction = byPlayerMatch.get(`${player.id}:${result.matchId}`);
        const allForMatch = predsByMatch.get(result.matchId) ?? [];
        const { points: matchPoints, hitType } = scoring.calculatePointsForPrediction(prediction, result, allForMatch);
        points += matchPoints;

        if (hitType === "lone_wolf" || hitType === "exact") {
          exactHits += 1;
          goalDifference += 4;
          streak.push("G");
        } else if (hitType === "tendency") {
          tendencyHits += 1;
          goalDifference += Math.max(0, 4 - scoring.getGoalDistance(prediction, result));
          streak.push("E");
        } else {
          misses += 1;
          if (hitType === "none") goalDifference += Math.max(0, 4 - scoring.getGoalDistance(prediction, result));
          streak.push("P");
        }
      });

      const played = finishedResults.length;
      const maxPoints = played * scoringRules.loneWolf;
      return {
        playerId: player.id,
        name: player.name,
        position: 0,
        previousPosition: previousPositions[player.id],
        movement: "same",
        points,
        played,
        exactHits,
        tendencyHits,
        misses,
        goalDifference,
        performance: maxPoints > 0 ? Math.max(0, Math.round((points / maxPoints) * 100)) : 0,
        streak: streak.slice(-2),
      };
    });

    rows.sort((a, b) => b.points - a.points || b.performance - a.performance || b.goalDifference - a.goalDifference || a.name.localeCompare(b.name));
    return rows.map((row, index) => ({
      ...row,
      position: index + 1,
      movement: calculateMovement(index + 1, row.previousPosition),
    }));
  };

  // Precision visual (NO es puntaje) + puntos por separado, para el panel.
  const calculateAccuracy = (predictions, matchId = currentMatchId, resultsArg = results) => {
    const currentResult = resultsArg.find(
      (result) =>
        result.matchId === matchId &&
        Number.isInteger(result.homeScore) &&
        Number.isInteger(result.awayScore)
    );
    const predsForMatch = predictions.filter((prediction) => prediction.matchId === matchId);
    const byPlayer = new Map(predsForMatch.map((prediction) => [prediction.playerId, prediction]));
    const hasResult = Boolean(currentResult);

    return players
      .map((player) => {
        const prediction = byPlayer.get(player.id);
        const hasPrediction = scoring.hasCompletePrediction(prediction);
        const predictionLabel = hasPrediction ? `${prediction.homeScore} - ${prediction.awayScore}` : "--";

        if (!hasResult) {
          return {
            playerId: player.id,
            name: player.name,
            prediction: predictionLabel,
            points: 0,
            hitType: hasPrediction ? "pending" : "no_info",
            differenceLabel: hasPrediction ? "EN ESPERA" : "SIN INFO",
            accuracyPercent: 0,
            accuracyLabel: hasPrediction ? "EN ESPERA" : "SIN INFO",
            level: "very_far",
          };
        }

        const accuracy = scoring.calculateLiveAccuracy(prediction, currentResult);
        const score = scoring.calculatePointsForPrediction(prediction, currentResult, predsForMatch);
        return {
          playerId: player.id,
          name: player.name,
          prediction: predictionLabel,
          points: score.points,
          hitType: score.hitType,
          differenceLabel: score.label,
          accuracyPercent: accuracy.percentage,
          accuracyLabel: accuracy.label,
          level: scoring.accuracyLevelFromPercent(accuracy.percentage),
        };
      })
      .sort((a, b) => (hasResult ? b.points - a.points || b.accuracyPercent - a.accuracyPercent || a.name.localeCompare(b.name) : 0));
  };

  const updateMovement = (rowNode, movement) => {
    const node = rowNode.querySelector("[data-movement]");
    if (!node) return;
    const labels = { up: "Sube", down: "Baja", same: "Mantiene", new: "Nuevo" };
    const SECT = "/assets/polla-mundialera/sections/05_tabla";
    const UI = "/assets/polla-mundialera/00_shared/ui";
    const iconSrc = {
      up: `${SECT}/icon-trend-up-green.webp`,
      down: `${SECT}/icon-trend-down-red.webp`,
      same: `${SECT}/icon-trend-neutral-gray.webp`,
      new: `${UI}/icon-star-blue.webp`,
    };
    node.dataset.movement = movement;
    node.setAttribute("aria-label", labels[movement]);
    const img = node.querySelector("[data-movement-icon]");
    if (img) {
      const next = iconSrc[movement] ?? iconSrc.same;
      if (!img.getAttribute("src") || !img.getAttribute("src").endsWith(next)) {
        img.src = next;
      }
    }
  };

  const renderRanking = (rows) => {
    const body = section.querySelector("[data-ranking-body]");
    if (!body) return;

    rows.forEach((row) => {
      const rowNode = body.querySelector(`[data-ranking-row][data-player-id="${row.playerId}"]`);
      if (!rowNode) return;
      rowNode.dataset.position = row.position;
      rowNode.dataset.rank = row.points > 0 && row.position <= 3 ? `top-${row.position}` : "other";
      rowNode.querySelector("[data-rank-position]").textContent = row.position;
      rowNode.querySelector("[data-rank-points]").textContent = row.points;
      rowNode.querySelector("[data-rank-played]").textContent = row.played;
      rowNode.querySelector("[data-rank-exact]").textContent = row.exactHits;
      rowNode.querySelector("[data-rank-tendency]").textContent = row.tendencyHits;
      rowNode.querySelector("[data-rank-misses]").textContent = row.misses;
      rowNode.querySelector("[data-rank-difference]").textContent = row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference;
      rowNode.querySelector("[data-rank-performance]").textContent = `${row.performance}%`;
      updateMovement(rowNode, row.movement);
      body.append(rowNode);
    });
  };

  // Podio (top 3) — se mantiene sincronizado con el recompute en vivo para que
  // nunca contradiga la tabla. Solo actualiza nodos existentes, sin reconstruir.
  const renderPodium = (rows) => {
    const strip = section.querySelector("[data-podium-strip]");
    if (!strip) return;
    const leaderPoints = rows[0]?.points ?? 0;
    for (let i = 0; i < 3; i += 1) {
      const card = strip.querySelector(`[data-podium-slot="${i + 1}"]`);
      const row = rows[i];
      if (!card || !row) continue;
      card.dataset.playerId = row.playerId;
      const nameEl = card.querySelector("[data-podium-name]");
      if (nameEl) nameEl.textContent = row.name;
      const ptsEl = card.querySelector("[data-podium-points]");
      if (ptsEl) ptsEl.textContent = row.points;
      const gapEl = card.querySelector("[data-podium-gap]");
      if (gapEl) gapEl.textContent = i === 0 ? "LÍDER" : `a ${Math.max(0, leaderPoints - row.points)} pts`;
      const img = card.querySelector("[data-podium-avatar]");
      const src = avatarById.get(row.playerId);
      if (img && src) img.src = src;
    }
  };

  const renderAccuracy = (rows) => {
    const list = section.querySelector("[data-player-predictions-list]");
    if (!list) return;

    const setText = (node, sel, val) => {
      const target = node.querySelector(sel);
      if (target && val != null) target.textContent = val;
    };

    rows.forEach((row) => {
      const rowNode = list.querySelector(`[data-player-prediction-row][data-player-id="${row.playerId}"]`);
      if (!rowNode) return;
      rowNode.dataset.accuracyLevel = row.level;
      rowNode.dataset.hitType = row.hitType ?? "";
      setText(rowNode, "[data-prediction-score]", row.prediction);
      // PUNTOS (oficiales) — separados de la precision visual.
      setText(rowNode, "[data-prediction-points]", row.points > 0 ? `+${row.points}` : "0");
      setText(rowNode, "[data-prediction-type]", row.differenceLabel);
      // PRECISION % (solo visual, no entrega puntos).
      setText(rowNode, "[data-prediction-percent]", `${row.accuracyPercent}%`);
      setText(rowNode, "[data-prediction-acc-label]", row.accuracyLabel);
      // Compat con markup viejo si existiera.
      setText(rowNode, "[data-prediction-diff]", row.differenceLabel);
      const bar = rowNode.querySelector("[data-accuracy-level]");
      const fill = rowNode.querySelector("[data-accuracy-fill]");
      if (bar) bar.dataset.accuracyLevel = row.level;
      if (fill) fill.style.width = `${row.accuracyPercent}%`;
      list.append(rowNode);
    });
  };

  // ── Pipeline marcador en vivo -> tabla ──────────────────────────────────
  // La tabla SSR ya sale calculada con predictions.json. Solo recalculamos
  // cuando hay marcador en vivo, oficiales o un partido preparado que mostrar
  // (asi no se reordena tras el primer paint sin motivo = sin flash). El
  // marcador del admin llega por subscribeLiveData: Supabase Realtime como
  // fuente compartida y localStorage/eventos como cache local. El tri-estado
  // official/live/pending se resuelve en lib/liveMatch/liveMatchPhase.js:
  // solo "live" puntua y activa banner provisional; "pending" re-apunta las
  // cards y el panel (EN ESPERA, 0 puntos) sin mover el ranking.

  const officialToResults = (officialResults) =>
    (officialResults ?? [])
      .filter((r) => r && r.matchId && Number.isInteger(r.homeTeamScore) && Number.isInteger(r.awayTeamScore))
      .map((r) => ({ matchId: r.matchId, status: "finished", homeScore: r.homeTeamScore, awayScore: r.awayTeamScore }));

  const resolveLiveMatchId = (liveMatch) =>
    liveMatch?.matchId ?? matchIdByNumber.get(liveMatch?.matchNumber) ?? null;

  // Conversion pura marcador->resultado. El gating de CUANDO ese marcador
  // puntua vive en resolveLiveMatchPhase (lib/liveMatch/liveMatchPhase.js):
  // un 0-0 preparado no entrega puntos antes de la hora del fixture, y la
  // fase live termina solo al oficializar (sin expiracion automatica).
  const liveToResult = (liveMatch) => {
    if (!liveMatch) return null;
    const matchId = resolveLiveMatchId(liveMatch);
    if (
      !matchId ||
      !Number.isInteger(liveMatch.homeTeamScore) ||
      !Number.isInteger(liveMatch.awayTeamScore)
    ) {
      return null;
    }
    return {
      matchId,
      status: "finished",
      homeScore: liveMatch.homeTeamScore,
      awayScore: liveMatch.awayTeamScore,
    };
  };

  const toggleProvisional = (on) => {
    const banner = section.querySelector("[data-tabla-provisional]");
    if (banner) banner.hidden = !on;
    section.dataset.provisional = on ? "true" : "false";
  };

  const updateLiveMatchCard = (liveMatch, fixtureMatch, { isLive = true } = {}) => {
    const card = section.querySelector("[data-live-match-card]");
    if (!card || !fixtureMatch) return;

    const setText = (sel, val) => {
      const node = card.querySelector(sel);
      if (node && val != null) node.textContent = val;
    };

    const matchId = liveMatch?.matchId ?? fixtureMatch.id;
    if (matchId) card.dataset.matchId = matchId;

    // "waiting" es el estado de espera que estiliza LiveMatchCard.astro (SSR).
    card.dataset.liveState = isLive ? "in_progress" : "waiting";

    setText("[data-live-status]", isLive ? "EN VIVO" : "EN ESPERA");
    setText("[data-live-home-score]", isLive ? String(liveMatch.homeTeamScore) : "-");
    setText("[data-live-away-score]", isLive ? String(liveMatch.awayTeamScore) : "-");
    setText("[data-live-separator]", isLive ? "vs" : "/");
    setText("[data-live-minute]", isLive ? "EN VIVO" : "Sin goles aun");

    const home = fixtureMatch.homeTeam;
    const away = fixtureMatch.awayTeam;

    if (home) {
      setText("[data-live-home]", home.name);
      const flag = card.querySelector("[data-live-home-flag]");
      if (flag) flag.src = `/assets/flags/${home.id}.svg`;
    }

    if (away) {
      setText("[data-live-away]", away.name);
      const flag = card.querySelector("[data-live-away-flag]");
      if (flag) flag.src = `/assets/flags/${away.id}.svg`;
    }

    if (fixtureMatch.location) {
      setText("[data-live-stadium]", fixtureMatch.location);
    }
  };

  const updateNextMatchCard = (liveMatchId, officialResults) => {
    const card = section.querySelector("[data-next-match-card]");
    if (!card) return;
    const finalized = new Set((officialResults ?? []).map((r) => r.matchId));
    const liveNumber = matchById.get(liveMatchId)?.matchNumber ?? 0;
    const next = [...matches]
      .sort((a, b) => a.matchNumber - b.matchNumber)
      .find((m) => m.matchNumber > liveNumber && m.id !== liveMatchId && !finalized.has(m.id));
    if (!next) return;
    updateNextMatchCardDirect(next);
  };

  const updateNextMatchCardDirect = (next) => {
    const card = section.querySelector("[data-next-match-card]");
    if (!card || !next) return;

    const setText = (sel, val) => {
      const node = card.querySelector(sel);
      if (node && val != null) node.textContent = val;
    };

    setText("[data-next-home]", next.homeTeam?.name);
    setText("[data-next-away]", next.awayTeam?.name);

    const dateLabel = next.dateChile
      ? new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(new Date(next.dateChile))
      : "--";

    setText("[data-next-date]", dateLabel);
    setText("[data-next-time]", next.timeChile ?? "--:--");
  };

  const firstOpenMatch = (officialIds) =>
    [...matches]
      .sort((a, b) => a.matchNumber - b.matchNumber)
      .find((match) => !officialIds.has(match.id)) ?? null;

  const resolvePendingDisplayMatch = (liveMatch, officialIds) => {
    const remoteMatchId = resolveLiveMatchId(liveMatch);

    // Si Admin ya dejó preparado el partido siguiente y todavía no está oficializado,
    // mostramos ese partido en espera.
    if (remoteMatchId && !officialIds.has(remoteMatchId)) {
      return matchById.get(remoteMatchId) ?? null;
    }

    // Si el marcador remoto quedó apuntando al partido recién finalizado,
    // saltamos al primer partido que todavía no tiene resultado oficial.
    return firstOpenMatch(officialIds);
  };

  const recompute = ({ liveMatch, officialResults }) => {
    if (!scoring) return; // sin el modulo de calculo, no tocamos el SSR

    // Tri-estado del marcador remoto: official / live (puntuable) / pending
    // (visible sin puntuar). Fuente unica: lib/liveMatch/liveMatchPhase.js.
    const phase = resolveLiveMatchPhase({
      liveMatch,
      fixtureMatch: matchById.get(resolveLiveMatchId(liveMatch)) ?? null,
      officialResults,
    });

    const live = phase === "live" ? liveToResult(liveMatch) : null;
    const official = officialToResults(officialResults);
    const officialIds = new Set(official.map((r) => r.matchId));
    const liveActive = Boolean(live) && !officialIds.has(live.matchId);

    const pendingMatch = liveActive ? null : resolvePendingDisplayMatch(liveMatch, officialIds);

    // Nada que sobreponer: respetar el SSR, salvo que exista un partido pendiente
    // preparado por Admin que debamos mostrar sin puntuar.
    if (!liveActive && official.length === 0 && !pendingMatch) {
      toggleProvisional(false);
      return;
    }

    const predictions = mergeLocalPredictions();
    const baseResults = [...results.filter((r) => !officialIds.has(r.matchId)), ...official];
    const effectiveResults = liveActive
      ? [...baseResults.filter((r) => r.matchId !== live.matchId), live]
      : baseResults;

    let rows = calculateStandings(predictions, effectiveResults);
    if (liveActive) {
      // Flechas de movimiento = efecto del marcador en vivo vs el ranking oficial.
      const basePos = new Map(
        calculateStandings(predictions, baseResults).map((row) => [row.playerId, row.position])
      );
      rows = rows.map((row) => {
        const previousPosition = basePos.get(row.playerId) ?? row.previousPosition;
        return { ...row, previousPosition, movement: calculateMovement(row.position, previousPosition) };
      });
    }
    renderRanking(rows);
    renderPodium(rows);

    const displayMatchId = liveActive ? live.matchId : pendingMatch?.id ?? currentMatchId;
    renderAccuracy(calculateAccuracy(predictions, displayMatchId, effectiveResults));

    if (liveActive) {
      updateLiveMatchCard(liveMatch, matchById.get(live.matchId), { isLive: true });
      updateNextMatchCard(live.matchId, officialResults);
    } else if (pendingMatch) {
      updateLiveMatchCard(liveMatch, pendingMatch, { isLive: false });
      updateNextMatchCardDirect(pendingMatch);
    }

    toggleProvisional(liveActive);
  };

  // Cruce de resaltado: al pasar/enfocar una fila o una prediccion, se resalta
  // el mismo jugador en la tabla, el panel y el podio. Solo togglea una clase.
  const wireCrossHighlight = () => {
    const setHighlight = (playerId, on) => {
      if (!playerId) return;
      section
        .querySelectorAll(`[data-player-id="${playerId}"]`)
        .forEach((node) => node.classList.toggle("is-cross-highlight", on));
    };
    const triggers = section.querySelectorAll(
      "[data-ranking-row], [data-player-prediction-row], [data-podium-slot]"
    );
    triggers.forEach((node) => {
      const pid = node.dataset.playerId;
      if (!pid) return;
      node.addEventListener("mouseenter", () => setHighlight(node.dataset.playerId, true));
      node.addEventListener("mouseleave", () => setHighlight(node.dataset.playerId, false));
      node.addEventListener("focusin", () => setHighlight(node.dataset.playerId, true));
      node.addEventListener("focusout", () => setHighlight(node.dataset.playerId, false));
    });
  };
  wireCrossHighlight();

  subscribeLiveData(recompute);
})();
