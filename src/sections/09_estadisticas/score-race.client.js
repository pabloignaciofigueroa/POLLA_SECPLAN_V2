// Carrera de Puntaje — render + interacciones del gráfico (scoped a estadisticas).
//
// NO se suscribe ni hace fetch: estadisticas.client.js (dueño único del dataset
// y de subscribeLiveData) instancia createScoreRace() y le pasa {dataset,
// liveSnapshot} en cada snapshot. Reusa el puntaje 5/3/1/0 (vía el builder, que
// importa liveScoring) y el tri-estado (resolveLiveMatchPhase). GSAP se importa
// lazy solo aquí y se omite con prefers-reduced-motion.

import players from "../../data/players.json";
import fixtureData from "../../data/fixture.json";
import officialBaseline from "../../data/official-results.json";
import { buildScoreRaceTimeline } from "../../lib/statistics/buildScoreRaceTimeline.js";
import { buildScoreRaceNarrative } from "../../lib/statistics/buildScoreRaceNarrative.js";
import { resolveLiveMatchPhase } from "../../lib/liveMatch/liveMatchPhase.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HIT_LABEL = {
  lone_wolf: "+5 Lone Wolf",
  exact: "+3 Exacto",
  tendency: "+1 Tendencia",
  none: "Sin puntos",
  no_info: "Sin info",
};

// PAD.left = gutter del eje Y; LEAD/TRAIL separan los datos del eje y del borde
// (asi los nodos de la primera columna no tapan las etiquetas del eje).
const PAD = { top: 18, right: 22, bottom: 36, left: 38 };
const LEAD = 16;
const TRAIL = 14;
const RAIL_W = 180; // ancho fijo del riel "posición" con nombre (debe coincidir con la CSS)
const CANVAS_GAP = 8; // gap del grid .race-canvas (0.5rem)
const MIN_COL = 60; // ancho minimo por partido antes de hacer scroll
const PLOT_H = 300;

const matchById = new Map(fixtureData.matches.map((m) => [m.id, m]));
const matchIdByNumber = new Map(fixtureData.matches.map((m) => [m.matchNumber, m.id]));

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const readSelectedPlayerId = () => {
  try {
    return window.localStorage.getItem("polla:selectedPlayerId");
  } catch {
    return null;
  }
};

const dotSpan = (hitType) => {
  const i = document.createElement("i");
  i.className = "race-dot";
  i.dataset.hitType = hitType;
  i.setAttribute("aria-hidden", "true");
  return i;
};

