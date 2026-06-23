import players from "../../data/players.json";
import fixture from "../../data/fixture.json";
import groups from "../../data/groups.json";
import teams from "../../data/teams.json";
import predictionsData from "../../data/predictions.json";
import { ensurePollaStorageVersion } from "../../lib/storage/resetPollaState.js";
// F9: clasificacion 1o/2o por grupo. Bonos + estado del grupo salen de la
// fundacion (cero formula nueva en la UI); el gatillo del bono (>=1 final de 3a
// fecha) ya esta en isGroupDefinitionStarted, no se re-gatea aqui.
import { buildGroupBonuses } from "../../lib/scoring/groupBonuses.js";
import {
  computeGroupSituation,
  isGroupDefinitionStarted,
  GROUP_STATE,
} from "../../lib/fixture/groupState.js";
import { resolveActiveWindow } from "../../lib/liveMatch/activeWindow.js";
import {
  buildCommunityAnalysis,
  getOutcome,
  mergeLocalPlayer,
} from "../../lib/statistics/communityStatistics.js";
import { calculatePointsForPrediction } from "../../lib/liveMatch/liveScoring.js";
import { buildMatchSequence, padLabel } from "../../lib/fixture/matchSequence.js";
import { subscribeLiveData } from "../../lib/liveMatch/liveMatchState.js";
import { resolveLiveMatchPhase } from "../../lib/liveMatch/liveMatchPhase.js";
import { isStatisticsUnlocked } from "../../lib/predictions/predictionAccess.js";
import { createScoreRace } from "./score-race.client.js";

