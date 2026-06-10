import players from "../../data/players.json";
import fixture from "../../data/fixture.json";
import groups from "../../data/groups.json";
import teams from "../../data/teams.json";
import { ensurePollaStorageVersion } from "../../lib/storage/resetPollaState.js";
import {
  buildCommunityAnalysis,
  getOutcome,
  mergeLocalPlayer,
} from "../../lib/statistics/communityStatistics.js";
import { calculatePointsForPrediction } from "../../lib/liveMatch/liveScoring.js";
import { subscribeLiveData } from "../../lib/liveMatch/liveMatchState.js";
import { isStatisticsUnlocked } from "../../lib/predictions/predictionAccess.js";

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

  const state = {
    activeTab: "perfil",
    selectedMatchId: "match-004",
    matchGroup: "all",
    consensus: "all",
    comparePlayerId: null,
    analysis: null,
    dataset: null,
    selectedPlayerId: null,
    liveSnapshot: { liveMatch: null, officialResults: [] },
  };

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

  const computeSnapshot = () => {
    const playerId = getLocalPlayerId();
    const bucket = getLocalPredictions(playerId);
    if (!playerId) {
      return { playerId, completed: 0, total: TOTAL, percent: 0, state: "locked" };
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
    setText(
      "[data-cta-label]",
      snapshot.state === "unlocked" ? "VER ESTADÍSTICAS COMPLETAS" : "IR A PREDICCIONES"
    );
    setText(
      "[data-progress-helper]",
      snapshot.state === "unlocked"
        ? snapshot.official
          ? "Tu cartón oficial está confirmado. El Data Center está activo en este dispositivo."
          : "Ya completaste tus 72 predicciones. El Data Center está activo."
        : "Cada predicción confirmada te acerca a desbloquear todas las estadísticas."
    );

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

  const setStatus = (message) => setText("[data-dashboard-status]", message);
  const profileName = (playerId) => playerById.get(playerId)?.name ?? playerId ?? "Jugador";

  const activateTab = (tabId, updateUrl = true) => {
    const normalized = tabId === "comparar" ? "clasificados" : tabId;
    const allowed = new Set(["perfil", "comunidad", "partidos", "clasificados"]);
    state.activeTab = allowed.has(normalized) ? normalized : "perfil";
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
        <section class="community-score">
          <span>El marcador de la oficina</span>
          <strong>${escapeHtml(state.analysis.favoriteScores[0]?.score ?? "--")}</strong>
          <p>Aparece ${state.analysis.favoriteScores[0]?.count ?? 0} veces entre ${state.dataset.predictions.length} pronósticos.</p>
        </section>
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

  const renderResultPulse = (pulse) => {
    const official = state.liveSnapshot.officialResults.find(
      (result) => result.matchId === pulse.matchId
    );
    const live =
      state.liveSnapshot.liveMatch?.matchId === pulse.matchId
        ? state.liveSnapshot.liveMatch
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
      return `<div class="result-pulse finished"><strong>Final ${homeScore}-${awayScore}</strong><span>${hitCounts.lone_wolf} Lone Wolf · ${hitCounts.exact} exactos · ${hitCounts.tendency} tendencias · ${hitCounts.none} sin puntos</span></div>`;
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
    const predictions = state.dataset.predictions
      .filter((prediction) => prediction.matchId === pulse.matchId)
      .sort((a, b) => profileName(a.playerId).localeCompare(profileName(b.playerId)));
    const outcomeRows = [
      ["Gana local", pulse.outcomes.home, "home"],
      ["Empate", pulse.outcomes.draw, "draw"],
      ["Gana visita", pulse.outcomes.away, "away"],
    ];
    return `
      <article class="match-detail">
        <header>
          <div>
            <span>Partido ${String(pulse.matchNumber).padStart(2, "0")} · Grupo ${escapeHtml(pulse.groupId)}</span>
            <h2>${escapeHtml(pulse.homeTeam.name)} vs ${escapeHtml(pulse.awayTeam.name)}</h2>
          </div>
          <span class="consensus-pill" data-level="${pulse.consensusLevel}">${consensusLabel(pulse.consensusLevel)}</span>
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
        <p class="favorite-score">Marcador coral: <strong>${escapeHtml(pulse.favoriteScore)}</strong> · promedio ${pulse.averageGoals.toFixed(2).replace(".", ",")} goles.</p>
        <div class="prediction-table-wrap">
          <table>
            <thead><tr><th>Jugador</th><th>Marcador</th><th>Tendencia</th></tr></thead>
            <tbody>
              ${predictions.map((prediction) => `
                <tr data-current-player="${prediction.playerId === state.selectedPlayerId}">
                  <td>${escapeHtml(profileName(prediction.playerId))}</td>
                  <td><strong>${prediction.homeScore}-${prediction.awayScore}</strong></td>
                  <td>${outcomeLabel(getOutcome(prediction.homeScore, prediction.awayScore))}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </article>`;
  };

  const renderMatches = () => {
    const panel = section.querySelector('[data-stats-panel="partidos"]');
    if (!panel || !state.analysis) return;
    const visible = state.analysis.matchPulses.filter(
      (pulse) =>
        (state.matchGroup === "all" || pulse.groupId === state.matchGroup) &&
        (state.consensus === "all" || pulse.consensusLevel === state.consensus)
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
            ${visible.map((pulse) => `
              <button type="button" data-community-match="${pulse.matchId}" aria-pressed="${pulse.matchId === state.selectedMatchId}">
                <span>${String(pulse.matchNumber).padStart(2, "0")} · G${pulse.groupId}</span>
                <strong>${escapeHtml(pulse.homeTeam.name)} vs ${escapeHtml(pulse.awayTeam.name)}</strong>
                <small>${escapeHtml(pulse.favoriteScore)} · ${consensusLabel(pulse.consensusLevel)}</small>
              </button>`).join("")}
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
    const panel = section.querySelector('[data-stats-panel="clasificados"]');
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

  const renderAll = () => {
    renderProfile();
    renderCommunity();
    renderMatches();
    renderQualifiers();
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
      state.activeTab = params.get("tab") || "perfil";
      state.selectedMatchId = params.get("match") || state.selectedMatchId;
      state.comparePlayerId = params.get("player") || null;
      renderAll();
      activateTab(state.activeTab, false);
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
      url.searchParams.set("tab", "clasificados");
      url.searchParams.set("player", target.value);
      window.history.replaceState({}, "", url);
      renderQualifiers();
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
  if (snapshot.state === "unlocked") {
    loadDashboard();
    subscribeLiveData((liveSnapshot) => {
      state.liveSnapshot = liveSnapshot;
      if (state.analysis) renderMatches();
    });
  }
})();
