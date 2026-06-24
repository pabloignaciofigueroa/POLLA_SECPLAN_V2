import { subscribeLiveData } from "../../lib/liveMatch/liveMatchState.js";
import { resolveLiveMatchPhase } from "../../lib/liveMatch/liveMatchPhase.js";
import { resolveActiveWindow, resolveEffectiveResults } from "../../lib/liveMatch/activeWindow.js";
import { buildPointLedger } from "../../lib/scoring/buildPointLedger.js";
import { computeGroupSituation } from "../../lib/fixture/groupState.js";
import { resolveDisplayWindow, windowImpactForPlayer } from "../../lib/tabla/resolveDisplayWindow.js";

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
  // F7: libro contable en vivo (proyectado + delta + formula). Bono de grupo ya gateado.
  const groups = payload.groups ?? [];
  const qualifiedPredictions = payload.qualifiedPredictions ?? [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const teamById = new Map();
  groups.forEach((group) => (group.teams ?? []).forEach((team) => teamById.set(team.id, team)));
  const matches = payload.matches ?? [];
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const matchIdByNumber = new Map(matches.map((match) => [match.matchNumber, match.id]));

  // El fixture manda: el "proximo partido" se decide por hora de inicio
  // (dateUtc), NO por matchNumber (que es una etiqueta fija, no cronologica).
  const byKickoff = (a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime();

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
    // La racha se lee en el orden en que se vivieron los partidos (dateUtc), no en
    // el orden FIFA con que llegan los resultados oficiales.
    const finishedResults = resultsArg
      .filter(
        (result) => result.status === "finished" && Number.isInteger(result.homeScore) && Number.isInteger(result.awayScore)
      )
      .sort((a, b) => {
        const ta = matchById.get(a.matchId)?.dateUtc;
        const tb = matchById.get(b.matchId)?.dateUtc;
        return new Date(ta ?? 0).getTime() - new Date(tb ?? 0).getTime();
      });
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
          streak.push(hitType);
        } else if (hitType === "tendency") {
          tendencyHits += 1;
          goalDifference += Math.max(0, 4 - scoring.getGoalDistance(prediction, result));
          streak.push("tendency");
        } else {
          misses += 1;
          if (hitType === "none") goalDifference += Math.max(0, 4 - scoring.getGoalDistance(prediction, result));
          streak.push("miss");
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
        // Ultimos 5, mas NUEVO a la izquierda (reverse del orden cronologico).
        streak: streak.slice(-5).reverse(),
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

  // Racha: mismo mapeo de color que el scoring (morado +5, azul +3, verde +1,
  // gris 0). Se reconstruye con createElement (sin innerHTML); el CSS vive
  // global anclado a [data-rank-streak] porque estos nodos nacen en runtime.
  const STREAK_LABELS = {
    lone_wolf: "+5 Lone Wolf",
    exact: "+3 Exacto",
    tendency: "+1 Tendencia",
    miss: "0 puntos",
  };

  const renderStreakDots = (rowNode, streak) => {
    const wrap = rowNode.querySelector("[data-rank-streak]");
    if (!wrap || !Array.isArray(streak)) return;
    wrap.replaceChildren(
      ...streak.map((hit) => {
        const type = STREAK_LABELS[hit] ? hit : "miss";
        const dot = document.createElement("span");
        dot.className = "streak-dot";
        dot.dataset.hitType = type;
        dot.title = STREAK_LABELS[type];
        dot.setAttribute("aria-label", STREAK_LABELS[type]);
        return dot;
      })
    );
  };

  const renderRanking = (rows) => {
    const body = section.querySelector("[data-ranking-body]");
    if (!body) return;

    rows.forEach((row) => {
      const rowNode = body.querySelector(`[data-ranking-row][data-player-id="${row.playerId}"]`);
      if (!rowNode) return;
      rowNode.dataset.position = row.position;
      // Protagonista = proyectado (oficial + provisional); el oficial queda secundario.
      const projected = row.projected ?? row.points;
      const officialPts = row.official ?? row.points;
      const delta = row.delta ?? projected - officialPts;
      const showProjection = delta !== 0;
      rowNode.dataset.rank = projected > 0 && row.position <= 3 ? `top-${row.position}` : "other";
      rowNode.querySelector("[data-rank-position]").textContent = row.position;
      const projEl = rowNode.querySelector("[data-rank-projected]");
      if (projEl) projEl.textContent = projected;
      const offEl = rowNode.querySelector("[data-rank-official]");
      if (offEl) offEl.textContent = officialPts;
      const deltaEl = rowNode.querySelector("[data-rank-delta]");
      if (deltaEl) {
        const numEl = deltaEl.querySelector("[data-rank-delta-num]");
        if (numEl) numEl.textContent = `${delta > 0 ? "+" : ""}${delta}`;
        deltaEl.dataset.trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        deltaEl.hidden = !showProjection;
      }
      const offWrap = rowNode.querySelector("[data-rank-official-wrap]");
      if (offWrap) offWrap.hidden = !showProjection;
      rowNode.querySelector("[data-rank-played]").textContent = row.played;
      rowNode.querySelector("[data-rank-exact]").textContent = row.exactHits;
      rowNode.querySelector("[data-rank-tendency]").textContent = row.tendencyHits;
      rowNode.querySelector("[data-rank-misses]").textContent = row.misses;
      rowNode.querySelector("[data-rank-difference]").textContent = row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference;
      rowNode.querySelector("[data-rank-performance]").textContent = `${row.performance}%`;
      renderStreakDots(rowNode, row.streak);
      updateMovement(rowNode, row.movement);
      body.append(rowNode);
    });
  };

  // Podio (top 3) — se mantiene sincronizado con el recompute en vivo para que
  // nunca contradiga la tabla. Solo actualiza nodos existentes, sin reconstruir.
  const renderPodium = (rows) => {
    const strip = section.querySelector("[data-podium-strip]");
    if (!strip) return;
    const pointsOf = (row) => row.projected ?? row.points;
    const leaderPoints = rows[0] ? pointsOf(rows[0]) : 0;
    for (let i = 0; i < 3; i += 1) {
      const card = strip.querySelector(`[data-podium-slot="${i + 1}"]`);
      const row = rows[i];
      if (!card || !row) continue;
      card.dataset.playerId = row.playerId;
      const nameEl = card.querySelector("[data-podium-name]");
      if (nameEl) nameEl.textContent = row.name;
      const ptsEl = card.querySelector("[data-podium-points]");
      if (ptsEl) ptsEl.textContent = pointsOf(row);
      const gapEl = card.querySelector("[data-podium-gap]");
      if (gapEl) gapEl.textContent = i === 0 ? "LÍDER" : `a ${Math.max(0, leaderPoints - pointsOf(row))} pts`;
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

  // ── DEFINICION SIMULTANEA en /tabla (Estado C/D, SOLO LECTURA) ──────────────────
  // Cuando dos (o mas) finales del mismo grupo se juegan a la misma hora, el hero pasa a modo
  // dual (cards de los partidos + clasificacion viva del grupo) y el panel derecho a una matriz
  // por jugador (Partido A/B + clasificados + Pts en vivo). Se nutre de las MISMAS libs que el
  // ranking: resolveDisplayWindow (presentar), computeGroupSituation (tabla del grupo),
  // buildPointLedger (impacto). Cero formula nueva. N<=1 -> oculto; manda el hero/panel de hoy.
  const heroNormal = section.querySelector("[data-tabla-hero-normal]");
  const simulWindow = section.querySelector("[data-simul-window]");
  const predsNormal = section.querySelector("[data-tabla-preds-normal]");
  const simulPreds = section.querySelector("[data-simul-preds]");
  const simulContent = section.querySelector("[data-simul-content]");
  const simulPredsList = section.querySelector("[data-sp-list]");

  const setHighlightAll = (playerId, on) => {
    if (!playerId) return;
    section
      .querySelectorAll(`[data-player-id="${playerId}"]`)
      .forEach((node) => node.classList.toggle("is-cross-highlight", on));
  };

  const STATE_CHIP = {
    in_definition: "PROVISIONAL",
    pending_close: "LISTO PARA CERRAR",
    final: "DEFINITIVO",
    reopened: "PROVISIONAL",
    pending: "PROVISIONAL",
  };
  const phaseStatus = (phase) => (phase === "live" ? "EN VIVO" : phase === "official" ? "FINAL" : "EN ESPERA");

  // Gatea los vivos a fase "live" (NO contar un 0-0 preparado antes de la hora) antes de pasar
  // a computeGroupSituation para la tabla del grupo: misma proteccion que el sitio publico.
  const gateLiveForGroup = (liveMatches, officialResults, now) =>
    (liveMatches ?? []).filter((p) => {
      if (!p?.matchId) return false;
      const fm = matchById.get(p.matchId);
      if (!fm) return false;
      return (
        resolveLiveMatchPhase({
          liveMatch: { ...p, homeTeamScore: p.homeTeamScore ?? p.homeScore, awayTeamScore: p.awayTeamScore ?? p.awayScore },
          fixtureMatch: fm,
          officialResults,
          now,
        }) === "live"
      );
    });

  const swFlag = (team) => `/assets/flags/${team?.id}.svg`;
  const swCode = (team) => esc(team?.shortCode ?? codeOf(team?.id));

  const swCardHtml = (dm, idx) => {
    const home = dm.homeScore == null ? "–" : dm.homeScore;
    const away = dm.awayScore == null ? "–" : dm.awayScore;
    return `<article class="sw-card" data-phase="${esc(dm.phase)}" data-match-id="${esc(dm.matchId)}">
        <header class="sw-card-head"><span class="sw-card-label">Partido ${String.fromCharCode(65 + idx)}</span><span class="sw-card-status">${phaseStatus(dm.phase)}</span></header>
        <div class="sw-board">
          <div class="sw-team"><span class="sw-flag"><img src="${esc(swFlag(dm.homeTeam))}" alt="" width="160" height="120" loading="lazy" decoding="async"></span><span class="sw-code">${swCode(dm.homeTeam)}</span></div>
          <div class="sw-score"><span class="sw-num">${home}</span><span class="sw-sep">:</span><span class="sw-num">${away}</span></div>
          <div class="sw-team sw-team--away"><span class="sw-code">${swCode(dm.awayTeam)}</span><span class="sw-flag"><img src="${esc(swFlag(dm.awayTeam))}" alt="" width="160" height="120" loading="lazy" decoding="async"></span></div>
        </div>
        <p class="sw-stadium">${esc(dm.location || "")}</p>
      </article>`;
  };

  const swStandingsHtml = (groupId, gatedLive, officialResults) => {
    const group = groupById.get(groupId);
    if (!group) return "";
    const sit = computeGroupSituation(groupId, { group, fixture: matches, official: officialResults, live: gatedLive });
    const standings = Array.isArray(sit.standings) ? sit.standings : [];
    const body = standings
      .map((r, i) => {
        const id = r.teamId ?? r.id;
        const qualify = id === sit.first ? "first" : id === sit.second ? "second" : "out";
        const badge = qualify === "first" ? "1º" : qualify === "second" ? "2º" : "";
        const name = r.name ?? teamById.get(id)?.name ?? id ?? "—";
        const dg = Number(r.goalDifference ?? 0);
        return `<tr class="sw-st-row" data-qualify="${qualify}">
            <td class="sw-st-pos">${i + 1}<span class="sw-st-badge">${badge}</span></td>
            <td class="sw-st-team">${esc(name)}</td>
            <td>${Number(r.played ?? 0)}</td>
            <td>${dg > 0 ? "+" : ""}${dg}</td>
            <td class="sw-st-pts">${Number(r.points ?? 0)}</td>
          </tr>`;
      })
      .join("");
    return `<section class="sw-standings">
        <header class="sw-st-head"><span class="sw-st-group">Grupo ${esc(groupId)}</span><span class="sw-st-chip" data-state="${esc(sit.state)}">${esc(STATE_CHIP[sit.state] ?? "PROVISIONAL")}</span></header>
        <table class="sw-st-table"><thead><tr><th>Pos</th><th>Equipo</th><th>PJ</th><th>DG</th><th>PTS</th></tr></thead><tbody>${body}</tbody></table>
      </section>`;
  };

  const renderSimultaneousWindow = (dw, gatedLive, officialResults) => {
    if (!simulContent) return;
    simulContent.innerHTML = dw.groupIds
      .map((groupId) => {
        const groupMatches = dw.byGroup[groupId] ?? [];
        const cards = groupMatches.map((dm, idx) => swCardHtml(dm, idx)).join("");
        return `<div class="sw-group"><div class="sw-matches" data-count="${groupMatches.length}">${cards}</div>${swStandingsHtml(groupId, gatedLive, officialResults)}</div>`;
      })
      .join("");
    const label = section.querySelector("[data-simul-window-label]");
    if (label) {
      const anyLive = dw.matches.some((m) => m.phase === "live");
      const allOfficial = dw.matches.every((m) => m.phase === "official");
      const grp = dw.groupIds.length === 1 ? `Grupo ${dw.groupIds[0]}` : `${dw.groupIds.length} grupos`;
      const state = allOfficial ? "RESULTADO PARCIAL" : anyLive ? "EN VIVO" : "EN ESPERA";
      label.textContent = `${grp} · ${state} · dos partidos a la vez`;
    }
  };

  const renderSimultaneousMatrix = (dw, predictions, ledger) => {
    if (!simulPredsList) return;
    const anchorMatches = dw.byGroup[dw.anchorGroupId] ?? dw.matches.slice(0, 2);
    const matchA = anchorMatches[0] ?? null;
    const matchB = anchorMatches[1] ?? null;
    const la = section.querySelector("[data-sp-label-a]");
    const lb = section.querySelector("[data-sp-label-b]");
    if (la) la.textContent = matchA ? `A · ${swCode(matchA.homeTeam)}-${swCode(matchA.awayTeam)}` : "Partido A";
    if (lb) lb.textContent = matchB ? `B · ${swCode(matchB.homeTeam)}-${swCode(matchB.awayTeam)}` : "Partido B";

    const predBy = new Map(predictions.map((p) => [`${p.playerId}:${p.matchId}`, p]));
    const predCell = (pid, matchId) => {
      const p = matchId ? predBy.get(`${pid}:${matchId}`) : null;
      const has = p && Number.isInteger(p.homeScore) && Number.isInteger(p.awayScore);
      return `<span class="sp-chip" data-empty="${has ? "false" : "true"}">${has ? `${p.homeScore}-${p.awayScore}` : "—"}</span>`;
    };
    const grp = dw.anchorGroupId;
    const qpBy = new Map();
    for (const q of qualifiedPredictions) {
      if (q.groupId !== grp) continue;
      qpBy.set(`${q.playerId}:${q.position}`, q.teamId);
    }

    const rows = players
      .map((player) => {
        const pid = player.id;
        const me = ledger.byPlayer[pid] ?? { official: 0, projected: 0, lines: [] };
        // "Pts en vivo" = impacto PROVISIONAL de ESTA ventana (no el total del jugador): solo lo
        // provisional de los partidos del par + el bono provisional del grupo ancla. Asi el
        // headline cuadra EXACTO con el desglose A/B/CLAS (lo banqueado oficial no es "vivo").
        const impact = windowImpactForPlayer(me.lines ?? [], {
          matchAId: matchA?.matchId,
          matchBId: matchB?.matchId,
          groupId: grp,
        });
        const c1 = codeOf(qpBy.get(`${pid}:1`));
        const c2 = codeOf(qpBy.get(`${pid}:2`));
        return {
          pid,
          name: player.name,
          avatar: avatarById.get(pid) ?? "",
          delta: impact.total,
          aPts: impact.a,
          bPts: impact.b,
          clasPts: impact.clas,
          c1,
          c2,
        };
      })
      .sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));

    simulPredsList.innerHTML = rows
      .map((r) => {
        const trend = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "flat";
        return `<article class="sp-row" data-player-prediction-row data-player-id="${esc(r.pid)}">
            <div class="sp-player"><span class="sp-avatar"><img src="${esc(r.avatar)}" alt="" width="120" height="120" loading="lazy" decoding="async"></span><strong class="sp-name">${esc(r.name)}</strong></div>
            ${predCell(r.pid, matchA?.matchId)}
            ${predCell(r.pid, matchB?.matchId)}
            <span class="sp-clasif" title="1o ${esc(r.c1)} / 2o ${esc(r.c2)}">${esc(r.c1)} / ${esc(r.c2)}</span>
            <div class="sp-live" data-trend="${trend}"><strong class="sp-live-num">${fmtSigned(r.delta)}</strong><small class="sp-live-break">A ${fmtSigned(r.aPts)} · B ${fmtSigned(r.bPts)} · CLAS ${fmtSigned(r.clasPts)}</small></div>
          </article>`;
      })
      .join("");
  };

  const toggleSimultaneousMode = (on) => {
    if (heroNormal) heroNormal.hidden = on;
    if (simulWindow) simulWindow.hidden = !on;
    if (predsNormal) predsNormal.hidden = on;
    if (simulPreds) simulPreds.hidden = !on;
  };

  // Cross-highlight de la matriz (nodos en runtime): delegacion en el contenedor.
  if (simulPredsList) {
    const over = (e) => {
      const r = e.target instanceof Element ? e.target.closest("[data-player-id]") : null;
      if (r) setHighlightAll(r.dataset.playerId, true);
    };
    const out = (e) => {
      const r = e.target instanceof Element ? e.target.closest("[data-player-id]") : null;
      if (r) setHighlightAll(r.dataset.playerId, false);
    };
    simulPredsList.addEventListener("mouseover", over);
    simulPredsList.addEventListener("mouseout", out);
    simulPredsList.addEventListener("focusin", over);
    simulPredsList.addEventListener("focusout", out);
  }

  // ── Pipeline marcador en vivo -> tabla ──────────────────────────────────
  // La tabla SSR ya sale calculada con predictions.json. Solo recalculamos
  // cuando hay marcador en vivo, oficiales o un partido preparado que mostrar
  // (asi no se reordena tras el primer paint sin motivo = sin flash). El
  // marcador del admin llega por subscribeLiveData: Supabase Realtime como
  // fuente compartida y localStorage/eventos como cache local. El tri-estado
  // official/live/pending se resuelve en lib/liveMatch/liveMatchPhase.js:
  // solo "live" puntua; "pending" re-apunta las cards y el panel
  // (EN ESPERA, 0 puntos) sin mover el ranking.

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
    const liveMatch = matchById.get(liveMatchId);
    const liveStart = liveMatch ? new Date(liveMatch.dateUtc).getTime() : -Infinity;
    const next = [...matches]
      .sort(byKickoff)
      .find((m) => m.id !== liveMatchId && !finalized.has(m.id) && new Date(m.dateUtc).getTime() >= liveStart);
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
      .sort(byKickoff)
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

  // ── F7 Nivel 2: formula expandible por jugador ──────────────────────────────
  // El detalle se arma SOLO desde el libro (ledger.byPlayer[id].lines): cero formula
  // de puntaje en la UI; aqui solo se mapea regla -> etiqueta/color y se contextualiza.
  const MATCH_TYPE = {
    lone_wolf: { label: "LONE WOLF", token: "lone_wolf" },
    exact_shared: { label: "EXACTO", token: "exact_shared" },
    tendency: { label: "TENDENCIA", token: "tendency" },
    none: { label: "SIN PUNTOS", token: "none" },
  };
  const GROUP_TYPE = {
    group_first: { label: "ACIERTA 1o", token: "group_first" },
    group_second: { label: "ACIERTA 2o", token: "group_second" },
    group_miss: { label: "NO COINCIDE", token: "group_miss" },
  };
  const fmtSigned = (n) => (Number(n) > 0 ? `+${n}` : String(n));
  const codeOf = (teamId) => teamById.get(teamId)?.shortCode ?? (teamId ? String(teamId).toUpperCase() : "—");
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let detailState = null;
  let openDetailPlayerId = null;

  const groupSituation = (groupId) => {
    if (!detailState) return { first: null, second: null };
    if (detailState.sitCache.has(groupId)) return detailState.sitCache.get(groupId);
    const sit = computeGroupSituation(groupId, {
      group: groupById.get(groupId),
      fixture: matches,
      official: detailState.official,
      live: detailState.live,
    });
    detailState.sitCache.set(groupId, sit);
    return sit;
  };

  const buildDetailHtml = (playerId) => {
    const me = detailState?.byPlayer?.[playerId];
    if (!me) return "";
    const lines = me.lines ?? [];
    const matchLines = lines.filter((l) => l.origen === "match" && l.estado !== "anulado");
    const groupLines = lines.filter((l) => l.origen === "group" && l.estado !== "anulado");
    const variacion = me.projected - me.official;
    const predFor = (matchId) =>
      (detailState.predictions ?? []).find((p) => p.playerId === playerId && p.matchId === matchId) ?? null;

    const rows = [];
    rows.push(
      `<tr class="rd-base"><td class="rd-var">Puntaje oficial</td><td class="rd-pred"></td><td class="rd-now"></td><td class="rd-type"></td><td class="rd-pts">${me.official}</td></tr>`
    );
    matchLines.forEach((l) => {
      const m = matchById.get(l.evento);
      const meta = MATCH_TYPE[l.regla] ?? MATCH_TYPE.none;
      const pred = predFor(l.evento);
      const eff = detailState.effByMatch.get(l.evento) ?? null;
      const matchup = m ? `${codeOf(m.homeTeam?.id)}-${codeOf(m.awayTeam?.id)}` : l.evento;
      rows.push(
        `<tr><td class="rd-var">${esc(matchup)}</td>` +
          `<td class="rd-pred">${pred ? `${pred.homeScore}-${pred.awayScore}` : "—"}</td>` +
          `<td class="rd-now">${eff ? `${eff.homeScore}-${eff.awayScore}` : "—"}</td>` +
          `<td class="rd-type" data-token="${meta.token}">${meta.label}</td>` +
          `<td class="rd-pts">${fmtSigned(l.puntos)}</td></tr>`
      );
    });
    groupLines.forEach((l) => {
      const meta = GROUP_TYPE[l.regla] ?? GROUP_TYPE.group_miss;
      const pos = l.evento === "first" ? 1 : 2;
      const predicted = (qualifiedPredictions.find(
        (q) => q.playerId === playerId && q.groupId === l.group && q.position === pos
      ) ?? {}).teamId ?? null;
      const sit = groupSituation(l.group);
      const current = pos === 1 ? sit.first : sit.second;
      rows.push(
        `<tr><td class="rd-var"><span class="rd-badge" data-pos="${pos}">${pos}o</span> Grupo ${esc(l.group)}</td>` +
          `<td class="rd-pred">${esc(codeOf(predicted))}</td>` +
          `<td class="rd-now">${esc(codeOf(current))}</td>` +
          `<td class="rd-type" data-token="${meta.token}">${meta.label}</td>` +
          `<td class="rd-pts">${fmtSigned(l.puntos)}</td></tr>`
      );
    });

    const matchSum = matchLines.reduce((s, l) => s + l.puntos, 0);
    const groupSum = groupLines.reduce((s, l) => s + l.puntos, 0);
    const groupMissPicked = groupLines.some(
      (l) =>
        l.regla === "group_miss" &&
        qualifiedPredictions.some(
          (q) => q.playerId === playerId && q.groupId === l.group && q.position === (l.evento === "first" ? 1 : 2)
        )
    );
    let frase;
    if (variacion === 0) frase = "Sin cambios en vivo todavia.";
    else if (matchSum > 0 && groupSum > 0)
      frase = `Suma +${matchSum} por los marcadores y +${groupSum} por sus clasificados.`;
    else if (matchSum > 0 && groupSum === 0 && groupMissPicked)
      frase = `Gana +${matchSum} en los partidos, pero su clasificado del grupo aun no coincide: neto ${fmtSigned(variacion)}.`;
    else if (matchSum > 0) frase = `Suma +${matchSum} por los marcadores en vivo.`;
    else frase = `Suma +${groupSum} por sus clasificados 1o/2o.`;

    return (
      `<div class="rank-detail-inner">` +
      `<table class="rd-table"><tbody>${rows.join("")}</tbody></table>` +
      `<p class="rd-foot"><span>${me.official} oficial ${variacion >= 0 ? "+" : "-"} ${Math.abs(variacion)} en vivo =</span> <strong>${me.projected} proyectado</strong></p>` +
      `<p class="rd-why">${esc(frase)}</p>` +
      `</div>`
    );
  };

  const closeOpenDetail = () => {
    const prev = section.querySelector("[data-rank-detail]");
    if (prev) prev.remove();
    if (openDetailPlayerId) {
      const prevRow = section.querySelector(`[data-ranking-row][data-player-id="${openDetailPlayerId}"]`);
      if (prevRow) prevRow.setAttribute("aria-expanded", "false");
    }
    openDetailPlayerId = null;
  };

  const openDetail = (rowNode, playerId) => {
    const html = buildDetailHtml(playerId);
    if (!html) return;
    const tr = document.createElement("tr");
    tr.className = "rank-detail-row";
    tr.dataset.rankDetail = "";
    tr.dataset.playerId = playerId;
    const td = document.createElement("td");
    td.colSpan = rowNode.children.length || 10;
    td.innerHTML = html;
    tr.append(td);
    rowNode.after(tr);
    rowNode.setAttribute("aria-expanded", "true");
    openDetailPlayerId = playerId;
  };

  const toggleDetail = (rowNode) => {
    const playerId = rowNode.dataset.playerId;
    if (!playerId) return;
    const wasOpen = openDetailPlayerId === playerId;
    closeOpenDetail();
    if (!wasOpen) openDetail(rowNode, playerId);
  };

  const wireRowToggles = () => {
    const body = section.querySelector("[data-ranking-body]");
    if (!body) return;
    body.addEventListener("click", (event) => {
      const row = event.target instanceof Element ? event.target.closest("[data-ranking-row]") : null;
      if (!row || !body.contains(row)) return;
      toggleDetail(row);
    });
    body.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target instanceof Element ? event.target.closest("[data-ranking-row]") : null;
      if (!row || row !== event.target) return;
      event.preventDefault();
      toggleDetail(row);
    });
  };

  const recompute = (snapshot = {}) => {
    if (!scoring) return; // sin el modulo de calculo, no tocamos el SSR

    const officialResults = snapshot.officialResults ?? [];
    const liveMatch = snapshot.liveMatch ?? null; // legado (el mas nuevo): hero card + panel + proximo
    // F7 paso A: el RANKING cuenta TODOS los marcadores en vivo (no solo el ultimo).
    const liveMatches = Array.isArray(snapshot.liveMatches)
      ? snapshot.liveMatches
      : liveMatch
        ? [liveMatch]
        : [];
    const now = Date.now();

    // F1 es el unico que gatea fase y mapea *TeamScore->*Score, para TODOS los vivos.
    const win = resolveActiveWindow({ fixture: matches, official: officialResults, live: liveMatches, now });
    const { byMatch } = resolveEffectiveResults({ official: officialResults, window: win });
    const byMatchIds = new Set(byMatch.keys());

    const official = officialToResults(officialResults);
    const officialIds = new Set(official.map((r) => r.matchId));

    // Hero card / panel / proximo: siguen con el marcador legado (un solo vivo).
    const legacyPhase = resolveLiveMatchPhase({
      liveMatch,
      fixtureMatch: matchById.get(resolveLiveMatchId(liveMatch)) ?? null,
      officialResults,
    });
    const legacyLive = legacyPhase === "live" ? liveToResult(liveMatch) : null;
    const legacyLiveActive = Boolean(legacyLive) && !officialIds.has(legacyLive.matchId);
    const pendingMatch = legacyLiveActive ? null : resolvePendingDisplayMatch(liveMatch, officialIds);

    // Nada que sobreponer: respetar el SSR, salvo un partido pendiente que mostrar sin puntuar.
    if (byMatchIds.size === 0 && official.length === 0 && !pendingMatch) {
      return;
    }

    const predictions = mergeLocalPredictions();
    // Resultados efectivos = baseline (results.json) sobrescrito por oficiales + TODOS los vivos.
    const liveAndOfficial = Array.from(byMatch.values()).map((r) => ({
      matchId: r.matchId,
      status: "finished",
      homeScore: r.homeScore,
      awayScore: r.awayScore,
    }));
    const effectiveResults = [...results.filter((r) => !byMatchIds.has(r.matchId)), ...liveAndOfficial];
    // Base sin vivo (solo oficiales) para las flechas.
    const baseResults = [...results.filter((r) => !officialIds.has(r.matchId)), ...official];

    // Stats de PARTIDO (PJ/exactos/racha/rendimiento/DG + puntaje de partido), como hoy.
    let rows = calculateStandings(predictions, effectiveResults);

    // F7 paso B: total PROYECTADO + delta desde el libro contable. El bono de grupo YA
    // viene gateado por la fundacion (grupos bloqueados aportan 0); aqui NO se re-filtra.
    const ledger = buildPointLedger({
      players,
      predictions,
      qualifiedPredictions,
      groups,
      fixture: matches,
      official: officialResults,
      live: liveMatches,
      window: win,
      now,
    });
    // Estado para la formula expandible (Nivel 2): se lee al abrir una fila.
    detailState = {
      byPlayer: ledger.byPlayer,
      predictions,
      official: officialResults,
      live: liveMatches,
      effByMatch: byMatch,
      sitCache: new Map(),
    };
    const ledgerFor = (id) => ledger.byPlayer[id] ?? { official: 0, projected: 0, lines: [] };
    rows = rows.map((row) => {
      const l = ledgerFor(row.playerId);
      return { ...row, official: l.official, projected: l.projected, delta: l.projected - l.official, lines: l.lines };
    });
    const hasProjection = rows.some((row) => row.delta !== 0);

    // Orden por proyectado, con los mismos desempates de hoy (rendimiento, DG, nombre).
    // Sin bono ni vivo, projected == points -> orden IDENTICO al de hoy.
    const byProjected = (a, b) =>
      b.projected - a.projected ||
      b.performance - a.performance ||
      b.goalDifference - a.goalDifference ||
      a.name.localeCompare(b.name);
    rows.sort(byProjected);

    if (hasProjection) {
      // Flechas = posicion PROYECTADA vs posicion OFICIAL (plano oficial = ledger.official).
      const officialOrder = [...rows].sort(
        (a, b) =>
          b.official - a.official ||
          b.performance - a.performance ||
          b.goalDifference - a.goalDifference ||
          a.name.localeCompare(b.name)
      );
      const officialPos = new Map(officialOrder.map((row, index) => [row.playerId, index + 1]));
      rows = rows.map((row, index) => ({
        ...row,
        position: index + 1,
        movement: calculateMovement(index + 1, officialPos.get(row.playerId)),
      }));
    } else {
      // Sin proyeccion (sin vivo): mismo orden y flechas que hoy (vs previousPositions).
      rows = rows.map((row, index) => ({ ...row, position: index + 1 }));
    }
    // El detalle abierto sobrevive al re-render (se recrea con datos frescos).
    const reopenPid = openDetailPlayerId;
    closeOpenDetail();
    renderRanking(rows);
    renderPodium(rows);
    if (reopenPid) {
      const rowNode = section.querySelector(`[data-ranking-row][data-player-id="${reopenPid}"]`);
      if (rowNode) openDetail(rowNode, reopenPid);
    }

    const displayMatchId = legacyLiveActive ? legacyLive.matchId : pendingMatch?.id ?? currentMatchId;

    // DEFINICION SIMULTANEA: si el partido actual tiene su par del grupo a la misma hora, el
    // hero pasa a modo dual + la matriz de predicciones. Con N<=1 el flujo de siempre.
    const displayWindow = resolveDisplayWindow({
      fixture: matches,
      official: officialResults,
      live: liveMatches,
      anchorMatchId: displayMatchId,
      now,
    });
    toggleSimultaneousMode(displayWindow.isSimultaneous);

    if (displayWindow.isSimultaneous) {
      const gatedLive = gateLiveForGroup(liveMatches, officialResults, now);
      renderSimultaneousWindow(displayWindow, gatedLive, officialResults);
      renderSimultaneousMatrix(displayWindow, predictions, ledger);
    } else {
      renderAccuracy(calculateAccuracy(predictions, displayMatchId, effectiveResults));
      if (legacyLiveActive) {
        updateLiveMatchCard(liveMatch, matchById.get(legacyLive.matchId), { isLive: true });
        updateNextMatchCard(legacyLive.matchId, officialResults);
      } else if (pendingMatch) {
        updateLiveMatchCard(liveMatch, pendingMatch, { isLive: false });
        updateNextMatchCardDirect(pendingMatch);
      }
    }
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
  wireRowToggles();

  subscribeLiveData(recompute);
})();