(() => {
  const section = document.querySelector('[data-section="estadisticas"]');
  if (!section) return;

  ensurePollaStorageVersion?.();

  const payloadNode = section.querySelector("[data-estadisticas-payload]");
  const payload = (() => {
    try {
      return payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
    } catch {
      return {};
    }
  })();
  const TOTAL = Number(payload.totalPredictions) || 72;
  const TARGET = payload.targetRoute || "/predicciones";
  const DATASET_URL = payload.datasetUrl || "/data/community-predictions.json";
  const playerById = new Map(players.map((player) => [player.id, player]));
  const matchById = new Map(fixture.matches.map((match) => [match.id, match]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  // F9: picks de clasificacion 1o/2o por jugador/grupo. El pick existe SIEMPRE
  // (se muestra incluso en grupos bloqueados); lo que se gatea es el puntaje.
  const qualifiedPredictions = predictionsData.qualifiedPredictions ?? [];
  // Numero correlativo cronologico (1..N) para mostrar en la lista y el detalle,
  // en vez del matchNumber FIFA (que mezcla grupos por horario).
  const sequenceById = buildMatchSequence(fixture.matches);
  const displayLabelFor = (matchId, fallback) =>
    padLabel(sequenceById.get(matchId) ?? fallback);

  const state = {
    activeTab: "grafico",
    selectedMatchId: "match-004",
    matchGroup: "all",
    consensus: "all",
    comparePlayerId: null,
    analysis: null,
    dataset: null,
    selectedPlayerId: null,
    // F9: jugador mostrado en la pestana Clasificacion (selector propio del panel;
    // arranca en la identidad local y se puede cambiar sin tocar la identidad).
    groupPlayerId: null,
    // F9: firma del ultimo snapshot rendido (memo para no re-pintar sin cambios).
    groupsSignature: null,
    liveSnapshot: { liveMatch: null, officialResults: [] },
  };

  // Instancia del gráfico "Carrera de Puntaje" (pestaña GRÁFICO). Se crea al
  // desbloquear y se alimenta con {dataset, liveSnapshot} en cada snapshot.
  let scoreRace = null;

  const safeRead = (storage, key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const parseJson = (raw, fallback) => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const formatPercent = (value, total) =>
    total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
  const outcomeLabel = (outcome) =>
    outcome === "home" ? "Gana local" : outcome === "away" ? "Gana visita" : "Empate";
  const consensusLabel = (level) =>
    ({
      unanimous: "Unánime",
      strong: "Consenso fuerte",
      open: "Abierto",
      divided: "Completamente dividido",
    })[level] ?? "Abierto";

  const getLocalPlayerId = () => safeRead(window.localStorage, "polla:selectedPlayerId");
  const getLocalPredictions = (playerId) => {
    const store = parseJson(safeRead(window.localStorage, "polla:predictions"), {});
    return store?.[playerId] ?? null;
  };
  const getLocalQualified = (playerId) => {
    const store = parseJson(safeRead(window.localStorage, "polla:qualifiedPredictions"), {});
    return store?.[playerId] ?? null;
  };

  const clearStoredIdentity = () => {
    ["polla:selectedPlayerId", "polla:playerConfirmed", "polla:selectedPlayerSnapshot"].forEach(
      (key) => {
        try {
          window.localStorage.removeItem(key);
        } catch {}
        try {
          window.sessionStorage.removeItem(key);
        } catch {}
      }
    );
  };

  const computeSnapshot = () => {
    const rawPlayerId = getLocalPlayerId();
    // Nomina cerrada: una identidad que ya no existe en players.json es un
    // jugador eliminado; se limpia para no dejar un fantasma bloqueando todo.
    if (rawPlayerId && !playerById.has(rawPlayerId)) {
      clearStoredIdentity();
    }
    const playerId = rawPlayerId && playerById.has(rawPlayerId) ? rawPlayerId : null;
    const bucket = getLocalPredictions(playerId);
    if (!playerId) {
      // Identidad faltante: estado propio, distinto de "locked" (que significa
      // predicciones incompletas). Aqui no hay 0/72 real que mostrar.
      return { playerId: null, completed: 0, total: TOTAL, percent: 0, state: "no-identity" };
    }
    const completed = Object.values(bucket ?? {}).filter(
      (record) => record && record.status === "complete"
    ).length;
    const safeCompleted = Math.min(completed, TOTAL);
    const unlocked = isStatisticsUnlocked({
      playerId,
      confirmedPlayerIds: payload.confirmedPlayerIds ?? [],
      localPredictions: bucket,
      totalMatches: TOTAL,
    });
    return {
      playerId,
      completed: unlocked ? TOTAL : safeCompleted,
      total: TOTAL,
      percent: unlocked
        ? 100
        : TOTAL > 0
          ? Math.round((safeCompleted / TOTAL) * 100)
          : 0,
      state: unlocked ? "unlocked" : "locked",
      official: (payload.confirmedPlayerIds ?? []).includes(playerId),
    };
  };

  const setText = (selector, value) => {
    const node = section.querySelector(selector);
    if (node) node.textContent = String(value);
  };

  const applySnapshot = (snapshot) => {
    section.dataset.state = snapshot.state;
    state.selectedPlayerId = snapshot.playerId;
    const noIdentity = snapshot.state === "no-identity";
    setText("[data-progress-completed]", snapshot.completed);
    setText("[data-progress-total]", snapshot.total);
    setText("[data-progress-percent]", `${snapshot.percent}%`);

    const bar = section.querySelector("[data-progress-bar]");
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = `${snapshot.percent}%`;
      void bar.offsetWidth;
      bar.style.transition = "";
    }
    const card = section.querySelector("[data-progress-card]");
    if (card) card.dataset.state = snapshot.state;
    const noIdentityNote = section.querySelector("[data-no-identity-note]");
    if (noIdentityNote) noIdentityNote.hidden = !noIdentity;
    setText(
      "[data-cta-label]",
      snapshot.state === "unlocked"
        ? "VER ESTADÍSTICAS COMPLETAS"
        : noIdentity
          ? "ELEGIR MI JUGADOR"
          : "IR A PREDICCIONES"
    );
    const primaryCta = section.querySelector("[data-primary-cta]");
    if (primaryCta) {
      primaryCta.setAttribute("href", noIdentity ? "/jugador" : TARGET);
    }
    setText(
      "[data-progress-helper]",
      snapshot.state === "unlocked"
        ? snapshot.official
          ? "Tu cartón oficial está confirmado. El Data Center está activo en este dispositivo."
          : "Ya completaste tus 72 predicciones. El Data Center está activo."
        : noIdentity
          ? "Las estadísticas funcionan solo si sabemos quién eres. Elige tu jugador y vuelve acá."
          : "Cada predicción confirmada te acerca a desbloquear todas las estadísticas."
    );

    // Identidad faltante != Data Center bloqueado: son estados distintos y el
    // hero debe decirlo con otro mensaje (no es falta de predicciones).
    if (noIdentity) {
      setText("[data-locked-eyebrow-label]", "IDENTIDAD NO DETECTADA");
      setText(
        "[data-locked-subtitle]",
        "Este dispositivo no sabe quién eres. Elige tu jugador para abrir tus estadísticas."
      );
    }

    const banner = section.querySelector("[data-unlocked-banner]");
    if (banner) banner.hidden = snapshot.state !== "unlocked";
    const lockedContent = section.querySelector("[data-locked-content]");
    if (lockedContent) lockedContent.hidden = snapshot.state === "unlocked";
    const dashboard = section.querySelector("[data-stats-dashboard]");
    if (dashboard) dashboard.hidden = snapshot.state !== "unlocked";
    // Data Arena + intro de detalle: misma puerta de desbloqueo.
    section.querySelectorAll("[data-unlock-reveal]").forEach((node) => {
      node.hidden = snapshot.state !== "unlocked";
    });
  };

  // --- Modal de identidad faltante -----------------------------------------
  const identityModal = section.querySelector("[data-missing-identity-modal]");
  const identityDialog = section.querySelector("[data-missing-identity-dialog]");
  let identityModalTrigger = null;

  const getFocusable = (root) =>
    Array.from(
      root?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter((node) => !node.hidden);

  const openMissingIdentityModal = () => {
    if (!identityModal) return;
    identityModalTrigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    identityModal.hidden = false;
    window.requestAnimationFrame(() => {
      const first = getFocusable(identityDialog)[0];
      (first || identityDialog)?.focus?.();
    });
  };

  const closeMissingIdentityModal = () => {
    if (!identityModal) return;
    identityModal.hidden = true;
    identityModalTrigger?.focus?.();
  };

  const wireMissingIdentityModal = () => {
    if (!identityModal) return;
    identityModal.querySelectorAll("[data-missing-identity-close]").forEach((button) => {
      button.addEventListener("click", closeMissingIdentityModal);
    });
    identityModal.querySelector("[data-missing-identity-cta]")?.addEventListener("click", () => {
      try {
        window.sessionStorage.setItem("polla:returnAfterPlayerSelect", "/estadisticas");
      } catch {}
    });
    document.addEventListener("keydown", (event) => {
      if (!identityModal || identityModal.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeMissingIdentityModal();
        return;
      }
      if (event.key === "Tab") {
        const focusable = getFocusable(identityDialog);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  };

  const setStatus = (message) => setText("[data-dashboard-status]", message);
  const profileName = (playerId) => playerById.get(playerId)?.name ?? playerId ?? "Jugador";

  const activateTab = (tabId, updateUrl = true) => {
    // "clasificados" (deep link viejo) se aliasa a "comparar".
    const normalized = tabId === "clasificados" ? "comparar" : tabId;
    const allowed = new Set(["grafico", "perfil", "comunidad", "partidos", "comparar", "grupos"]);
    state.activeTab = allowed.has(normalized) ? normalized : "grafico";
    section.querySelectorAll("[data-stats-tab]").forEach((button) => {
      const active = button.dataset.statsTab === state.activeTab;
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    section.querySelectorAll("[data-stats-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.statsPanel !== state.activeTab;
    });
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", state.activeTab);
      if (state.activeTab !== "partidos") url.searchParams.delete("match");
      window.history.replaceState({}, "", url);
    }
    // F9: al entrar a Clasificacion, pintar con el snapshot mas reciente.
    if (state.activeTab === "grupos" && state.analysis) {
      state.groupsSignature = null;
      renderGrupos();
    }
  };

  const findComparison = (playerAId, playerBId) =>
    state.analysis.comparisons.find(
      (comparison) =>
        (comparison.playerAId === playerAId && comparison.playerBId === playerBId) ||
        (comparison.playerAId === playerBId && comparison.playerBId === playerAId)
    );

  const renderProfile = () => {
    const panel = section.querySelector('[data-stats-panel="perfil"]');
    if (!panel || !state.analysis) return;
    const profile =
      state.analysis.profiles.find(
        (entry) => entry.playerId === state.selectedPlayerId
      ) ?? state.analysis.profiles[0];
    if (!profile) {
      panel.innerHTML = '<p class="stats-empty">No hay un perfil disponible.</p>';
      return;
    }
    const closest = state.analysis.profiles.find(
      (entry) => entry.playerId === profile.closestPlayerId
    );
    const opposite = state.analysis.profiles.find(
      (entry) => entry.playerId === profile.oppositePlayerId
    );
    const average =
      state.analysis.profiles.reduce((sum, entry) => sum + entry.averageGoals, 0) /
      state.analysis.profiles.length;
    const relation = profile.averageGoals >= average ? "más goleador" : "más conservador";
    const total = profile.homeWins + profile.draws + profile.awayWins;
    const avatar = playerById.get(profile.playerId)?.avatar ?? profile.avatar;

    const avatarNode = section.querySelector("[data-profile-avatar]");
    if (avatarNode) {
      avatarNode.innerHTML = avatar
        ? `<img src="${escapeHtml(avatar)}" alt="" width="160" height="160">`
        : `<strong>${escapeHtml(profile.name.slice(0, 2).toUpperCase())}</strong>`;
    }
    setText(
      "[data-profile-intro]",
      `${profile.name}, tu cartón es ${relation} que el promedio de la comunidad.`
    );

    panel.innerHTML = `
      <div class="profile-layout">
        <article class="profile-scorecard">
          <div class="badge-row">
            <span class="persona-badge">${escapeHtml(profile.badge)}</span>
            <span>${escapeHtml(profile.name)}</span>
          </div>
          <div class="profile-main-number">
            <strong>${profile.averageGoals.toFixed(2).replace(".", ",")}</strong>
            <span>goles por partido</span>
          </div>
          <p>La comunidad promedia ${average.toFixed(2).replace(".", ",")}. Tu cartón proyecta ${profile.totalGoals} goles en la fase de grupos.</p>
        </article>

        <dl class="profile-metrics">
          <div><dt>Gana local</dt><dd>${profile.homeWins}<small>${formatPercent(profile.homeWins, total)}</small></dd></div>
          <div><dt>Empates</dt><dd>${profile.draws}<small>${formatPercent(profile.draws, total)}</small></dd></div>
          <div><dt>Gana visita</dt><dd>${profile.awayWins}<small>${formatPercent(profile.awayWins, total)}</small></dd></div>
          <div><dt>Marcadores únicos</dt><dd>${profile.uniqueExactScores}<small>nadie los repite</small></dd></div>
          <div><dt>Tendencias solitarias</dt><dd>${profile.loneTendencies}<small>apuestas en minoría</small></dd></div>
        </dl>

        <section class="affinity-panel">
          <h2>Tu mapa de afinidad</h2>
          <div class="affinity-grid">
            <article>
              <span>Más parecido</span>
              <strong>${escapeHtml(closest?.name ?? "Sin comparación")}</strong>
              <p>${closest ? `${findComparison(profile.playerId, closest.playerId)?.tendencyMatches ?? 0} tendencias iguales de 72` : ""}</p>
            </article>
            <article>
              <span>Tu polo opuesto</span>
              <strong>${escapeHtml(opposite?.name ?? "Sin comparación")}</strong>
              <p>${opposite ? `${findComparison(profile.playerId, opposite.playerId)?.tendencyMatches ?? 0} tendencias iguales de 72` : ""}</p>
            </article>
          </div>
        </section>
      </div>`;
  };

  const renderCommunity = () => {
    const panel = section.querySelector('[data-stats-panel="comunidad"]');
    if (!panel || !state.analysis) return;
    const profilesByGoals = [...state.analysis.profiles].sort(
      (a, b) => b.averageGoals - a.averageGoals
    );
    const mostDraws = [...state.analysis.profiles].sort(
      (a, b) => b.draws - a.draws
    )[0];
    const mostOriginal = [...state.analysis.profiles].sort(
      (a, b) => b.uniqueExactScores - a.uniqueExactScores
    )[0];
    const unanimous = state.analysis.matchPulses.filter(
      (pulse) => pulse.consensusLevel === "unanimous"
    );
    const divided = state.analysis.matchPulses.filter(
      (pulse) => pulse.consensusLevel === "divided"
    );
    const topTeams = state.analysis.teamSupport.slice(0, 6);
    const stories = [
      `${profilesByGoals[0].name} proyecta ${profilesByGoals[0].averageGoals.toFixed(2).replace(".", ",")} goles por partido y lidera la fiesta ofensiva.`,
      `${profilesByGoals.at(-1).name} firma el cartón más cerrado con ${profilesByGoals.at(-1).averageGoals.toFixed(2).replace(".", ",")} goles por encuentro.`,
      `${mostDraws.name} es quien más confía en los empates: marcó ${mostDraws.draws} igualdades.`,
      `${mostOriginal.name} dejó ${mostOriginal.uniqueExactScores} marcadores exactos que nadie más repite.`,
    ];

    panel.innerHTML = `
      <div class="community-layout">
        <section class="story-feed">
          <h2>Lo que está diciendo la Polla</h2>
          <ul>${stories.map((story) => `<li>${escapeHtml(story)}</li>`).join("")}</ul>
        </section>
        <section class="consensus-radar">
          <div>
            <span>Consensos absolutos</span>
            <strong>${unanimous.length}</strong>
            <small>partidos con los ${state.analysis.confirmedCards} cartones del mismo lado</small>
          </div>
          <div>
            <span>Partidos que parten la oficina</span>
            <strong>${divided.length}</strong>
            <small>${divided[0] ? `${divided[0].homeTeam.name} vs ${divided[0].awayTeam.name} abre la lista` : "sin división total"}</small>
          </div>
        </section>
        <section class="team-support">
          <h2>Selecciones más apoyadas para clasificar</h2>
          <ol>
            ${topTeams.map((team) => `
              <li>
                <img src="/assets/flags/${escapeHtml(team.teamId)}.svg" alt="" width="36" height="26">
                <span>${escapeHtml(team.name)}</span>
                <div><i style="width:${Math.round((team.qualified / state.analysis.confirmedCards) * 100)}%"></i></div>
                <strong>${team.qualified}/${state.analysis.confirmedCards}</strong>
              </li>`).join("")}
          </ol>
        </section>
      </div>`;
  };

  // Resultado oficial normalizado para un partido (o null si no esta cerrado).
  const officialForMatch = (matchId) => {
    const official = state.liveSnapshot.officialResults.find(
      (result) => result.matchId === matchId
    );
    if (!official) return null;
    const homeScore = Number(official.homeTeamScore ?? official.homeScore);
    const awayScore = Number(official.awayTeamScore ?? official.awayScore);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return null;
    return { homeScore, awayScore };
  };

  // Mapeo unico de color por tipo de acierto (igual que la racha de /tabla).
  const HIT_DOT_TYPE = {
    lone_wolf: "lone_wolf",
    exact: "exact",
    tendency: "tendency",
  };
  const hitDotType = (hitType) => HIT_DOT_TYPE[hitType] ?? "miss";

  const renderResultPulse = (pulse) => {
    const official = state.liveSnapshot.officialResults.find(
      (result) => result.matchId === pulse.matchId
    );
    const liveCandidate =
      state.liveSnapshot.liveMatch?.matchId === pulse.matchId
        ? state.liveSnapshot.liveMatch
        : null;
    // Mismo tri-estado que la tabla: un partido preparado (pending) no se
    // muestra como "En vivo 0-0"; el pulso live solo aparece en fase live.
    const live =
      liveCandidate &&
      resolveLiveMatchPhase({
        liveMatch: liveCandidate,
        fixtureMatch: { id: pulse.matchId, dateChile: pulse.dateChile },
        officialResults: state.liveSnapshot.officialResults,
      }) === "live"
        ? liveCandidate
        : null;
    const result = official ?? live;
    if (!result) return "";
    const homeScore = Number(result.homeTeamScore ?? result.homeScore);
    const awayScore = Number(result.awayTeamScore ?? result.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return "";

    const predictions = state.dataset.predictions.filter(
      (prediction) => prediction.matchId === pulse.matchId
    );
    if (official) {
      const hitCounts = { lone_wolf: 0, exact: 0, tendency: 0, none: 0 };
      predictions.forEach((prediction) => {
        const scored = calculatePointsForPrediction(
          prediction,
          { homeScore, awayScore },
          predictions
        );
        hitCounts[scored.hitType] = (hitCounts[scored.hitType] ?? 0) + 1;
      });
      return `<div class="result-pulse finished"><strong>Resultado final ${homeScore}-${awayScore}</strong><span>${hitCounts.lone_wolf} Lone Wolf · ${hitCounts.exact} exactos · ${hitCounts.tendency} tendencias · ${hitCounts.none} sin puntos</span></div>`;
    }

    let exactAlive = 0;
    let tendencyNow = 0;
    let out = 0;
    predictions.forEach((prediction) => {
      if (prediction.homeScore >= homeScore && prediction.awayScore >= awayScore) {
        exactAlive += 1;
      } else {
        out += 1;
      }
      if (
        getOutcome(prediction.homeScore, prediction.awayScore) ===
        getOutcome(homeScore, awayScore)
      ) {
        tendencyNow += 1;
      }
    });
    return `<div class="result-pulse live"><strong>En vivo ${homeScore}-${awayScore}</strong><span>${exactAlive} mantienen exacto posible · ${tendencyNow} conservan tendencia · ${out} ya sobrepasados</span></div>`;
  };

  const renderMatchDetail = (pulse) => {
    const official = officialForMatch(pulse.matchId);
    const predictions = state.dataset.predictions.filter(
      (prediction) => prediction.matchId === pulse.matchId
    );

    // Auditoria de puntaje: con resultado oficial, cada fila muestra cuanto
    // sumo (misma fuente unica calculatePointsForPrediction, universo completo
    // del partido para que Lone Wolf sea correcto).
    const scoredByPlayer = new Map();
    if (official) {
      predictions.forEach((prediction) => {
        scoredByPlayer.set(
          prediction.playerId,
          calculatePointsForPrediction(prediction, official, predictions)
        );
      });
    }

    const rows = [...predictions].sort((a, b) => {
      if (official) {
        const pointsDiff =
          (scoredByPlayer.get(b.playerId)?.points ?? 0) -
          (scoredByPlayer.get(a.playerId)?.points ?? 0);
        if (pointsDiff !== 0) return pointsDiff;
      }
      return profileName(a.playerId).localeCompare(profileName(b.playerId));
    });

    const outcomeRows = [
      ["Gana local", pulse.outcomes.home, "home"],
      ["Empate", pulse.outcomes.draw, "draw"],
      ["Gana visita", pulse.outcomes.away, "away"],
    ];

    const title = official
      ? `${escapeHtml(pulse.homeTeam.name)} ${official.homeScore} - ${official.awayScore} ${escapeHtml(pulse.awayTeam.name)}`
      : `${escapeHtml(pulse.homeTeam.name)} vs ${escapeHtml(pulse.awayTeam.name)}`;
    const finalBadge = official ? `<span class="final-badge">RESULTADO FINAL</span>` : "";

    const tableHead = official
      ? `<tr><th>Jugador</th><th>Marcador</th><th>Tendencia</th><th>Suma</th></tr>`
      : `<tr><th>Jugador</th><th>Marcador</th><th>Tendencia</th></tr>`;

    const tableRows = rows
      .map((prediction) => {
        const baseCells = `
                  <td>${escapeHtml(profileName(prediction.playerId))}</td>
                  <td><strong>${prediction.homeScore}-${prediction.awayScore}</strong></td>
                  <td>${outcomeLabel(getOutcome(prediction.homeScore, prediction.awayScore))}</td>`;
        if (!official) {
          return `<tr data-current-player="${prediction.playerId === state.selectedPlayerId}">${baseCells}</tr>`;
        }
        const scored = scoredByPlayer.get(prediction.playerId) ?? { points: 0, hitType: "none" };
        const dotType = hitDotType(scored.hitType);
        return `<tr data-current-player="${prediction.playerId === state.selectedPlayerId}">${baseCells}
                  <td class="suma"><span class="score-dot" data-hit-type="${dotType}" aria-hidden="true"></span><strong>${scored.points > 0 ? `+${scored.points}` : "0"}</strong></td>
                </tr>`;
      })
      .join("");

    const legend = official
      ? `<div class="score-legend" aria-label="Leyenda de puntaje">
          <span><i class="score-dot" data-hit-type="lone_wolf" aria-hidden="true"></i> +5 Lone Wolf</span>
          <span><i class="score-dot" data-hit-type="exact" aria-hidden="true"></i> +3 Exacto</span>
          <span><i class="score-dot" data-hit-type="tendency" aria-hidden="true"></i> +1 Tendencia</span>
          <span><i class="score-dot" data-hit-type="miss" aria-hidden="true"></i> 0 Sin puntos</span>
        </div>`
      : "";

    return `
      <article class="match-detail" data-finished="${official ? "true" : "false"}">
        <header>
          <div>
            <span>Partido ${displayLabelFor(pulse.matchId, pulse.matchNumber)} · Grupo ${escapeHtml(pulse.groupId)}</span>
            <h2>${title}</h2>
          </div>
          <div class="detail-badges">
            ${finalBadge}
            <span class="consensus-pill" data-level="${pulse.consensusLevel}">${consensusLabel(pulse.consensusLevel)}</span>
          </div>
        </header>
        ${renderResultPulse(pulse)}
        <div class="outcome-bars">
          ${outcomeRows.map(([label, count, key]) => `
            <div>
              <span>${label}</span>
              <div><i data-outcome="${key}" style="width:${formatPercent(count, pulse.totalCards)}"></i></div>
              <strong>${count}/${pulse.totalCards}</strong>
            </div>`).join("")}
        </div>
        <div class="prediction-table-wrap">
          <table>
            <thead>${tableHead}</thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        ${legend}
      </article>`;
  };

  const renderMatches = () => {
    const panel = section.querySelector('[data-stats-panel="partidos"]');
    if (!panel || !state.analysis) return;
    const visible = state.analysis.matchPulses
      .filter(
        (pulse) =>
          (state.matchGroup === "all" || pulse.groupId === state.matchGroup) &&
          (state.consensus === "all" || pulse.consensusLevel === state.consensus)
      )
      // Orden del fixture (cronologico por hora de juego, como /fixture), no por grupo.
      .sort(
        (a, b) =>
          new Date(a.dateChile).getTime() - new Date(b.dateChile).getTime() ||
          a.matchNumber - b.matchNumber
      );
    if (!visible.some((pulse) => pulse.matchId === state.selectedMatchId)) {
      state.selectedMatchId = visible[0]?.matchId ?? state.analysis.matchPulses[0]?.matchId;
    }
    const selected =
      state.analysis.matchPulses.find(
        (pulse) => pulse.matchId === state.selectedMatchId
      ) ?? visible[0];

    panel.innerHTML = `
      <div class="match-explorer">
        <aside class="match-index">
          <div class="match-filters">
            <label>Grupo
              <select data-match-group-filter>
                <option value="all">Todos</option>
                ${groups.map((group) => `<option value="${group.id}" ${state.matchGroup === group.id ? "selected" : ""}>Grupo ${group.id}</option>`).join("")}
              </select>
            </label>
            <label>Lectura
              <select data-consensus-filter>
                <option value="all">Todas</option>
                <option value="unanimous" ${state.consensus === "unanimous" ? "selected" : ""}>Unánimes</option>
                <option value="strong" ${state.consensus === "strong" ? "selected" : ""}>Consenso fuerte</option>
                <option value="open" ${state.consensus === "open" ? "selected" : ""}>Abiertos</option>
                <option value="divided" ${state.consensus === "divided" ? "selected" : ""}>Divididos</option>
              </select>
            </label>
          </div>
          <p>${visible.length} partidos visibles</p>
          <div class="match-list">
            ${visible.map((pulse) => {
              const official = officialForMatch(pulse.matchId);
              const headline = official
                ? `${escapeHtml(pulse.homeTeam.name.toUpperCase())} ${official.homeScore}-${official.awayScore} ${escapeHtml(pulse.awayTeam.name.toUpperCase())}`
                : `${escapeHtml(pulse.homeTeam.name)} vs ${escapeHtml(pulse.awayTeam.name)}`;
              const meta = official
                ? `Finalizado · ${consensusLabel(pulse.consensusLevel)}`
                : consensusLabel(pulse.consensusLevel);
              return `
              <button type="button" data-community-match="${pulse.matchId}" data-finished="${official ? "true" : "false"}" aria-pressed="${pulse.matchId === state.selectedMatchId}">
                <span>${displayLabelFor(pulse.matchId, pulse.matchNumber)} · G${pulse.groupId}</span>
                <strong>${headline}</strong>
                <small>${meta}</small>
              </button>`;
            }).join("")}
          </div>
        </aside>
        ${selected ? renderMatchDetail(selected) : '<p class="stats-empty">Sin partidos para este filtro.</p>'}
      </div>`;
  };

  const renderComparator = () => {
    const currentId = state.selectedPlayerId;
    const profileIds = state.analysis.profiles.map((profile) => profile.playerId);
    if (!state.comparePlayerId || state.comparePlayerId === currentId) {
      state.comparePlayerId = profileIds.find((id) => id !== currentId) ?? null;
    }
    const comparison = findComparison(currentId, state.comparePlayerId);
    const currentProfile = state.analysis.profiles.find(
      (profile) => profile.playerId === currentId
    );
    const otherProfile = state.analysis.profiles.find(
      (profile) => profile.playerId === state.comparePlayerId
    );
    if (!currentProfile || !otherProfile || !comparison) {
      return '<section class="comparator"><p class="stats-empty">Necesitamos dos cartones para comparar.</p></section>';
    }
    return `
      <section class="comparator" id="comparador">
        <header>
          <div><span>COMPARADOR CARA A CARA</span><h2>${escapeHtml(currentProfile.name)} vs ${escapeHtml(otherProfile.name)}</h2></div>
          <label>Rival
            <select data-compare-player>
              ${state.analysis.profiles
                .filter((profile) => profile.playerId !== currentId)
                .map((profile) => `<option value="${profile.playerId}" ${profile.playerId === otherProfile.playerId ? "selected" : ""}>${escapeHtml(profile.name)}</option>`)
                .join("")}
            </select>
          </label>
        </header>
        <div class="comparison-grid">
          <div><strong>${comparison.exactMatches}</strong><span>marcadores exactos iguales</span><small>de 72</small></div>
          <div><strong>${comparison.tendencyMatches}</strong><span>tendencias compartidas</span><small>de 72</small></div>
          <div><strong>${comparison.qualifiedSlots}</strong><span>clasificados coincidentes</span><small>de 24</small></div>
          <div><strong>${Math.abs(currentProfile.totalGoals - otherProfile.totalGoals)}</strong><span>goles de diferencia</span><small>${currentProfile.totalGoals} vs ${otherProfile.totalGoals}</small></div>
        </div>
      </section>`;
  };

  const renderQualifiers = () => {
    const panel = section.querySelector('[data-stats-panel="comparar"]');
    if (!panel || !state.analysis) return;
    const urlTeam = new URL(window.location.href).searchParams.get("team");
    panel.innerHTML = `
      <div class="qualifier-layout">
        <section class="qualifier-matrix">
          <header><div><span>MAPA DE CLASIFICADOS</span><h2>Los grupos según la oficina</h2></div><p>${state.analysis.confirmedCards} cartones confirmados</p></header>
          <div class="group-matrix">
            ${state.analysis.qualifierConsensus.map((group) => `
              <article>
                <h3>Grupo ${group.groupId}</h3>
                <ol>
                  ${group.teams.map((row) => {
                    const team = teamById.get(row.teamId);
                    return `<li data-highlighted-team="${row.teamId === urlTeam}">
                      <img src="/assets/flags/${escapeHtml(row.teamId)}.svg" alt="" width="30" height="22">
                      <span>${escapeHtml(team?.name ?? row.teamId)}</span>
                      <strong>${row.qualified}/${state.analysis.confirmedCards}</strong>
                      <small>${row.firstPlace} primeros · ${row.secondPlace} segundos</small>
                    </li>`;
                  }).join("")}
                </ol>
              </article>`).join("")}
          </div>
        </section>
        ${renderComparator()}
      </div>`;
  };

  // ── F9: Clasificacion 1o/2o por grupo ───────────────────────────────────────
  // Vista por jugador de sus 12 grupos. Estado por grupo (BLOQUEADO / EN
  // DEFINICION / DEFINITIVO) y bonos +1/+3/0 salen de la fundacion; aqui NO se
  // re-implementa ni la formula del bono ni el gatillo. Solo lectura del seam.
  const GROUP_IDS = groups.map((group) => group.id);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  // teamById ya cubre teams.json; el shortCode vive ahi. Fallback a mayusculas.
  const groupCodeOf = (teamId) =>
    teamById.get(teamId)?.shortCode ?? (teamId ? String(teamId).toUpperCase() : "—");
  const groupNameOf = (teamId) => teamById.get(teamId)?.name ?? (teamId ? String(teamId) : "—");

  const groupPickFor = (playerId, groupId, position) =>
    (qualifiedPredictions.find(
      (q) => q.playerId === playerId && q.groupId === groupId && q.position === position
    ) ?? {}).teamId ?? null;

  // closuresByGroup desde el snapshot (groupClosures es un array de GroupClosure).
  const closuresByGroupFrom = (snapshot) => {
    const map = {};
    (snapshot.groupClosures ?? []).forEach((closure) => {
      if (closure?.groupId) map[closure.groupId] = closure;
    });
    return map;
  };

  // Modelo del panel para UN jugador: 12 grupos con estado y, si aplica, los
  // bonos por linea (de buildGroupBonuses.byGroup). Replica el patron F7: F1
  // (resolveActiveWindow) es el unico que gatea fase y mapea *TeamScore->*Score;
  // de ahi sale el `gatedLive` que consumen las libs de grupo.
  const buildGroupsModel = (playerId) => {
    const officialResults = state.liveSnapshot.officialResults ?? [];
    // TODOS los marcadores en vivo a la vez (no solo el ultimo): liveMatches[].
    const liveMatches = Array.isArray(state.liveSnapshot.liveMatches)
      ? state.liveSnapshot.liveMatches
      : state.liveSnapshot.liveMatch
        ? [state.liveSnapshot.liveMatch]
        : [];
    const closuresByGroup = closuresByGroupFrom(state.liveSnapshot);
    const now = Date.now();

    // Ventana activa = unica fuente del gating de fase + mapeo de marcador.
    const win = resolveActiveWindow({
      fixture: fixture.matches,
      official: officialResults,
      live: liveMatches,
      now,
    });
    const gatedLive = win.matches
      .filter((m) => m.phase === "live")
      .map((m) => ({ matchId: m.matchId, homeScore: m.homeScore, awayScore: m.awayScore }));

    // Bonos solo de grupos EN DEFINICION o cerrados (los bloqueados NO aparecen).
    const { byGroup } = buildGroupBonuses({
      players,
      qualifiedPredictions,
      groups,
      fixture: fixture.matches,
      official: officialResults,
      live: gatedLive,
      closuresByGroup,
    });

    let definitiveTotal = 0;
    let provisionalTotal = 0;

    const cards = GROUP_IDS.map((groupId) => {
      const group = groupById.get(groupId);
      const closure = closuresByGroup[groupId] ?? null;
      const pick1 = groupPickFor(playerId, groupId, 1);
      const pick2 = groupPickFor(playerId, groupId, 2);

      const sit = computeGroupSituation(groupId, {
        group,
        fixture: fixture.matches,
        official: officialResults,
        live: gatedLive,
        closure,
      });
      const started = sit.definitionStarted;
      const isFinal = sit.state === GROUP_STATE.FINAL;

      // BLOQUEADO: sin ventana abierta y sin closure final. Pick visible, sin
      // equipo actual y sin puntos. Estado por defecto de casi todos los grupos.
      if (!started && !isFinal) {
        return {
          groupId,
          label: group?.label ?? `Grupo ${groupId}`,
          state: "locked",
          pick1,
          pick2,
          current1: null,
          current2: null,
          points1: null,
          points2: null,
          total: null,
        };
      }

      // EN DEFINICION o DEFINITIVO: tomar las 2 lineas del jugador de byGroup.
      const lines = byGroup[groupId] ?? [];
      const lineFor = (evento) =>
        lines.find((l) => l.playerId === playerId && l.evento === evento) ?? null;
      const line1 = lineFor("first");
      const line2 = lineFor("second");
      const points1 = line1?.puntos ?? 0;
      const points2 = line2?.puntos ?? 0;
      const total = points1 + points2;

      if (isFinal) definitiveTotal += total;
      else provisionalTotal += total;

      return {
        groupId,
        label: group?.label ?? `Grupo ${groupId}`,
        state: isFinal ? "final" : "in_definition",
        pick1: line1?.predictedTeamId ?? pick1,
        pick2: line2?.predictedTeamId ?? pick2,
        // Equipo que va 1o/2o ahora (provisional si en definicion, congelado si final).
        current1: sit.first ?? null,
        current2: sit.second ?? null,
        points1,
        points2,
        total,
      };
    });

    return { cards, definitiveTotal, provisionalTotal };
  };

  const STATE_LABEL = {
    locked: "BLOQUEADO",
    in_definition: "EN DEFINICION",
    final: "DEFINITIVO",
  };

  const renderGroupCard = (card) => {
    const locked = card.state === "locked";
    const renderSlot = (position, pick, current, points) => {
      const pickCode = groupCodeOf(pick);
      const pickName = groupNameOf(pick);
      const bonus = position === 1 ? "+1" : "+3";
      if (locked) {
        return `
          <div class="g-slot" data-grupo-${position === 1 ? "first" : "second"}>
            <span class="g-pos"><span class="g-badge" data-pos="${position}">${position}o</span> ${bonus}</span>
            <span class="g-pick" title="${escapeHtml(pickName)}">${escapeHtml(pickCode)}</span>
            <span class="g-arrow" aria-hidden="true">→</span>
            <span class="g-current g-locked-current" aria-label="Se activa al empezar la fecha final">🔒</span>
            <span class="g-pts g-pts-locked">—</span>
          </div>`;
      }
      const hit = points > 0;
      const currentCode = groupCodeOf(current);
      const currentName = groupNameOf(current);
      return `
        <div class="g-slot" data-grupo-${position === 1 ? "first" : "second"} data-hit="${hit}">
          <span class="g-pos"><span class="g-badge" data-pos="${position}">${position}o</span> ${bonus}</span>
          <span class="g-pick" title="${escapeHtml(pickName)}">${escapeHtml(pickCode)}</span>
          <span class="g-arrow" aria-hidden="true">→</span>
          <span class="g-current" title="${escapeHtml(currentName)}">${escapeHtml(currentCode)}</span>
          <span class="g-pts" data-hit="${hit}">${hit ? `+${points}` : "0"}</span>
        </div>`;
    };

    const totalLabel = locked ? "—" : card.total > 0 ? `+${card.total}` : "0";
    return `
      <article class="grupo-card" data-grupo-card data-group-id="${card.groupId}" data-grupo-state="${card.state}">
        <header class="grupo-head">
          <h3>${escapeHtml(card.label)}</h3>
          <span class="grupo-state" data-grupo-state="${card.state}">
            ${locked ? '<span class="g-lock" aria-hidden="true">🔒</span>' : ""}${STATE_LABEL[card.state]}
          </span>
        </header>
        <div class="grupo-slots">
          ${renderSlot(1, card.pick1, card.current1, card.points1)}
          ${renderSlot(2, card.pick2, card.current2, card.points2)}
        </div>
        <footer class="grupo-foot">
          <span>Total grupo</span>
          <strong class="grupo-total" data-grupo-total>${totalLabel}</strong>
        </footer>
      </article>`;
  };

  const renderGrupos = (panelArg) => {
    const panel = panelArg ?? section.querySelector('[data-stats-panel="grupos"]');
    if (!panel) return;
    // Jugador del panel: arranca en la identidad local; el selector lo cambia.
    if (!state.groupPlayerId || !playerById.has(state.groupPlayerId)) {
      state.groupPlayerId =
        (state.selectedPlayerId && playerById.has(state.selectedPlayerId)
          ? state.selectedPlayerId
          : null) ?? players[0]?.id ?? null;
    }
    const playerId = state.groupPlayerId;
    const { cards, definitiveTotal, provisionalTotal } = buildGroupsModel(playerId);
    const lockedCount = cards.filter((c) => c.state === "locked").length;

    const playerOptions = players
      .map(
        (player) =>
          `<option value="${player.id}" ${player.id === playerId ? "selected" : ""}>${escapeHtml(player.name)}</option>`
      )
      .join("");

    panel.innerHTML = `
      <div class="grupos-layout" data-grupos-player="${escapeHtml(playerId ?? "")}">
        <header class="grupos-head">
          <div class="grupos-head-main">
            <span class="grupos-kicker">CLASIFICACION 1o / 2o</span>
            <label class="grupos-player-select">
              <span class="sr-only">Jugador</span>
              <select data-grupos-player-select aria-label="Elegir jugador">${playerOptions}</select>
            </label>
          </div>
          <dl class="grupos-totals" aria-label="Total de clasificacion del jugador">
            <div><dt>Definitivo</dt><dd data-grupos-definitive>${definitiveTotal > 0 ? `+${definitiveTotal}` : "0"}</dd></div>
            <div><dt>En definicion</dt><dd data-grupos-provisional>${provisionalTotal > 0 ? `+${provisionalTotal}` : "0"}</dd></div>
            <div><dt>Bloqueados</dt><dd data-grupos-locked>${lockedCount}/12</dd></div>
          </dl>
        </header>
        <p class="grupos-note">
          Los grupos bloqueados se activan cuando empieza su fecha final. Hasta
          entonces ves tu pronostico, sin 1o/2o provisional ni puntos.
        </p>
        <div class="grupos-grid">
          ${cards.map(renderGroupCard).join("")}
        </div>
      </div>`;
  };

  const renderAll = () => {
    renderProfile();
    renderCommunity();
    renderMatches();
    renderQualifiers();
    renderGrupos();
  };

  const loadDashboard = async () => {
    setStatus("Cargando los cartones oficiales...");
    try {
      const response = await fetch(DATASET_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const officialDataset = await response.json();
      const hasCanonical = officialDataset.submissions?.some(
        (submission) => submission.playerId === state.selectedPlayerId
      );
      state.dataset = hasCanonical
        ? officialDataset
        : mergeLocalPlayer(
            officialDataset,
            state.selectedPlayerId,
            getLocalPredictions(state.selectedPlayerId),
            getLocalQualified(state.selectedPlayerId)
          );
      state.analysis = buildCommunityAnalysis({
        dataset: state.dataset,
        matches: fixture.matches,
        groups,
        teams,
        players,
      });

      const params = new URL(window.location.href).searchParams;
      state.activeTab = params.get("tab") || "grafico";
      state.selectedMatchId = params.get("match") || state.selectedMatchId;
      state.comparePlayerId = params.get("player") || null;
      renderAll();
      activateTab(state.activeTab, false);
      // Carrera de Puntaje: este script es el dueño único del dataset y de
      // subscribeLiveData; el gráfico solo recibe {dataset, liveSnapshot}.
      if (!scoreRace) scoreRace = createScoreRace({ section });
      // Primer paint: el baseline commiteado pinta los partidos cerrados al
      // instante (remoteLoaded:false). El snapshot remoto llega luego y manda.
      scoreRace.update({ dataset: state.dataset, liveSnapshot: state.liveSnapshot, remoteLoaded: false });
      setStatus(
        `${state.analysis.confirmedCards} cartones comparados · ${state.dataset.predictions.length} pronósticos oficiales`
      );
      if (params.get("tab") === "comparar") {
        requestAnimationFrame(() =>
          section.querySelector("#comparador")?.scrollIntoView({ block: "nearest" })
        );
      }
    } catch (error) {
      setStatus("No fue posible cargar el Data Center. Reintenta al actualizar la página.");
      console.error("estadisticas: dataset unavailable", error);
    }
  };

  const cta = section.querySelector("[data-primary-cta]");
  if (cta) {
    cta.setAttribute("href", TARGET);
    cta.addEventListener("click", (event) => {
      if (section.dataset.state === "unlocked") {
        event.preventDefault();
        section.querySelector("[data-stats-dashboard]")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
        return;
      }
      try {
        window.localStorage.setItem("polla:activePredictionGroup", "A");
        window.sessionStorage.setItem("polla:activePredictionGroupIntent", "A");
      } catch {}
    });
  }

  section.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const tab = target.closest("[data-stats-tab]");
    if (tab) {
      activateTab(tab.dataset.statsTab);
      return;
    }
    const matchButton = target.closest("[data-community-match]");
    if (matchButton) {
      state.selectedMatchId = matchButton.dataset.communityMatch;
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "partidos");
      url.searchParams.set("match", state.selectedMatchId);
      window.history.replaceState({}, "", url);
      renderMatches();
    }
  });

  section.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.matches("[data-match-group-filter]")) {
      state.matchGroup = target.value;
      renderMatches();
    } else if (target.matches("[data-consensus-filter]")) {
      state.consensus = target.value;
      renderMatches();
    } else if (target.matches("[data-compare-player]")) {
      state.comparePlayerId = target.value;
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "comparar");
      url.searchParams.set("player", target.value);
      window.history.replaceState({}, "", url);
      renderQualifiers();
    } else if (target.matches("[data-grupos-player-select]")) {
      // F9: cambiar el jugador del panel Clasificacion re-pinta la matriz.
      state.groupPlayerId = target.value;
      state.groupsSignature = null; // forzar re-render aunque el snapshot no cambie
      renderGrupos();
    }
  });

  section.querySelector("[data-stats-tabs]");
  section.addEventListener("keydown", (event) => {
    const tab = event.target instanceof Element ? event.target.closest("[data-stats-tab]") : null;
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...section.querySelectorAll("[data-stats-tab]")];
    const current = tabs.indexOf(tab);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    event.preventDefault();
    tabs[next].focus();
    activateTab(tabs[next].dataset.statsTab);
  });

  const snapshot = computeSnapshot();
  applySnapshot(snapshot);
  wireMissingIdentityModal();
  if (snapshot.state === "no-identity") {
    openMissingIdentityModal();
  }
  if (snapshot.state === "unlocked") {
    loadDashboard();
    subscribeLiveData((liveSnapshot) => {
      state.liveSnapshot = liveSnapshot;
      if (state.analysis) {
        renderMatches();
        // El snapshot remoto es autoritativo: des-finalizar saca el partido.
        scoreRace?.update({ dataset: state.dataset, liveSnapshot, remoteLoaded: true });
      }
      // F9: re-pintar Clasificacion si su pestana esta activa. Memo por firma
      // (oficiales + live + closures + jugador) para no re-pintar sin cambios.
      if (state.activeTab === "grupos") {
        const signature = JSON.stringify({
          o: liveSnapshot.officialResults ?? [],
          l: liveSnapshot.liveMatches ?? (liveSnapshot.liveMatch ? [liveSnapshot.liveMatch] : []),
          c: liveSnapshot.groupClosures ?? [],
          p: state.groupPlayerId,
        });
        if (signature !== state.groupsSignature) {
          state.groupsSignature = signature;
          renderGrupos();
        }
      }
    });
  }
})();