export function createScoreRace({ section }) {
  const root = section.querySelector("[data-score-race]");
  if (!root) return { update() {} };

  const el = {
    graph: root.querySelector("[data-score-race-graph]"),
    canvas: root.querySelector("[data-score-race-canvas]"),
    legend: root.querySelector("[data-score-race-legend]"),
    legendCount: root.querySelector("[data-score-race-legend-count]"),
    narrTitle: root.querySelector("[data-score-race-narrative-title]"),
    narr: root.querySelector("[data-score-race-narrative]"),
    timeline: root.querySelector("[data-score-race-timeline]"),
    popup: root.querySelector("[data-score-race-popup]"),
    popupTitle: root.querySelector("[data-score-race-popup-title]"),
    popupKicker: root.querySelector("[data-score-race-popup-kicker]"),
    popupBody: root.querySelector("[data-score-race-popup-body]"),
    popupClose: root.querySelector("[data-score-race-popup-close]"),
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const youId = readSelectedPlayerId();

  const state = {
    timeline: null,
    narrative: null,
    selectedIndex: -1,
    focusPlayerId: null,
    hoverPlayerId: null,
    signature: "",
    gsap: null,
    gsapTried: false,
    floating: null,
    animated: false,
  };

  // ── Pop-up (accesible) ──────────────────────────────────────────────────
  const closePopup = () => {
    if (el.popup?.open) el.popup.close();
  };
  el.popupClose?.addEventListener("click", closePopup);
  el.popup?.addEventListener("click", (event) => {
    // click en el backdrop (fuera del inner) cierra.
    if (event.target === el.popup) closePopup();
  });

  // ── Resultados oficiales: baseline commiteado + overlay en vivo ─────────
  // El baseline (src/data/official-results.json, snapshot de polla_official_results)
  // garantiza que el gráfico dibuje los partidos cerrados al instante, sin
  // depender del handshake en vivo. El snapshot remoto gana por matchId (corrige
  // o agrega partidos nuevos que cierre el Admin).
  const mergeOfficials = (live = []) => {
    const byId = new Map();
    for (const r of officialBaseline.results ?? []) if (r?.matchId) byId.set(r.matchId, r);
    for (const r of live ?? []) if (r?.matchId) byId.set(r.matchId, r); // el vivo manda
    return [...byId.values()];
  };

  const normalizeOfficials = (officialResults = []) =>
    officialResults
      .map((r) => ({
        matchId: r.matchId,
        homeScore: Number(r.homeTeamScore ?? r.homeScore),
        awayScore: Number(r.awayTeamScore ?? r.awayScore),
      }))
      .filter((r) => r.matchId && Number.isInteger(r.homeScore) && Number.isInteger(r.awayScore));

  const resolveLive = (liveMatch, officialResults) => {
    if (!liveMatch) return null;
    const matchId = liveMatch.matchId ?? matchIdByNumber.get(liveMatch.matchNumber);
    if (!matchId) return null;
    const phase = resolveLiveMatchPhase({
      liveMatch,
      fixtureMatch: matchById.get(matchId) ?? null,
      officialResults,
    });
    if (phase !== "live") return null;
    const homeScore = Number(liveMatch.homeTeamScore ?? liveMatch.homeScore);
    const awayScore = Number(liveMatch.awayTeamScore ?? liveMatch.awayScore);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return null;
    return { matchId, homeScore, awayScore };
  };

  // ── Geometría dinámica: el gráfico llena el ancho de la card y se comprime
  //    a medida que entran partidos; solo hace scroll cuando col < MIN_COL. ──
  const geom = () => {
    const matches = state.timeline.matches;
    const n = matches.length;
    const maxCum = Math.max(state.timeline.maxCumulative, 1);
    const height = PAD.top + PLOT_H + PAD.bottom;

    // Ancho realmente disponible para el plot (card menos el riel fijo + gap).
    const canvasW = el.canvas?.clientWidth || 640;
    const available = Math.max(360, canvasW - RAIL_W - CANVAS_GAP);

    // Margen interno entre el eje/borde y los datos.
    const innerSpan = available - PAD.left - LEAD - PAD.right - TRAIL;
    const colFill = n <= 1 ? innerSpan : innerSpan / (n - 1);

    let width;
    let col;
    if (colFill >= MIN_COL) {
      width = available; // llena la card
      col = colFill;
    } else {
      col = MIN_COL; // demasiados partidos: columnas al mínimo y scroll
      width = PAD.left + LEAD + Math.max(1, n - 1) * MIN_COL + TRAIL + PAD.right;
    }

    const dataLeft = PAD.left + LEAD;
    const dataRight = width - PAD.right - TRAIL;
    const xFor = (i) => (n === 1 ? (dataLeft + dataRight) / 2 : dataLeft + i * col);
    const yFor = (cum) => PAD.top + PLOT_H - (cum / maxCum) * PLOT_H;
    return { matches, n, maxCum, width, height, col, xFor, yFor };
  };

  // ── Foco visual (hover/click jugador) ───────────────────────────────────
  const effectiveFocus = () => state.focusPlayerId || state.hoverPlayerId;

  const applyFocusVisual = () => {
    const pid = effectiveFocus();
    root.classList.toggle("is-focusing", Boolean(pid));
    root.querySelectorAll("[data-player-id]").forEach((node) => {
      node.classList.toggle("is-focus", Boolean(pid) && node.dataset.playerId === pid);
    });
  };

  const showFloating = (pid, clientX, clientY) => {
    if (!state.floating || !pid) return;
    const row = state.timeline.players.find((p) => p.playerId === pid);
    if (!row) return;
    const idx = state.selectedIndex;
    const pts = row.totals[idx]?.cumulativePoints ?? 0;
    state.floating.innerHTML = `<img src="${row.avatar}" alt=""><span>${row.displayName}</span><strong>${pts} pts</strong>`;
    const rect = el.graph.getBoundingClientRect();
    state.floating.style.left = `${clientX - rect.left}px`;
    state.floating.style.top = `${clientY - rect.top}px`;
    state.floating.dataset.show = "true";
  };
  const hideFloating = () => {
    if (state.floating) state.floating.dataset.show = "false";
  };

  const focusPlayer = (pid) => {
    state.focusPlayerId = state.focusPlayerId === pid ? null : pid;
    applyFocusVisual();
    renderNarrative();
  };

  // ── Render: SVG del gráfico ─────────────────────────────────────────────
  const renderGraph = () => {
    const g = geom();
    el.canvas.replaceChildren();

    const scroll = document.createElement("div");
    scroll.className = "race-scroll";
    const svg = svgEl("svg", {
      class: "race-svg",
      viewBox: `0 0 ${g.width} ${g.height}`,
      role: "img",
      "aria-label": "Gráfico de puntaje acumulado por jugador",
    });
    // Tamaño real en px: 1:1 con el viewBox. El scroll solo aparece si g.width
    // supera el ancho del contenedor (muchos partidos).
    svg.style.width = `${g.width}px`;
    svg.style.height = `${g.height}px`;

    // Rejilla Y + etiquetas de puntos.
    const ySteps = niceSteps(g.maxCum);
    for (const v of ySteps) {
      const y = g.yFor(v);
      svg.append(svgEl("line", { class: "race-grid-line", x1: PAD.left, y1: y, x2: g.width - PAD.right, y2: y }));
      const label = svgEl("text", { class: "race-axis-label", x: PAD.left - 6, y: y + 3, "text-anchor": "end" });
      label.textContent = String(v);
      svg.append(label);
    }

    // Columnas (clickeables) + ticks X.
    const colW = g.col || MIN_COL;
    g.matches.forEach((m, i) => {
      const x = g.xFor(i);
      const col = svgEl("rect", {
        class: "race-xcol",
        x: x - colW / 2,
        y: PAD.top,
        width: colW,
        height: PLOT_H + 8,
        "data-match-index": i,
      });
      if (i === state.selectedIndex) {
        svg.append(svgEl("rect", { class: "race-col-highlight", x: x - colW / 2, y: PAD.top, width: colW, height: PLOT_H }));
      }
      svg.append(col);
      const tick = svgEl("text", { class: "race-xtick", x, y: g.height - 18, "text-anchor": "middle" });
      tick.textContent = `P${m.matchNumber}`;
      svg.append(tick);
      const res = svgEl("text", { class: "race-xresult", x, y: g.height - 6, "text-anchor": "middle" });
      res.textContent = m.status === "live" ? `${m.homeScore}-${m.awayScore}*` : `${m.homeScore}-${m.awayScore}`;
      svg.append(res);
      col.addEventListener("click", () => selectMatch(i));
    });

    // Líneas por jugador + hit-area transparente para hover.
    const linesGroup = svgEl("g");
    const hitGroup = svgEl("g");
    state.timeline.players.forEach((row) => {
      const d = row.totals
        .map((t, i) => `${i === 0 ? "M" : "L"} ${g.xFor(i)} ${g.yFor(t.cumulativePoints)}`)
        .join(" ");
      const liveSeg = g.matches.some((m) => m.status === "live");
      const path = svgEl("path", {
        class: `race-line${row.playerId === youId ? " is-you" : ""}`,
        d,
        "data-player-id": row.playerId,
        "data-status": liveSeg ? "live" : "official",
        style: `--c:${row.color}`,
      });
      linesGroup.append(path);

      const hit = svgEl("path", {
        class: "race-hit",
        d,
        fill: "none",
        stroke: "transparent",
        "stroke-width": 14,
        "data-player-id": row.playerId,
        style: "cursor:pointer",
      });
      hit.addEventListener("mouseenter", () => {
        state.hoverPlayerId = row.playerId;
        applyFocusVisual();
      });
      hit.addEventListener("mousemove", (e) => showFloating(row.playerId, e.clientX, e.clientY));
      hit.addEventListener("mouseleave", () => {
        state.hoverPlayerId = null;
        applyFocusVisual();
        hideFloating();
      });
      hit.addEventListener("click", () => focusPlayer(row.playerId));
      hitGroup.append(hit);
    });
    svg.append(linesGroup, hitGroup);

    // Nodos agrupados.
    const matchIndexById = new Map(g.matches.map((m, i) => [m.matchId, i]));
    const nodesGroup = svgEl("g");
    state.timeline.clusters.forEach((cl) => {
      const i = matchIndexById.get(cl.matchId);
      if (i == null) return;
      const x = g.xFor(i);
      const y = g.yFor(cl.cumulativePoints);
      const isLive = g.matches[i].status === "live";
      const node = svgEl("g", {
        class: `race-node${isLive ? " is-live" : ""}`,
        transform: `translate(${x} ${y})`,
        "data-hit-type": cl.maxHitTypeInCluster,
        "data-match-index": i,
        "data-cumulative": cl.cumulativePoints,
        tabindex: "0",
        role: "button",
        "aria-label": `Partido ${g.matches[i].matchNumber}, ${cl.cumulativePoints} puntos, ${cl.count} ${cl.count === 1 ? "jugador" : "jugadores"}`,
      });
      node.append(svgEl("circle", { r: cl.count > 1 ? 11 : 6.5, cx: 0, cy: 0 }));
      if (cl.count > 1) {
        const badge = svgEl("text", { class: "race-node-badge", x: 0, y: 0 });
        badge.textContent = String(cl.count);
        node.append(badge);
      }
      const open = () => openClusterPopup(cl, i);
      node.addEventListener("click", open);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      nodesGroup.append(node);
    });
    svg.append(nodesGroup);

    scroll.append(svg);

    // Etiqueta flotante.
    if (!state.floating) {
      state.floating = document.createElement("div");
      state.floating.className = "race-floating";
      state.floating.dataset.show = "false";
      el.graph.append(state.floating);
    }

    // Columna "posición actual" a la IZQUIERDA + el gráfico a la derecha.
    const rail = renderRail();
    el.canvas.append(rail, scroll);

    applyFocusVisual();
    if (!reducedMotion && !state.animated) animateEntrance(svg);
    state.animated = true;
  };

  const renderRail = () => {
    const idx = state.selectedIndex;
    const rail = document.createElement("div");
    rail.className = "race-rail";
    rail.setAttribute("data-score-race-rail", "");
    const head = document.createElement("span");
    head.className = "race-rail-head";
    head.textContent = "Posición";
    rail.append(head);

    const ordered = [...state.timeline.players].sort(
      (a, b) => (a.totals[idx]?.rankAfterMatch ?? 99) - (b.totals[idx]?.rankAfterMatch ?? 99)
    );
    ordered.forEach((row) => {
      const t = row.totals[idx];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "race-rail-item";
      item.dataset.playerId = row.playerId;
      item.style.setProperty("--c", row.color);
      item.innerHTML = `<span class="race-rail-pos">${t?.rankAfterMatch ?? "-"}</span><img class="race-rail-avatar" src="${row.avatar}" alt="" style="--c:${row.color}"><span class="race-rail-name">${escapeHtml(row.displayName)}</span><span class="race-rail-pts">${t?.cumulativePoints ?? 0}</span>`;
      item.addEventListener("mouseenter", () => {
        state.hoverPlayerId = row.playerId;
        applyFocusVisual();
      });
      item.addEventListener("mouseleave", () => {
        state.hoverPlayerId = null;
        applyFocusVisual();
      });
      item.addEventListener("click", () => focusPlayer(row.playerId));
      rail.append(item);
    });
    return rail;
  };

  // ── Render: leyenda de jugadores ────────────────────────────────────────
  const renderLegend = () => {
    if (!el.legend) return;
    el.legend.replaceChildren();
    if (el.legendCount) el.legendCount.textContent = `(${state.timeline.players.length})`;
    const idx = state.selectedIndex;
    const ordered = [...state.timeline.players].sort(
      (a, b) => (a.totals[idx]?.rankAfterMatch ?? 99) - (b.totals[idx]?.rankAfterMatch ?? 99)
    );
    ordered.forEach((row) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "race-chip";
      chip.dataset.playerId = row.playerId;
      chip.style.setProperty("--c", row.color);
      // Pintado por puntaje del partido seleccionado (morado/azul/verde/gris).
      chip.dataset.hitType = row.totals[idx]?.hitType ?? "none";
      if (row.playerId === youId) chip.dataset.you = "true";
      chip.innerHTML = `<img src="${row.avatar}" alt="" style="--c:${row.color}"><span>${row.displayName}</span>${row.playerId === youId ? '<span class="race-you-badge">TU LÍNEA</span>' : ""}`;
      chip.addEventListener("mouseenter", () => {
        state.hoverPlayerId = row.playerId;
        applyFocusVisual();
      });
      chip.addEventListener("mouseleave", () => {
        state.hoverPlayerId = null;
        applyFocusVisual();
      });
      chip.addEventListener("click", () => focusPlayer(row.playerId));
      el.legend.append(chip);
    });
  };

  // ── Render: línea de tiempo ─────────────────────────────────────────────
  const renderTimeline = () => {
    if (!el.timeline) return;
    el.timeline.replaceChildren();
    state.timeline.matches.forEach((m, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "race-tl-item";
      item.dataset.status = m.status;
      item.setAttribute("role", "tab");
      item.setAttribute("aria-selected", i === state.selectedIndex ? "true" : "false");
      const result = m.status === "live" ? `${m.homeScore}-${m.awayScore} EN VIVO` : `${m.homeScore}-${m.awayScore}`;
      item.innerHTML = `<span class="race-tl-n">P${m.matchNumber}</span><span class="race-tl-r">${result}</span>`;
      item.addEventListener("click", () => selectMatch(i));
      el.timeline.append(item);
    });
  };

  // ── Render: narrativa ───────────────────────────────────────────────────
  const renderNarrative = () => {
    if (!el.narr) return;
    if (state.focusPlayerId) {
      const pn = state.narrative.playerNarratives[state.focusPlayerId];
      if (pn) {
        if (el.narrTitle) el.narrTitle.textContent = pn.title;
        el.narr.innerHTML = `<p>${escapeHtml(pn.body)}</p>`;
        return;
      }
    }
    const mn = state.narrative.matchNarratives[state.selectedIndex];
    if (!mn) {
      el.narr.innerHTML = '<p class="race-muted">Sin datos para este partido.</p>';
      return;
    }
    if (el.narrTitle) el.narrTitle.textContent = mn.title;
    const live = mn.status === "live" ? '<p class="race-muted">Marcador provisional EN VIVO.</p>' : "";
    el.narr.innerHTML = `${live}<p>${escapeHtml(mn.body)}</p>`;
  };

  // ── Selección de partido ────────────────────────────────────────────────
  const selectMatch = (i) => {
    state.selectedIndex = i;
    renderGraph(); // el rail se reconstruye dentro de renderGraph
    renderLegend();
    renderTimeline();
    renderNarrative();
  };

  // ── Pop-up de nodo agrupado ─────────────────────────────────────────────
  const openClusterPopup = (cluster, matchIndex) => {
    if (!el.popup || !el.popupBody) return;
    const m = state.timeline.matches[matchIndex];
    if (el.popupKicker) {
      el.popupKicker.textContent = `Nodo: ${cluster.cumulativePoints} pts · ${cluster.count} ${cluster.count === 1 ? "jugador" : "jugadores"}`;
    }
    if (el.popupTitle) {
      el.popupTitle.textContent = `Partido ${m.matchNumberLabel} · ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name}`;
    }
    const byId = new Map(state.timeline.players.map((p) => [p.playerId, p]));
    const rows = cluster.playerIds
      .map((pid) => ({ row: byId.get(pid), t: byId.get(pid)?.totals[matchIndex] }))
      .filter((x) => x.row && x.t)
      .sort((a, b) => b.t.pointsEarned - a.t.pointsEarned || a.row.displayName.localeCompare(b.row.displayName));

    el.popupBody.replaceChildren();
    rows.forEach(({ row, t }) => {
      const prow = document.createElement("div");
      prow.className = "race-prow";
      if (row.playerId === youId) prow.dataset.you = "true";
      const img = document.createElement("img");
      img.src = row.avatar;
      img.alt = "";
      const name = document.createElement("span");
      name.className = "race-prow-name";
      name.textContent = row.displayName;
      const pred = document.createElement("span");
      pred.className = "race-prow-pred";
      pred.textContent = t.predictionLabel;
      const pts = document.createElement("span");
      pts.className = "race-prow-pts";
      pts.append(dotSpan(t.hitType), document.createTextNode(t.pointsEarned > 0 ? `+${t.pointsEarned}` : "0"));
      pts.title = HIT_LABEL[t.hitType] ?? "";
      prow.append(img, name, pred, pts);
      el.popupBody.append(prow);
    });

    if (el.popup.open) return; // ya abierto: solo se actualizo el contenido
    if (typeof el.popup.showModal === "function") el.popup.showModal();
    else el.popup.setAttribute("open", "");
  };

  // ── GSAP lazy (solo entrada, progresivo) ────────────────────────────────
  const animateEntrance = async (svg) => {
    if (!state.gsap && !state.gsapTried) {
      state.gsapTried = true;
      try {
        const mod = await import("gsap");
        state.gsap = mod.gsap ?? mod.default ?? null;
      } catch {
        state.gsap = null;
      }
    }
    const gsap = state.gsap;
    if (!gsap) return;
    svg.querySelectorAll(".race-line").forEach((path) => {
      const len = path.getTotalLength?.() ?? 0;
      if (!len) return;
      gsap.fromTo(
        path,
        { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" }
      );
    });
    gsap.fromTo(
      svg.querySelectorAll(".race-node"),
      { scale: 0.6, transformOrigin: "center", opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)", stagger: 0.01 }
    );
  };

  // ── Update público ──────────────────────────────────────────────────────
  const update = ({ dataset, liveSnapshot } = {}) => {
    if (!dataset || !Array.isArray(dataset.predictions)) return;
    const merged = mergeOfficials(liveSnapshot?.officialResults);
    const officials = normalizeOfficials(merged);
    const live = resolveLive(liveSnapshot?.liveMatch, merged);
    const signature = JSON.stringify({
      o: officials.map((r) => `${r.matchId}:${r.homeScore}-${r.awayScore}`).sort(),
      l: live ? `${live.matchId}:${live.homeScore}-${live.awayScore}` : null,
    });
    if (signature === state.signature && state.timeline) return; // memo
    state.signature = signature;

    state.timeline = buildScoreRaceTimeline({
      players,
      predictions: dataset.predictions,
      fixture: fixtureData,
      officialResults: officials,
      liveMatchState: live,
    });
    state.narrative = buildScoreRaceNarrative(state.timeline);

    // Con baseline siempre hay ≥1 partido cerrado; si por algun caso no hay,
    // simplemente no dibujamos (sin mensaje de "aun no hay carrera").
    if (state.timeline.matches.length === 0) {
      if (el.timeline) el.timeline.replaceChildren();
      if (el.legend) el.legend.replaceChildren();
      return;
    }

    // Mantener selección si sigue válida; si no, ir al último partido.
    if (state.selectedIndex < 0 || state.selectedIndex >= state.timeline.matches.length) {
      state.selectedIndex = state.timeline.matches.length - 1;
    }
    // Un nuevo partido oficial reenfoca al último.
    state.selectedIndex = state.timeline.matches.length - 1;
    state.animated = false; // re-dibuja con entrada al cambiar el dataset

    renderGraph();
    renderLegend();
    renderTimeline();
    renderNarrative();
  };

  // Re-llenar el ancho al redimensionar/rotar (sin re-animar). Debounce con rAF.
  if (typeof ResizeObserver === "function") {
    let raf = 0;
    let lastWidth = el.canvas?.clientWidth ?? 0;
    const ro = new ResizeObserver(() => {
      const w = el.canvas?.clientWidth ?? 0;
      if (!state.timeline || w === lastWidth) return;
      lastWidth = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => renderGraph());
    });
    if (el.canvas) ro.observe(el.canvas);
  }

  return { update };
}

// Escala Y "linda": 0..max en pasos legibles.
function niceSteps(max) {
  const target = 5;
  const raw = max / target;
  const step = Math.max(1, Math.round(raw));
  const steps = [];
  for (let v = 0; v <= max; v += step) steps.push(v);
  if (steps[steps.length - 1] !== max) steps.push(max);
  return steps;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
