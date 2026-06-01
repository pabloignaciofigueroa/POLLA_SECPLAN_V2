(() => {
  const section = document.querySelector('[data-section="proximo-partido"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-proximo-partido-payload]");
  const payload = payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
  const matches = payload.matches ?? [];
  const teams = payload.teams ?? [];
  const h2hMatches = payload.h2hMatches ?? [];
  const stadiums = payload.stadiums ?? {};
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const h2hByMatchNumber = new Map(h2hMatches.map((item) => [item.matchNumber, item.h2h]));
  const predictionGroupKey = "polla:activePredictionGroup";
  const predictionIntentKey = "polla:activePredictionGroupIntent";

  const fallbackH2h = {
    previousMeetings: 0,
    isFirstMeeting: true,
    summaryEs: "No hay antecedentes historicos confirmados para este duelo.",
    uiLabel: "Primer enfrentamiento",
    worldCupContext: null,
  };

  const getH2h = (match) => h2hByMatchNumber.get(match.matchNumber) ?? fallbackH2h;

  const persistPredictionGroupIntent = (groupId) => {
    if (!groupId) return;
    try {
      window.localStorage.setItem(predictionGroupKey, groupId);
      window.sessionStorage.setItem(predictionIntentKey, groupId);
    } catch {
      // La navegacion a predicciones debe seguir funcionando aunque storage no este disponible.
    }
  };

  const minutes = (value) => value * 60 * 1000;
  const sameUtcDay = (a, b) =>
    a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

  const getRelevantMatches = (matchList, now = new Date(), options = {}) => {
    const activeWindow = minutes(options.activeWindowMinutes ?? 120);
    const recentWindow = minutes(options.recentWindowMinutes ?? 360);
    const offDayThreshold = minutes(options.offDayThresholdMinutes ?? 720);
    const ordered = [...matchList].sort((a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime());
    const nowMs = now.getTime();
    const liveMatches = ordered.filter((match) => {
      const start = new Date(match.dateUtc).getTime();
      return start <= nowMs && nowMs < start + activeWindow;
    });
    const nextMatches = ordered.filter((match) => new Date(match.dateUtc).getTime() > nowMs);
    const lastFinishedMatches = ordered.filter((match) => new Date(match.dateUtc).getTime() + activeWindow <= nowMs).reverse();

    if (liveMatches.length > 1) return { displayMode: "multi_live", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: liveMatches[0] };
    if (liveMatches.length === 1) return { displayMode: "live", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: liveMatches[0] };

    const lastFinished = lastFinishedMatches[0];
    const nextMatch = nextMatches[0];
    const lastFinishedEnd = lastFinished ? new Date(lastFinished.dateUtc).getTime() + activeWindow : 0;
    const nextStart = nextMatch ? new Date(nextMatch.dateUtc).getTime() : Number.POSITIVE_INFINITY;
    const recentFinished = lastFinished && nowMs - lastFinishedEnd <= recentWindow;
    const nextFarAway = nextStart - nowMs > offDayThreshold;

    if (recentFinished && nextFarAway) return { displayMode: "finished_recent", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: lastFinished };
    if (nextMatch) {
      const firstMatch = ordered[0];
      const beforeTournament = firstMatch && nowMs < new Date(firstMatch.dateUtc).getTime();
      const offDay = !beforeTournament && !sameUtcDay(now, new Date(nextMatch.dateUtc)) && nextStart - nowMs > offDayThreshold;
      return { displayMode: offDay ? "off_day" : "upcoming", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: nextMatch };
    }

    return { displayMode: "off_day", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: lastFinished };
  };

  const formatDate = (match) =>
    new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(match.dateChile));
  const formatTime = (match) =>
    `${new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(match.dateChile))} hrs (Chile)`;

  const updateTeamCard = (side, team) => {
    const card = section.querySelector(`[data-team-card="${side}"]`);
    if (!card) return;
    const teamInfo = teamById.get(team.id) ?? {};
    card.dataset.teamId = team.id;
    const flagSlot = card.querySelector("[data-team-flag-slot]");
    if (flagSlot && team.id) {
      flagSlot.innerHTML = `<img src="/assets/flags/${team.id}.svg" alt="Bandera ${team.name}" loading="lazy" decoding="async" width="220" height="160" style="display:block;width:100%;height:100%;object-fit:contain;">`;
    }
    const crestSlot = card.querySelector("[data-team-crest-slot]");
    if (crestSlot && team.id) {
      crestSlot.innerHTML = `<img src="/assets/crests/thumbs/${team.id}.webp" alt="" loading="lazy" decoding="async" width="96" height="96" style="display:block;width:100%;height:100%;object-fit:contain;">`;
    }
    const codeNode = card.querySelector("[data-team-code]");
    if (codeNode) codeNode.textContent = team.shortCode;
    card.querySelector("[data-team-name]").textContent = team.name;
    card.querySelector("[data-team-confederation]").textContent = teamInfo.confederation ?? "CONF";
  };

  const renderReading = (h2hInfo) => {
    const list = section.querySelector("[data-reading-list]");
    if (!list) return;
    const items = [
      h2hInfo.uiLabel ?? "Primer enfrentamiento",
      h2hInfo.summaryEs ?? fallbackH2h.summaryEs,
      h2hInfo.worldCupContext,
    ].filter(Boolean);
    list.innerHTML = "";
    items.forEach((text) => {
      const item = document.createElement("li");
      item.innerHTML = `<span aria-hidden="true">◆</span><p></p>`;
      item.querySelector("p").textContent = text;
      list.append(item);
    });
  };

  const renderContext = (match) => {
    const list = section.querySelector("[data-context-list]");
    if (!list) return;
    const rows = [
      ["Ronda", match.stage],
      ["Grupo", match.groupLabel],
      ["Estado", "Por jugar"],
      ["Estadio", match.location],
    ];
    list.innerHTML = "";
    rows.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.innerHTML = `<dt></dt><dd></dd>`;
      item.querySelector("dt").textContent = label;
      item.querySelector("dd").textContent = value;
      list.append(item);
    });
    const city = section.querySelector("[data-context-city]");
    const stadium = stadiums[match.id];
    if (city) city.textContent = stadium?.city ?? match.location;
  };

  const updateStadiumMedia = (match) => {
    const figure = section.querySelector("[data-stadium-media]");
    const stadium = stadiums[match.id];
    if (!figure || !stadium) return;
    const img = figure.querySelector("img");
    if (img) {
      img.src = stadium.src;
      img.alt = stadium.name ? `Vista del estadio ${stadium.name}` : "";
    }
    const nameNode = figure.querySelector("figcaption strong");
    if (nameNode) nameNode.textContent = stadium.name ?? "";
    const cityNode = figure.querySelector("figcaption span");
    if (cityNode) cityNode.textContent = stadium.city ?? "";
  };

  const updateHistorical = (h2hInfo) => {
    const meetings = section.querySelector("[data-history-meetings]");
    const label = section.querySelector("[data-history-label]");
    if (meetings) meetings.textContent = String(h2hInfo.previousMeetings ?? 0);
    if (label) label.textContent = h2hInfo.uiLabel ?? "Primer enfrentamiento";
  };

  const renderMatch = (relevant) => {
    const match = relevant.primaryMatch;
    if (!match) return;
    const h2hInfo = getH2h(match);
    section.dataset.displayMode = relevant.displayMode;
    section.dataset.primaryMatchId = match.id;
    section.dataset.primaryGroupId = match.groupId;

    const predictionCta = section.querySelector("[data-prediction-cta]");
    if (predictionCta) {
      predictionCta.dataset.predictionGroup = match.groupId;
    }

    const actionCopy = section.querySelector("[data-action-copy]");
    if (actionCopy) actionCopy.textContent = `${match.homeTeam.name} vs ${match.awayTeam.name} ya esta listo para pronosticar.`;

    const metaStrip = section.querySelector("[data-match-meta-strip]");
    if (metaStrip) metaStrip.dataset.displayMode = relevant.displayMode;
    section.querySelector("[data-meta-stage]").textContent = `${match.stage.replace(" - fecha 1", "")} · ${match.groupLabel}`;
    section.querySelector("[data-meta-date]").textContent = formatDate(match);
    section.querySelector("[data-meta-time]").textContent = formatTime(match);
    section.querySelector("[data-meta-location]").textContent = match.location;

    updateTeamCard("home", match.homeTeam);
    updateTeamCard("away", match.awayTeam);
    updateHistorical(h2hInfo);
    renderReading(h2hInfo);
    renderContext(match);
    updateStadiumMedia(match);
    startCountdown(match.dateUtc, relevant.displayMode);
  };

  const startCountdown = (dateUtc, displayMode) => {
    const el = section.querySelector("[data-countdown]");
    if (!el) return;
    const matchTime = new Date(dateUtc).getTime();
    const update = () => {
      if (displayMode === "live" || displayMode === "multi_live") {
        el.textContent = "En vivo";
        el.dataset.state = "live";
        return;
      }
      if (displayMode === "finished_recent") {
        el.textContent = "Finalizado";
        el.dataset.state = "finished";
        return;
      }
      const diff = matchTime - Date.now();
      if (diff <= 0) {
        el.textContent = "En vivo";
        el.dataset.state = "live";
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000).toString().padStart(2, "0");
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
      el.textContent = d > 0 ? `${d}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
      el.dataset.state = "upcoming";
    };
    update();
    setInterval(update, 1000);
  };

  section.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-prediction-cta]") : null;
    if (!target || !section.contains(target)) return;
    persistPredictionGroupIntent(target.dataset.predictionGroup || section.dataset.primaryGroupId || "A");
  });

  const relevant = getRelevantMatches(matches, new Date());
  const primaryMatch = relevant.primaryMatch;
  if (primaryMatch && section.dataset.primaryMatchId === primaryMatch.id) {
    startCountdown(primaryMatch.dateUtc, relevant.displayMode);
  } else {
    renderMatch(relevant);
  }
})();
