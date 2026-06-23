import { isStatisticsUnlockedFromStorage } from "../../lib/predictions/predictionAccess.js";
import { subscribeLiveData } from "../../lib/liveMatch/liveMatchState.js";
import { resolveActiveWindow, resolveEffectiveResults } from "../../lib/liveMatch/activeWindow.js";
import { getGroupFinalMatches, computeGroupSituation } from "../../lib/fixture/groupState.js";
import { buildPointLedger } from "../../lib/scoring/buildPointLedger.js";
import { buildChangeEvents, deriveRanking } from "../../lib/statistics/buildChangeEvents.js";

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

  // F6 Centro de definicion de grupo (solo lectura del seam).
  const groups = payload.groups ?? [];
  const players = payload.players ?? [];
  const predictions = payload.predictions ?? [];
  const qualifiedPredictions = payload.qualifiedPredictions ?? [];
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const h2hByMatchNumber = new Map(h2hMatches.map((item) => [item.matchNumber, item.h2h]));
  const predictionGroupKey = "polla:activePredictionGroup";
  const predictionIntentKey = "polla:activePredictionGroupIntent";

  const statsUnlocked = () => {
    return isStatisticsUnlockedFromStorage({
      confirmedPlayerIds: payload.confirmedPlayerIds ?? [],
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    });
  };

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

  let countdownTimer = null;

  const startCountdown = (dateUtc, displayMode) => {
    const el = section.querySelector("[data-countdown]");
    if (!el) return;
    // Un solo interval vivo: re-renderizar no debe acumular timers.
    if (countdownTimer) window.clearInterval(countdownTimer);
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
    countdownTimer = window.setInterval(update, 1000);
  };

  // ── F6: Centro de definicion de grupo ──────────────────────────────────────
  // Aparece SOLO cuando un grupo tiene >=1 de sus dos finales de 3a fecha EN VIVO.
  // Todo el calculo sale de las libs F0-F5 (cero formula de puntaje en la UI).
  const center = section.querySelector("[data-group-definition-center]");
  const SELECTED_PLAYER_KEY = "polla:selectedPlayerId";

  const readSelectedPlayerId = () => {
    try {
      return window.localStorage.getItem(SELECTED_PLAYER_KEY);
    } catch {
      return null;
    }
  };

  // El seam emite liveMatches[] (multi) ademas del liveMatch legado.
  const extractLive = (snapshot) => {
    if (Array.isArray(snapshot?.liveMatches)) return snapshot.liveMatches;
    if (snapshot?.liveMatch) return [snapshot.liveMatch];
    return [];
  };

  const flagImg = (teamId, alt = "") =>
    teamId
      ? `<img src="/assets/flags/${teamId}.svg" alt="${alt}" loading="lazy" decoding="async" width="40" height="28" style="display:block;width:100%;height:100%;object-fit:cover;">`
      : "";

  const codeOf = (teamId) => teamById.get(teamId)?.shortCode ?? String(teamId ?? "—").toUpperCase();
  const nameOf = (teamId) => teamById.get(teamId)?.name ?? teamId ?? "—";
  const fmtSigned = (n) => (Number(n) > 0 ? `+${n}` : String(n));

  // Mapeo regla -> etiqueta/token visual (solo display; el puntaje viene del libro).
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

  // Los dos finales ordenados ascendente (Final 1 antes que Final 2) para etiqueta estable.
  const orderedFinals = (groupId) =>
    getGroupFinalMatches(groupId, { group: groups.find((g) => g.id === groupId), fixture: matches })
      .slice()
      .sort(
        (a, b) =>
          Date.parse(a.dateUtc ?? 0) - Date.parse(b.dateUtc ?? 0) ||
          (a.matchNumber ?? 0) - (b.matchNumber ?? 0)
      );

  // activeGroupId = primer grupo (orden A..L) con >=1 final EN VIVO en la ventana F1.
  const resolveActiveGroupId = (activeWindow) => {
    for (const group of groups) {
      const finalIds = new Set(orderedFinals(group.id).map((m) => m.id));
      const liveFinal = (activeWindow.byGroup[group.id] ?? []).some(
        (w) => w.phase === "live" && finalIds.has(w.matchId)
      );
      if (liveFinal) return group.id;
    }
    return null;
  };

  const renderBoards = (finals, effByMatch) => {
    const boards = center.querySelectorAll("[data-live-match-mini]");
    finals.forEach((match, index) => {
      const board = boards[index];
      if (!board || !match) return;
      const eff = effByMatch.get(match.id) ?? null;
      const phase = eff ? (eff.official ? "official" : "live") : "pending";
      board.dataset.phase = phase;
      const status = board.querySelector("[data-lmm-status]");
      if (status) status.textContent = phase === "live" ? "EN VIVO" : phase === "official" ? "OFICIAL" : "POR INICIAR";
      const homeFlag = board.querySelector('[data-lmm-flag="home"]');
      const awayFlag = board.querySelector('[data-lmm-flag="away"]');
      if (homeFlag) homeFlag.innerHTML = flagImg(match.homeTeam?.id, nameOf(match.homeTeam?.id));
      if (awayFlag) awayFlag.innerHTML = flagImg(match.awayTeam?.id, nameOf(match.awayTeam?.id));
      const homeCode = board.querySelector('[data-lmm-code="home"]');
      const awayCode = board.querySelector('[data-lmm-code="away"]');
      if (homeCode) homeCode.textContent = codeOf(match.homeTeam?.id);
      if (awayCode) awayCode.textContent = codeOf(match.awayTeam?.id);
      const homeScore = board.querySelector('[data-lmm-score="home"]');
      const awayScore = board.querySelector('[data-lmm-score="away"]');
      if (homeScore) homeScore.textContent = eff ? String(eff.homeScore) : "–";
      if (awayScore) awayScore.textContent = eff ? String(eff.awayScore) : "–";
    });
  };

  const renderStandings = (sit) => {
    const panel = center.querySelector("[data-live-group-standings]");
    if (!panel) return;
    const chip = panel.querySelector("[data-lgs-chip]");
    if (chip) chip.hidden = !sit.isProvisional;
    const rows = panel.querySelectorAll("[data-lgs-row]");
    (sit.standings ?? []).slice(0, 4).forEach((row, index) => {
      const tr = rows[index];
      if (!tr || !row) return;
      const qualify = row.teamId === sit.first ? "first" : row.teamId === sit.second ? "second" : "out";
      tr.dataset.qualify = qualify;
      const set = (sel, value) => {
        const el = tr.querySelector(sel);
        if (el) el.textContent = value;
      };
      set("[data-lgs-pos]", String(index + 1));
      const badge = tr.querySelector("[data-lgs-badge]");
      if (badge) badge.textContent = qualify === "first" ? "1o" : qualify === "second" ? "2o" : "";
      const flag = tr.querySelector("[data-lgs-flag]");
      if (flag) flag.innerHTML = flagImg(row.teamId, nameOf(row.teamId));
      set("[data-lgs-team]", row.shortCode ?? codeOf(row.teamId));
      set("[data-lgs-pj]", String(row.played ?? 0));
      set("[data-lgs-dg]", fmtSigned(row.goalDifference ?? 0));
      set("[data-lgs-gf]", String(row.goalsFor ?? 0));
      set("[data-lgs-pts]", String(row.points ?? 0));
    });
  };

  const renderImpact = (activeGroupId, sit, me, pid, effByMatch, finals) => {
    const card = center.querySelector("[data-your-impact-card]");
    if (!card || !me) return;
    const name = players.find((p) => p.id === pid)?.name ?? pid ?? "—";
    const official = Math.round(me.official ?? 0);
    const projected = Math.round(me.projected ?? 0);
    const delta = projected - official;
    const setText = (sel, value) => {
      const el = card.querySelector(sel);
      if (el) el.textContent = value;
    };
    setText("[data-impact-name]", name);
    setText("[data-impact-official]", String(official));
    setText("[data-impact-projected]", String(projected));
    const deltaEl = card.querySelector("[data-impact-delta]");
    if (deltaEl) {
      deltaEl.textContent = `${fmtSigned(delta)} EN VIVO`;
      deltaEl.dataset.trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    }

    // Capa 2: matriz de 4 variables (Final 1 / Final 2 / 1o / 2o).
    const lineByKey = (predicate) => (me.lines ?? []).find(predicate) ?? null;
    const predByMatch = (matchId) =>
      predictions.find((p) => p.playerId === pid && p.matchId === matchId) ?? null;
    const qpFor = (position) =>
      qualifiedPredictions.find(
        (q) => q.playerId === pid && q.groupId === activeGroupId && q.position === position
      )?.teamId ?? null;

    const fillRow = (key, { variable, pred, now, type, token, pts }) => {
      const tr = card.querySelector(`[data-impact-row="${key}"]`);
      if (!tr) return;
      const set = (sel, value) => {
        const el = tr.querySelector(sel);
        if (el) el.textContent = value;
      };
      set("[data-im-var]", variable);
      set("[data-im-pred]", pred);
      set("[data-im-now]", now);
      const typeEl = tr.querySelector("[data-im-type]");
      if (typeEl) {
        typeEl.textContent = type;
        typeEl.dataset.token = token;
      }
      set("[data-im-pts]", pts);
    };

    let matrixTotal = 0;
    // Filas de partido (los dos finales).
    finals.forEach((match, index) => {
      const line = lineByKey((l) => l.origen === "match" && l.evento === match.id);
      const pred = predByMatch(match.id);
      const eff = effByMatch.get(match.id) ?? null;
      const meta = MATCH_TYPE[line?.regla] ?? MATCH_TYPE.none;
      const pts = line ? line.puntos : 0;
      matrixTotal += pts;
      fillRow(index === 0 ? "final1" : "final2", {
        variable: `${codeOf(match.homeTeam?.id)}–${codeOf(match.awayTeam?.id)}`,
        pred: pred ? `${pred.homeScore}-${pred.awayScore}` : "—",
        now: eff ? `${eff.homeScore}-${eff.awayScore}` : "POR INICIAR",
        type: line ? meta.label : "SIN INFO",
        token: meta.token,
        pts: fmtSigned(pts),
      });
    });

    // Filas de clasificacion (1o / 2o). Defensa BLOQUEADO (no pasa en F6).
    const groupBlocked = sit.definitionStarted === false && sit.state !== "final";
    [
      { key: "first", position: 1, current: sit.first, badge: "1o de grupo" },
      { key: "second", position: 2, current: sit.second, badge: "2o de grupo" },
    ].forEach(({ key, position, current, badge }) => {
      if (groupBlocked) {
        fillRow(key, { variable: badge, pred: "—", now: "—", type: "BLOQUEADO", token: "locked", pts: "—" });
        return;
      }
      const line = lineByKey((l) => l.origen === "group" && l.group === activeGroupId && l.evento === key);
      const meta = GROUP_TYPE[line?.regla] ?? GROUP_TYPE.group_miss;
      const pts = line ? line.puntos : 0;
      matrixTotal += pts;
      fillRow(key, {
        variable: badge,
        pred: codeOf(qpFor(position)),
        now: codeOf(current),
        type: meta.label,
        token: meta.token,
        pts: fmtSigned(pts),
      });
    });

    const foot = card.querySelector("[data-impact-foot]");
    if (foot) foot.textContent = fmtSigned(matrixTotal);
  };

  // ── F8: Cronologia "Que cambio" (SOLO LECTURA) ─────────────────────────────
  // Se arma por DIFERENCIA entre el snapshot anterior y el actual (en cliente). NO usa el
  // `ts` del libro como linea de tiempo: el orden es el de llegada de los snapshots. Cero
  // formula nueva: lee effectiveByMatch / situations / byPlayer que el recompute ya produjo.
  const feed = center?.querySelector("[data-what-changed-feed]");
  const FEED_CAP = 200; // tope para no crecer infinito
  const teamLabels = Object.fromEntries(teams.map((t) => [t.id, t.shortCode]));
  const playerLabels = Object.fromEntries(players.map((p) => [p.id, p.name]));

  let prevChangeSnapshot = null; // snapshot derivado del recompute anterior
  let feedItems = []; // lista cronologica (mas nuevo arriba), cap FEED_CAP
  let feedSeq = 0; // id incremental para keys de item
  let feedBatch = 0; // lote (snapshot) en que llego cada grupo de eventos
  let unreadCount = 0; // eventos llegados sin leer (cola)
  let enterTimer = null; // limpieza de la marca de animacion de entrada
  const GROUP_IMPACT_THRESHOLD = 4; // a partir de N impactos en un lote, se agrupan

  const ICON = { goal: "⚽", reorder: "⇅", impact: "+/-", none: "–" };

  // Detecta el filtro "Mi jugador" y su id (igual contrato que F6).
  const feedSelectedPlayer = () => {
    const pid = readSelectedPlayerId();
    return pid && players.some((p) => p.id === pid) ? pid : null;
  };

  // Construye el snapshot derivado que consume el motor de diff. effectiveByMatch cubre
  // TODOS los partidos efectivos (para narrar goles de cualquier partido vivo); situations
  // SOLO lleva grupos EN DEFINICION (gate heredado): nunca eventos de 1o/2o de bloqueados.
  const buildChangeSnapshot = ({ official, live, activeWindow }) => {
    const { byMatch: effectiveByMatch } = resolveEffectiveResults({ official, window: activeWindow });
    const ledger = buildPointLedger({
      players, predictions, qualifiedPredictions, groups,
      fixture: matches, official, live, window: activeWindow, now: Date.now(),
    });
    const situations = {};
    for (const group of groups) {
      const sit = computeGroupSituation(group.id, { group, fixture: matches, official, live });
      // Solo grupos EN DEFINICION (o ya final): los bloqueados no narran 1o/2o.
      if (sit.definitionStarted !== false || sit.state === "final") situations[group.id] = sit;
    }
    const ranking = deriveRanking(ledger.byPlayer, players);
    return { effectiveByMatch, situations, byPlayer: ledger.byPlayer, ranking };
  };

  const isAtTop = () => {
    const list = feed?.querySelector("[data-wcf-list]");
    return !list || list.scrollTop <= 4;
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Crea el <li> de un evento simple (gol / reorder / impact / none).
  const renderItemNode = (item) => {
    const ev = item.event;
    const li = document.createElement("li");
    li.className = "wcf-item";
    li.dataset.type = ev.type;
    li.dataset.sign = ev.sign ?? "neutral";
    if (item.fresh) li.dataset.enter = "1";
    const badge =
      ev.type === "reorder"
        ? ` <span class="wcf-badge" data-pos="1">1o</span><span class="wcf-badge" data-pos="2">2o</span>`
        : "";
    li.innerHTML =
      `<span class="wcf-ico" aria-hidden="true">${escapeHtml(ICON[ev.type] ?? "•")}</span>` +
      `<span class="wcf-text">${escapeHtml(ev.text)}${badge}</span>`;
    return li;
  };

  // Crea el <li> resumen "N jugadores afectados" con sublista expandible (anti-saturacion:
  // un gol que mueve a muchos jugadores no se vuelve N lineas sueltas).
  const renderImpactSummaryNode = (items) => {
    const li = document.createElement("li");
    li.className = "wcf-item";
    li.dataset.type = "impact";
    li.dataset.sign = "neutral";
    if (items.some((it) => it.fresh)) li.dataset.enter = "1";
    const subItems = items
      .map((it) => `<li class="wcf-subitem">${escapeHtml(it.event.text)}</li>`)
      .join("");
    li.innerHTML =
      `<span class="wcf-ico" aria-hidden="true">${escapeHtml(ICON.impact)}</span>` +
      `<span class="wcf-text">${items.length} jugadores afectados` +
      `<div class="wcf-summary">` +
      `<button type="button" class="wcf-more" data-wcf-more aria-expanded="false">Ver detalle</button>` +
      `<ul class="wcf-sublist" data-wcf-sublist hidden>${subItems}</ul>` +
      `</div></span>`;
    return li;
  };

  // Agrupa los impactos de un mismo lote (snapshot) cuando son muchos: 1 resumen
  // "N afectados" expandible en vez de N items sueltos. En "Mi jugador" no se agrupa.
  const renderFeed = () => {
    if (!feed) return;
    const list = feed.querySelector("[data-wcf-list]");
    const empty = feed.querySelector("[data-wcf-empty]");
    if (!list) return;
    const filter = feed.dataset.filter === "mine" ? "mine" : "all";
    const myId = feedSelectedPlayer();

    const visible = feedItems.filter((item) => {
      if (filter === "all") return true;
      // Mi jugador: eventos de ese jugador (impact/none) o eventos sin jugador (gol/reorder).
      if (item.event.playerId) return item.event.playerId === myId;
      return false;
    });

    list.innerHTML = "";
    if (empty) empty.hidden = !(filter === "mine" && visible.length === 0);

    // Recorrido en orden (mas nuevo arriba). Agrupa rachas de impactos del MISMO lote.
    let i = 0;
    while (i < visible.length) {
      const item = visible[i];
      if (filter === "all" && item.event.type === "impact") {
        // junta los impactos contiguos del mismo lote
        const batch = item.batch;
        let j = i;
        const run = [];
        while (j < visible.length && visible[j].event.type === "impact" && visible[j].batch === batch) {
          run.push(visible[j]);
          j += 1;
        }
        if (run.length >= GROUP_IMPACT_THRESHOLD) {
          list.append(renderImpactSummaryNode(run));
        } else {
          for (const it of run) list.append(renderItemNode(it));
        }
        i = j;
        continue;
      }
      list.append(renderItemNode(item));
      i += 1;
    }

    // Limpiar la marca de animacion para que no re-anime en el proximo repaint.
    if (enterTimer) window.clearTimeout(enterTimer);
    enterTimer = window.setTimeout(() => {
      for (const fi of feedItems) fi.fresh = false;
      list.querySelectorAll('[data-enter="1"]').forEach((el) => el.removeAttribute("data-enter"));
    }, 300);
  };

  const renderQueue = () => {
    if (!feed) return;
    const pill = feed.querySelector("[data-wcf-queue]");
    const count = feed.querySelector("[data-wcf-queue-count]");
    if (!pill) return;
    if (unreadCount > 0) {
      if (count) count.textContent = String(unreadCount);
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  };

  // Aplica el diff (lista de eventos nuevos) a la cronologia acumulada.
  const pushEvents = (events) => {
    if (!events.length) return;
    const wasAtTop = isAtTop();
    const batch = ++feedBatch;
    for (const ev of events) {
      feedItems.unshift({ id: ++feedSeq, batch, event: ev, fresh: true });
    }
    if (feedItems.length > FEED_CAP) feedItems.length = FEED_CAP;
    if (!wasAtTop) unreadCount += events.length;
    renderFeed();
    renderQueue();
    if (wasAtTop) {
      const list = feed?.querySelector("[data-wcf-list]");
      if (list) list.scrollTop = 0;
    }
  };

  // Recalcula el diff y empuja los eventos nuevos. Para el filtro "Mi jugador" pide el
  // "0 se explica" (none) de ese jugador. forPlayerId NO altera goles/reorder/impactos.
  // `centerActive` decide si el feed (que vive DENTRO del centro) es visible: la cronologia
  // es la pelicula de la definicion simultanea, asi que se muestra cuando el centro lo esta.
  // El diff (prevChangeSnapshot) SIEMPRE avanza para no perder la linea base entre snapshots.
  const updateFeed = (snapshot, centerActive) => {
    if (!feed) {
      prevChangeSnapshot = snapshot;
      return;
    }
    const myId = feedSelectedPlayer();
    const events = buildChangeEvents({
      prev: prevChangeSnapshot,
      curr: snapshot,
      players,
      fixture: matches,
      teamLabels,
      playerLabels,
      forPlayerId: myId,
    });
    // Solo acumulamos/mostramos en contexto de definicion (cero regresion sin centro).
    if (centerActive && events.length) pushEvents(events);
    feed.dataset.active = centerActive && feedItems.length > 0 ? "true" : "false";
    if (!centerActive) renderQueue();
    prevChangeSnapshot = snapshot;
  };

  const recomputeCenter = (snapshot) => {
    if (!center) return;
    const official = snapshot?.officialResults ?? [];
    const live = extractLive(snapshot);
    const now = Date.now();
    const activeWindow = resolveActiveWindow({ fixture: matches, official, live, now });
    const activeGroupId = resolveActiveGroupId(activeWindow);

    // F8: la cronologia se arma por diff de snapshots reusando este unico recompute. Sin
    // grupo en definicion el centro (y el feed anidado) queda oculto -> cero regresion.
    updateFeed(buildChangeSnapshot({ official, live, activeWindow }), Boolean(activeGroupId));

    if (!activeGroupId) {
      center.dataset.active = "false";
      return;
    }
    center.dataset.active = "true";

    const group = groups.find((g) => g.id === activeGroupId);
    const groupNode = center.querySelector("[data-gdc-group]");
    if (groupNode) groupNode.textContent = activeGroupId;

    const finals = orderedFinals(activeGroupId).map((m) => matchById.get(m.id) ?? m);
    const { byMatch: effByMatch } = resolveEffectiveResults({ official, window: activeWindow });
    renderBoards(finals, effByMatch);

    const sit = computeGroupSituation(activeGroupId, { group, fixture: matches, official, live });
    if (sit.definitionStarted === false && sit.state !== "final") {
      // Defensa: sin definicion no se pinta la tabla viva (no deberia ocurrir en F6).
      center.dataset.active = "false";
      return;
    }
    renderStandings(sit);

    const ledger = buildPointLedger({
      players,
      predictions,
      qualifiedPredictions,
      groups,
      fixture: matches,
      official,
      live,
      window: activeWindow,
      now,
    });
    let pid = readSelectedPlayerId();
    if (!pid || !ledger.byPlayer[pid]) pid = players[0]?.id;
    const me = pid ? ledger.byPlayer[pid] : null;
    renderImpact(activeGroupId, sit, me, pid, effByMatch, finals);
  };

  section.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // F8: filtros Todos / Mi jugador.
    const filterBtn = target.closest("[data-wcf-filter]");
    if (filterBtn && feed && feed.contains(filterBtn)) {
      const value = filterBtn.dataset.wcfFilter === "mine" ? "mine" : "all";
      feed.dataset.filter = value;
      feed.querySelectorAll("[data-wcf-filter]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.wcfFilter === value));
      });
      renderFeed();
      return;
    }

    // F8: cola "N cambios nuevos" -> ir al tope y marcar leidos.
    const queueBtn = target.closest("[data-wcf-queue]");
    if (queueBtn && feed && feed.contains(queueBtn)) {
      const list = feed.querySelector("[data-wcf-list]");
      if (list) list.scrollTop = 0;
      unreadCount = 0;
      renderQueue();
      return;
    }

    // F8: expandir/colapsar el resumen "N jugadores afectados".
    const moreBtn = target.closest("[data-wcf-more]");
    if (moreBtn && feed && feed.contains(moreBtn)) {
      const sublist = moreBtn.parentElement?.querySelector("[data-wcf-sublist]");
      if (sublist) {
        const open = sublist.hasAttribute("hidden");
        if (open) sublist.removeAttribute("hidden");
        else sublist.setAttribute("hidden", "");
        moreBtn.setAttribute("aria-expanded", String(open));
      }
      return;
    }

    // Capa 2: plegar/desplegar el detalle de 4 variables.
    const toggle = target.closest("[data-impact-toggle]");
    if (toggle && section.contains(toggle)) {
      const card = toggle.closest("[data-your-impact-card]");
      const detail = card?.querySelector("[data-impact-detail]");
      if (detail) {
        const open = detail.hasAttribute("hidden");
        if (open) detail.removeAttribute("hidden");
        else detail.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", String(open));
      }
      return;
    }

    const cta = target.closest("[data-prediction-cta]");
    if (!cta || !section.contains(cta)) return;
    persistPredictionGroupIntent(cta.dataset.predictionGroup || section.dataset.primaryGroupId || "A");
  });

  // Los partidos con resultado oficial quedan fuera del "proximo": el partido
  // destacado avanza apenas Admin oficializa, sin esperar la ventana horaria.
  const recompute = (officialResults = []) => {
    const officialIds = new Set(
      (Array.isArray(officialResults) ? officialResults : [])
        .filter((result) => result && result.matchId)
        .map((result) => result.matchId)
    );
    const openMatches = matches.filter((match) => !officialIds.has(match.id));
    const relevant = getRelevantMatches(openMatches.length ? openMatches : matches, new Date());
    const primaryMatch = relevant.primaryMatch;
    if (!primaryMatch) return;
    if (section.dataset.primaryMatchId === primaryMatch.id) {
      startCountdown(primaryMatch.dateUtc, relevant.displayMode);
    } else {
      renderMatch(relevant);
    }
  };

  // Un solo dueno del dataset/subscripcion: el mismo snapshot alimenta el "proximo
  // partido" y el Centro de definicion. No abrir un segundo subscribeLiveData.
  recompute([]);
  recomputeCenter({});
  subscribeLiveData((snapshot) => {
    recompute(snapshot?.officialResults ?? []);
    recomputeCenter(snapshot);
  });
})();
