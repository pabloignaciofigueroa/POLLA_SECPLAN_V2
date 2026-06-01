(() => {
  const section = document.querySelector('[data-section="fixture"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-fixture-payload]");
  const payload = payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const info = payload.info && typeof payload.info === "object" ? payload.info : { defaultInfo: {}, matches: {} };
  const stadiumsByLocation = payload.stadiumsByLocation && typeof payload.stadiumsByLocation === "object"
    ? payload.stadiumsByLocation
    : {};

  const state = {
    stage: payload.initialStage || "group",
    group: payload.initialGroup || "all",
    selectedId: payload.initialSelectedId || (matches[0] && matches[0].id),
  };

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const minutes = (value) => value * 60 * 1000;

  const sameChileDay = (dateChileIso, now) => {
    if (!dateChileIso) return false;
    const matchDay = dateChileIso.slice(0, 10);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return matchDay === formatter.format(now);
  };

  const getStatus = (match, now) => {
    const start = new Date(match.dateUtc).getTime();
    const nowMs = now.getTime();
    const activeWindow = minutes(120);
    if (start <= nowMs && nowMs < start + activeWindow) return "live";
    if (start + activeWindow <= nowMs) return "finished";
    if (sameChileDay(match.dateChile, now)) return "today";
    return "upcoming";
  };

  const statusLabel = (status) => {
    if (status === "today" || status === "upcoming") return "Por jugar";
    switch (status) {
      case "live": return "En vivo";
      case "finished": return "Finalizado";
      case "today": return "Hoy";
      default: return "Proximo";
    }
  };

  const stageHeading = (stage) => {
    switch (stage) {
      case "today": return "Partidos de hoy";
      case "all": return "Calendario completo";
      case "group": return "Fase de grupos";
      case "round-of-16": return "Octavos de final";
      case "quarter": return "Cuartos de final";
      case "semi": return "Semifinales";
      case "final": return "Final";
      default: return "Fixture";
    }
  };

  const formatTime = (iso) =>
    new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Santiago",
    }).format(new Date(iso));

  const formatDateHeader = (iso) =>
    new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "long",
      timeZone: "America/Santiago",
    }).format(new Date(iso)).toUpperCase();

  const formatDateLong = (iso) =>
    new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Santiago",
    }).format(new Date(iso));

  const filterMatches = (stage, group) => {
    const now = new Date();
    let pool = matches;
    if (stage === "today") {
      pool = pool.filter((match) => sameChileDay(match.dateChile, now));
    } else if (stage === "group") {
      pool = pool.filter((match) => (match.stage || "").toLowerCase().startsWith("fase de grupos"));
    } else if (["round-of-16", "quarter", "semi", "final"].includes(stage)) {
      pool = [];
    }
    if (group && group !== "all") {
      pool = pool.filter((match) => match.groupId === group);
    }
    return [...pool].sort((a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime());
  };

  const groupByDate = (list) => {
    const buckets = new Map();
    for (const match of list) {
      const key = match.dateChile.slice(0, 10);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(match);
    }
    return Array.from(buckets.entries()).map(([dateKey, dateMatches]) => ({ dateKey, matches: dateMatches }));
  };

  const getInfoForMatch = (matchId) =>
    (info.matches && info.matches[matchId]) || info.defaultInfo || {};

  const getAgendaMatches = (match) => {
    if (!match) return [];
    const dateKey = match.dateChile.slice(0, 10);
    return matches
      .filter((item) => item.dateChile.slice(0, 10) === dateKey)
      .sort((a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime())
      .slice(0, 5);
  };

  const renderRow = (match, selected, status) => {
    const groupBadge = (match.groupLabel || "").replace("Grupo ", "G ");
    const matchNumber = String(match.matchNumber).padStart(2, "0");
    return `<li><button type="button" class="match-row" data-match-row="${escapeHtml(match.id)}" data-status="${status}" data-selected="${selected ? "true" : "false"}" data-group-key="${escapeHtml((match.groupId || "").toLowerCase())}" aria-pressed="${selected ? "true" : "false"}">`
      + `<span class="match-number">${escapeHtml(matchNumber)}</span>`
      + `<span class="time">${escapeHtml(formatTime(match.dateUtc))}</span>`
      + `<span class="team home"><span class="flag" aria-hidden="true"><img src="/assets/flags/${escapeHtml(match.homeTeam.id)}.svg" alt="" loading="lazy" decoding="async" width="48" height="36"></span><span class="team-name">${escapeHtml(match.homeTeam.name)}</span></span>`
      + `<span class="separator">VS</span>`
      + `<span class="team away"><span class="team-name">${escapeHtml(match.awayTeam.name)}</span><span class="flag" aria-hidden="true"><img src="/assets/flags/${escapeHtml(match.awayTeam.id)}.svg" alt="" loading="lazy" decoding="async" width="48" height="36"></span></span>`
      + `<span class="group-badge">${escapeHtml(groupBadge)}</span>`
      + `<span class="status-pill">${escapeHtml(statusLabel(status))}</span>`
      + `</button></li>`;
  };

  const renderAgenda = (match) => {
    const agendaRows = section.querySelector("[data-agenda-rows]");
    const agendaCount = section.querySelector("[data-agenda-count]");
    if (!agendaRows || !agendaCount) return;

    const now = new Date();
    const agendaMatches = getAgendaMatches(match);
    agendaCount.textContent = sameChileDay(match.dateChile, now)
      ? `${agendaMatches.length} partidos hoy`
      : `${agendaMatches.length} partidos`;

    if (agendaMatches.length === 0) {
      agendaRows.innerHTML = '<li class="empty"><span>Sin partidos programados para esta fecha.</span></li>';
      return;
    }

    agendaRows.innerHTML = agendaMatches.map((item) => {
      const status = getStatus(item, now);
      return `<li>`
        + `<span class="time">${escapeHtml(formatTime(item.dateUtc))}</span>`
        + `<span class="matchline">`
        + `<span class="team home">${escapeHtml(item.homeTeam.name)}</span>`
        + `<span class="vs" aria-hidden="true">vs</span>`
        + `<span class="team away">${escapeHtml(item.awayTeam.name)}</span>`
        + `<span class="group">${escapeHtml(item.groupLabel.replace("Grupo ", "G "))}</span>`
        + `</span>`
        + `<span class="status" data-status="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`
        + `</li>`;
    }).join("");
  };

  const renderList = () => {
    const listPanel = section.querySelector("[data-day-stack]");
    if (!listPanel) return [];
    const heading = section.querySelector("[data-list-heading]");
    if (heading) heading.textContent = stageHeading(state.stage);

    const filtered = filterMatches(state.stage, state.group);
    if (filtered.length === 0) {
      listPanel.innerHTML = `<div class="empty-state" data-empty-state>`
        + `<p class="empty-title">Sin partidos para este filtro</p>`
        + `<p class="empty-hint">Cambia la etapa o el grupo para volver a ver el calendario.</p>`
        + `</div>`;
      return filtered;
    }

    if (!filtered.some((match) => match.id === state.selectedId)) {
      state.selectedId = filtered[0].id;
    }

    const now = new Date();
    const grouped = groupByDate(filtered);
    const firstKey = grouped[0].dateKey;
    listPanel.innerHTML = grouped
      .map(({ dateKey, matches: dayMatches }) => {
        const dateHeader = formatDateHeader(dayMatches[0].dateChile);
        const inlineStageLabel = dateKey === firstKey
          ? `<span class="stage-label">${escapeHtml(stageHeading(state.stage))}</span>`
          : "";
        const rows = dayMatches
          .map((item) => renderRow(item, item.id === state.selectedId, getStatus(item, now)))
          .join("");
        return `<section class="day-group" data-day-group="${escapeHtml(dateKey)}">`
          + `<header class="day-header">${inlineStageLabel}<span class="day-label">${escapeHtml(dateHeader)}</span></header>`
          + `<ul class="day-rows" role="list">${rows}</ul>`
          + `</section>`;
      })
      .join("");

    return filtered;
  };

  const renderSelected = () => {
    const match = matches.find((item) => item.id === state.selectedId);
    if (!match) return;

    const matchInfo = getInfoForMatch(match.id);
    const stadium = (matchInfo.stadium && matchInfo.stadium.name) || match.location;
    const city = matchInfo.stadium && matchInfo.stadium.city;
    const country = matchInfo.stadium && matchInfo.stadium.country;
    const cityLine = city ? (country ? `${city}, ${country}` : city) : "Sede por confirmar";

    const stageNode = section.querySelector("[data-selected-stage]");
    if (stageNode) {
      stageNode.textContent = (match.stage || "").replace(" - fecha ", " / Jornada ");
    }

    const homeFlagSpan = section.querySelector("[data-selected-home-flag]");
    if (homeFlagSpan) {
      homeFlagSpan.innerHTML = `<img src="/assets/flags/${escapeHtml(match.homeTeam.id)}.svg" alt="Bandera ${escapeHtml(match.homeTeam.name)}" loading="lazy" decoding="async" width="160" height="120">`;
    }
    const awayFlagSpan = section.querySelector("[data-selected-away-flag]");
    if (awayFlagSpan) {
      awayFlagSpan.innerHTML = `<img src="/assets/flags/${escapeHtml(match.awayTeam.id)}.svg" alt="Bandera ${escapeHtml(match.awayTeam.name)}" loading="lazy" decoding="async" width="160" height="120">`;
    }

    const assignText = (selector, value) => {
      const node = section.querySelector(selector);
      if (node) node.textContent = value;
    };

    assignText("[data-selected-home-name]", match.homeTeam.name);
    assignText("[data-selected-away-name]", match.awayTeam.name);
    assignText("[data-selected-date]", formatDateLong(match.dateUtc));
    assignText("[data-selected-time]", `${formatTime(match.dateUtc)} hrs`);
    assignText("[data-selected-stadium]", stadium);
    assignText("[data-selected-city]", cityLine);
    assignText("[data-selected-group]", match.groupLabel);

    const refereeLine = matchInfo.referee && matchInfo.referee.name
      ? `${matchInfo.referee.name} (${matchInfo.referee.country || "-"})`
      : "Por confirmar";
    const assistantsLine = matchInfo.assistants && matchInfo.assistants.length
      ? matchInfo.assistants.map((item) => `${item.name}${item.country ? ` (${item.country})` : ""}`).join(", ")
      : "Por confirmar";
    const weather = matchInfo.weather || {};
    const weatherLine = weather.temperatureC != null
      ? `${weather.temperatureC}C / ${weather.condition || "-"}`
      : (weather.condition || "Por confirmar");
    const capacityLine = matchInfo.capacity != null
      ? `${Number(matchInfo.capacity).toLocaleString("es-CL")} espectadores`
      : "Por confirmar";
    const broadcastLine = matchInfo.broadcast && matchInfo.broadcast.length
      ? matchInfo.broadcast.join(" / ")
      : "-";

    assignText("[data-info-referee]", refereeLine);
    assignText("[data-info-assistants]", assistantsLine);
    assignText("[data-info-weather]", weatherLine);
    assignText("[data-info-capacity]", capacityLine);
    assignText("[data-info-broadcast]", broadcastLine);
    assignText("[data-info-stadium-name]", stadium);
    assignText("[data-info-stadium-city]", cityLine);

    const stadiumAsset = stadiumsByLocation[match.location] || stadiumsByLocation[stadium] || null;
    const previewFig = section.querySelector("[data-stadium-preview]");
    if (previewFig) {
      const captionNode = previewFig.querySelector("figcaption");
      previewFig.innerHTML = "";
      if (stadiumAsset) {
        const img = document.createElement("img");
        img.src = stadiumAsset.src;
        img.alt = `Vista del estadio ${stadiumAsset.name}`;
        img.loading = "lazy";
        img.decoding = "async";
        img.width = 1600;
        img.height = 900;
        previewFig.appendChild(img);
      } else {
        const empty = document.createElement("span");
        empty.className = "preview-empty";
        empty.setAttribute("aria-hidden", "true");
        empty.textContent = "stadium-preview";
        previewFig.appendChild(empty);
      }
      if (captionNode) {
        previewFig.appendChild(captionNode);
      }
    }

    renderAgenda(match);
  };

  const updateStageTabs = () => {
    section.querySelectorAll("[data-stage-tab]").forEach((tab) => {
      const isActive = tab.dataset.stageTab === state.stage;
      tab.dataset.active = isActive ? "true" : "false";
      tab.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const bindEvents = () => {
    // Replay de entrada de la lista al re-filtrar (no en la carga inicial).
    const swapList = () => {
      const listPanel = section.querySelector("[data-day-stack]");
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!listPanel || reduce) return;
      listPanel.classList.remove("is-swap-in");
      void listPanel.offsetWidth; // reflow para re-disparar
      listPanel.classList.add("is-swap-in");
    };

    section.querySelectorAll("[data-stage-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const next = tab.dataset.stageTab;
        if (!next || next === state.stage) return;
        state.stage = next;
        updateStageTabs();
        renderList();
        swapList();
        renderSelected();
      });
    });

    const groupSelect = section.querySelector("[data-group-select]");
    if (groupSelect) {
      groupSelect.addEventListener("change", (event) => {
        const value = event.target instanceof HTMLSelectElement ? event.target.value : "all";
        state.group = value;
        renderList();
        swapList();
        renderSelected();
      });
    }

    section.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-match-row]") : null;
      if (!target) return;
      const matchId = target.getAttribute("data-match-row");
      if (!matchId || matchId === state.selectedId) return;
      state.selectedId = matchId;
      section.dataset.initialSelected = matchId;
      section.querySelectorAll("[data-match-row]").forEach((row) => {
        const isSelected = row.getAttribute("data-match-row") === matchId;
        row.setAttribute("data-selected", isSelected ? "true" : "false");
        row.setAttribute("aria-pressed", isSelected ? "true" : "false");
      });
      renderSelected();
      const selectedPanel = section.querySelector("[data-selected-panel]");
      if (selectedPanel && typeof selectedPanel.scrollIntoView === "function") {
        selectedPanel.scrollIntoView({
          behavior: "auto",
          block: "nearest",
        });
      }
    });
  };

  updateStageTabs();
  bindEvents();
})();
