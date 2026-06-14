// Carrera de Puntaje — relato automatico ("Lo que paso en la oficina").
//
// Builder puro sobre el timeline de buildScoreRaceTimeline. Solo produce frases
// respaldadas por datos reales (plantillas del comanda §6); si no hay evento
// notable, devuelve una frase neutra. Sin DOM, sin dependencias.

function leaderAt(players, i) {
  return players.find((p) => p.totals[i]?.rankAfterMatch === 1) ?? null;
}

// Indice del ultimo partido <= i donde el jugador sumo puntos (o -1).
function lastScoredIndex(player, i) {
  for (let j = i; j >= 0; j -= 1) {
    if (player.totals[j]?.pointsEarned > 0) return j;
  }
  return -1;
}

function matchNarrative(timeline, i) {
  const { matches, players } = timeline;
  const m = matches[i];
  const events = [];

  // Lone Wolf (prioridad maxima).
  for (const p of players) {
    if (p.totals[i]?.hitType === "lone_wolf") {
      events.push({ priority: 5, text: `${p.displayName} sacó un Lone Wolf y rompió el gráfico con +5.` });
    }
  }

  // Nuevo lider.
  const leader = leaderAt(players, i);
  const prevLeader = i > 0 ? leaderAt(players, i - 1) : null;
  if (leader && i > 0 && (!prevLeader || prevLeader.playerId !== leader.playerId)) {
    events.push({ priority: 4, text: `${leader.displayName} tomó la punta después del partido ${m.displayNumber ?? m.matchNumber}.` });
  } else if (leader && i === 0) {
    events.push({ priority: 2, text: `${leader.displayName} arranca arriba la carrera.` });
  }

  // Salto fuerte: mayor +puntos del partido que ademas subio puestos.
  let topJump = null;
  for (const p of players) {
    const t = p.totals[i];
    if (t.pointsEarned > 0 && (!topJump || t.pointsEarned > topJump.pts)) {
      const prevRank = i > 0 ? p.totals[i - 1].rankAfterMatch : null;
      const climbed = prevRank != null ? prevRank - t.rankAfterMatch : 0;
      topJump = { name: p.displayName, pts: t.pointsEarned, climbed };
    }
  }
  if (topJump && topJump.climbed > 0) {
    events.push({
      priority: 3,
      text: `${topJump.name} pegó el salto de la fecha: sumó +${topJump.pts} y subió ${topJump.climbed} ${topJump.climbed === 1 ? "puesto" : "puestos"}.`,
    });
  }

  // Partido seco: nadie sumo.
  const nobodyScored = players.length > 0 && players.every((p) => p.totals[i].pointsEarned === 0);
  if (nobodyScored) {
    events.push({ priority: 3, text: "Partido seco para la oficina: nadie encontró el golpe exacto." });
  }

  // Grupo apretado: >=3 jugadores dentro de 2 puntos del lider.
  if (leader) {
    const leaderCum = leader.totals[i].cumulativePoints;
    const close = players.filter((p) => leaderCum - p.totals[i].cumulativePoints <= 2);
    if (close.length >= 3) {
      const minCum = Math.min(...close.map((p) => p.totals[i].cumulativePoints));
      const gap = leaderCum - minCum;
      events.push({
        priority: 2,
        text: `Hay ${close.length} jugadores separados por ${gap} ${gap === 1 ? "punto" : "puntos"}. La tabla está hirviendo.`,
      });
    }
  }

  // Lider que no suma.
  if (leader && leader.totals[i].pointsEarned === 0) {
    const last = lastScoredIndex(leader, i);
    if (last >= 0 && i - last >= 2) {
      events.push({
        priority: 1,
        text: `${leader.displayName} sigue arriba, pero no marca desde el partido ${matches[last].displayNumber ?? matches[last].matchNumber}.`,
      });
    }
  }

  events.sort((a, b) => b.priority - a.priority);
  const picked = events.slice(0, 2);
  const body = picked.length
    ? picked.map((e) => e.text).join(" ")
    : "La oficina se movió poco tras este partido.";

  return {
    matchId: m.matchId,
    matchNumber: m.matchNumber,
    status: m.status,
    title: `Partido ${m.displayNumberLabel ?? m.matchNumberLabel} · ${m.label}`,
    body,
    highlights: picked.map((e) => e.text),
  };
}

function playerNarrative(timeline, player) {
  const n = timeline.players.length;
  const totals = player.totals;
  if (!totals.length) {
    return { playerId: player.playerId, title: player.displayName, body: "Sin partidos oficiales todavía." };
  }
  const sentences = [];
  const first = totals[0];
  if (first.pointsEarned > 0) {
    sentences.push(`Partió con ${first.pointsEarned} ${first.pointsEarned === 1 ? "punto" : "puntos"} en el primer partido.`);
  } else {
    sentences.push("Arrancó sin sumar en el primer partido.");
  }

  // Racha seca actual (partidos finales consecutivos sin sumar).
  let dry = 0;
  for (let j = totals.length - 1; j >= 0; j -= 1) {
    if (totals[j].pointsEarned === 0) dry += 1;
    else break;
  }
  const last = totals[totals.length - 1];
  if (dry >= 2) {
    sentences.push(`Lleva ${dry} partidos sin marcar.`);
  } else if (last.pointsEarned > 0) {
    sentences.push(`Viene de sumar +${last.pointsEarned} en el último.`);
  }

  const rank = last.rankAfterMatch;
  if (rank === 1) sentences.push("Hoy lidera la carrera.");
  else if (rank <= 3) sentences.push(`Hoy va ${rank}º, peleando arriba.`);
  else sentences.push(`Hoy va ${rank}º de ${n}.`);

  return { playerId: player.playerId, title: player.displayName, body: sentences.join(" ") };
}

export function buildScoreRaceNarrative(timeline) {
  if (!timeline || !Array.isArray(timeline.matches) || timeline.matches.length === 0) {
    return { matchNarratives: [], playerNarratives: {} };
  }
  const matchNarratives = timeline.matches.map((_, i) => matchNarrative(timeline, i));
  const playerNarratives = {};
  for (const player of timeline.players) {
    playerNarratives[player.playerId] = playerNarrative(timeline, player);
  }
  return { matchNarratives, playerNarratives };
}
