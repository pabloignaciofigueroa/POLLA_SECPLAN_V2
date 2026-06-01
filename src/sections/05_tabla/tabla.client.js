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
  const results = payload.results ?? [];
  const basePredictions = payload.predictions ?? [];
  const scoringRules = payload.scoringRules ?? { exact: 3, tendency: 1, loneWolf: 5 };
  const previousPositions = payload.previousPositions ?? {};
  const currentMatchId = payload.displayMatchId ?? payload.currentMatchId;

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

  const outcome = (homeScore, awayScore) => {
    if (homeScore > awayScore) return "home";
    if (awayScore > homeScore) return "away";
    return "draw";
  };

  const complete = (prediction) =>
    prediction && Number.isInteger(prediction.homeScore) && Number.isInteger(prediction.awayScore);

  const predictionKey = (prediction) => `${prediction.matchId}:${prediction.homeScore}-${prediction.awayScore}`;

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

  const calculateStandings = (predictions) => {
    const finishedResults = results.filter(
      (result) => result.status === "finished" && Number.isInteger(result.homeScore) && Number.isInteger(result.awayScore)
    );
    const byPlayerMatch = new Map(predictions.map((prediction) => [`${prediction.playerId}:${prediction.matchId}`, prediction]));
    const exactCounts = new Map();

    finishedResults.forEach((result) => {
      predictions
        .filter(
          (prediction) =>
            prediction.matchId === result.matchId &&
            prediction.homeScore === result.homeScore &&
            prediction.awayScore === result.awayScore
        )
        .forEach((prediction) => {
          const key = predictionKey(prediction);
          exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1);
        });
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
        if (!complete(prediction)) {
          misses += 1;
          streak.push("P");
          return;
        }

        const exact = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
        const tendency = outcome(prediction.homeScore, prediction.awayScore) === outcome(result.homeScore, result.awayScore);
        const distance = Math.abs(prediction.homeScore - result.homeScore) + Math.abs(prediction.awayScore - result.awayScore);
        goalDifference += Math.max(0, 4 - distance);

        if (exact) {
          exactHits += 1;
          points += scoringRules.exact;
          if ((exactCounts.get(predictionKey(prediction)) ?? 0) === 1) points += scoringRules.loneWolf;
          streak.push("G");
          return;
        }

        if (tendency) {
          tendencyHits += 1;
          points += scoringRules.tendency;
          streak.push("E");
          return;
        }

        misses += 1;
        streak.push("P");
      });

      const played = finishedResults.length;
      const maxPoints = played * scoringRules.exact;
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

  const accuracyLevel = (distance) => {
    if (distance === 0) return ["excellent", "EXACTO", 100];
    if (distance === 1) return ["close", "-1 GOL", 75];
    if (distance === 2) return ["regular", "-2 GOLES", 55];
    if (distance <= 4) return ["far", "LEJOS", 30];
    return ["very_far", "MUY LEJOS", 5];
  };

  const calculateAccuracy = (predictions) => {
    const currentResult = results.find(
      (result) =>
        result.matchId === currentMatchId &&
        Number.isInteger(result.homeScore) &&
        Number.isInteger(result.awayScore)
    );
    const byPlayer = new Map(predictions.filter((prediction) => prediction.matchId === currentMatchId).map((prediction) => [prediction.playerId, prediction]));
    const hasResult = Boolean(currentResult);

    return players
      .map((player) => {
        const prediction = byPlayer.get(player.id);
        const hasPrediction = complete(prediction);
        if (!hasResult) {
          return {
            playerId: player.id,
            name: player.name,
            prediction: hasPrediction ? `${prediction.homeScore} - ${prediction.awayScore}` : "--",
            differenceLabel: hasPrediction ? "EN ESPERA" : "SIN INFO",
            accuracyPercent: 0,
            level: "very_far",
          };
        }

        const distance = hasPrediction
          ? Math.abs(prediction.homeScore - currentResult.homeScore) + Math.abs(prediction.awayScore - currentResult.awayScore)
          : 99;
        const [level, label, percent] = accuracyLevel(distance);
        return {
          playerId: player.id,
          name: player.name,
          prediction: hasPrediction ? `${prediction.homeScore} - ${prediction.awayScore}` : "--",
          differenceLabel: hasPrediction ? label : "SIN INFO",
          accuracyPercent: hasPrediction ? percent : 0,
          level,
        };
      })
      .sort((a, b) => hasResult ? b.accuracyPercent - a.accuracyPercent || a.name.localeCompare(b.name) : 0);
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

  const renderAccuracy = (rows) => {
    const list = section.querySelector("[data-player-predictions-list]");
    if (!list) return;

    rows.forEach((row) => {
      const rowNode = list.querySelector(`[data-player-prediction-row][data-player-id="${row.playerId}"]`);
      if (!rowNode) return;
      rowNode.dataset.accuracyLevel = row.level;
      rowNode.querySelector("[data-prediction-score]").textContent = row.prediction;
      rowNode.querySelector("[data-prediction-diff]").textContent = row.differenceLabel;
      rowNode.querySelector("[data-prediction-percent]").textContent = `${row.accuracyPercent}%`;
      const bar = rowNode.querySelector("[data-accuracy-level]");
      const fill = rowNode.querySelector("[data-accuracy-fill]");
      if (bar) bar.dataset.accuracyLevel = row.level;
      if (fill) fill.style.width = `${row.accuracyPercent}%`;
      list.append(rowNode);
    });
  };

  // La tabla publica ya sale calculada desde SSR con predictions.json.
  // No mezclamos drafts de localStorage durante la hidratacion inicial: eso
  // reordenaba filas despues del primer paint y se percibia como flash.
})();
