// CARRERA SECPLAN — ranking de eliminatorias (PODIO + ESCALERA + LIVE + PREDICCIONES). 100% local.
// Puntua cartones contra los resultados vivos del admin, reordena en vivo, y suma espectaculo:
// count-up de puntos, barra de progreso, flechas/pildoras de movimiento, podio top-3 con foto,
// y tabla de predicciones por jugador (marcador + a quien le va + puntos dinamicos).
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { deriveLivePodium, resolveBracket } from "../../lib/knockout/bracket.js";
import { buildKnockoutLeaderboard, scoreKnockoutMatch } from "../../lib/knockout/scoring.js";
import { findNextMatch } from "../../lib/knockout/schedule.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";
import { isSupabaseConfigured, fetchSubmissions, fetchResults, subscribeKnockout } from "../../lib/supabase/knockoutData.js";

(() => {
  const section = document.querySelector('[data-section="tabla"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-tabla-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const players = payload.players ?? [];
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };
  const submissions = payload.submissions ?? [];
  const playerById = new Map(players.map((p) => [p.id, p]));
  // Si Supabase está configurado, estos se llenan con lo que hay en la base (drop-in del dataset local).
  let remoteSubmissions = null;
  let remoteResults = null;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const readJson = (k, fb) => { try { const p = JSON.parse(safeGet(k) || "null"); return p && typeof p === "object" ? p : fb; } catch { return fb; } };

  const body = section.querySelector("[data-tabla-body]");
  const noteNode = section.querySelector("[data-tabla-note]");
  const rowById = new Map(players.map((p) => [p.id, section.querySelector(`[data-tabla-row="${p.id}"]`)]));
  const matchNumById = new Map(matches.map((m) => [m.id, m.matchNumber ?? 0]));

  // Cada fila del ranking se despliega para mostrar su HISTORIAL de puntos (cruce a cruce),
  // así nadie puede reclamar cómo le fue. Se cablea una sola vez; el contenido se re-renderiza vivo.
  const toggleRow = (card) => {
    if (!card) return;
    const open = card.getAttribute("aria-expanded") === "true";
    card.setAttribute("aria-expanded", open ? "false" : "true");
    const hist = card.querySelector("[data-tabla-history]");
    if (hist) hist.hidden = open;
  };
  rowById.forEach((card) => {
    if (!card) return;
    card.addEventListener("click", () => toggleRow(card));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(card); }
    });
  });

  const HIT_LABEL = { lone_wolf: "Lone Wolf", exact: "Exacto", tendency: "Tendencia", none: "Sin acierto" };
  // HTML del historial de puntos de un jugador (cruces ya puntuados, orden por número de cruce).
  // Etiquetas del podio mundial (mismo orden y puntaje que scorePodium: +5/+3/+1/+1).
  const POD_SLOT = [
    { key: "champion", medal: "🥇", label: "Campeón" },
    { key: "runnerUp", medal: "🥈", label: "Subcampeón" },
    { key: "third", medal: "🥉", label: "Tercero" },
    { key: "fourth", medal: "4º", label: "Cuarto" },
  ];
  // Desglose del podio de un jugador: su pick vs el real, acierto y puntos. `actualPodium.live`
  // marca lo provisional (final en curso). Se alimenta de row.podiumLines (ya viene de scorePodium).
  const buildPodiumHtml = (row, actualPodium) => {
    const lines = row.podiumLines ?? [];
    if (!lines.length) return "";
    const bySlot = new Map(lines.map((l) => [l.slot, l]));
    const items = POD_SLOT.map(({ key, medal, label }) => {
      const ln = bySlot.get(key);
      if (!ln) return "";
      const isLive = Boolean(actualPodium?.live?.[key]);
      const pick = ln.pick || "—";
      const actual = ln.actual || "—";
      const state = ln.actual ? (ln.hit ? "hit" : "miss") : "pending";
      const mark = state === "hit" ? "✓" : state === "miss" ? "✗" : "—";
      return `<li class="tk-pod-line" data-state="${state}" data-live="${isLive ? "true" : "false"}">`
        + `<span class="tk-pod-slot">${medal} ${label}</span>`
        + `<span class="tk-pod-detail">tú ${pick} · real ${actual}${isLive ? " · en vivo" : ""}</span>`
        + `<span class="tk-pod-mark">${mark}</span>`
        + `<span class="tk-pod-pts">${ln.points > 0 ? "+" : ""}${ln.points}</span></li>`;
    }).join("");
    return `<div class="tk-pod-block"><p class="tk-pod-head">Podio mundial</p><ul class="tk-pod-lines">${items}</ul></div>`;
  };

  const buildHistoryHtml = (row, bucket, live, resolvedById, actualPodium) => {
    const lines = (row.matchLines ?? [])
      .slice()
      .sort((a, b) => (matchNumById.get(a.matchId) ?? 0) - (matchNumById.get(b.matchId) ?? 0));
    if (!lines.length) return '<p class="tk-hist-empty">Aún sin cruces puntuados.</p>';
    const items = lines
      .map((ln) => {
        const r = resolvedById.get(ln.matchId);
        const res = live.results[ln.matchId] || {};
        const pred = bucket[ln.matchId] || {};
        const teams = r ? `${r.slotA.shortCode || "?"} vs ${r.slotB.shortCode || "?"}` : ln.matchId;
        const predScore = pred.homeScore != null && pred.awayScore != null ? `${pred.homeScore}-${pred.awayScore}` : "–";
        const realScore = res.homeScore != null && res.awayScore != null ? `${res.homeScore}-${res.awayScore}` : "–";
        const extras = `${ln.live ? " · en vivo" : ""}${ln.bonus ? " · +1 penales" : ""}`;
        const hit = ln.hitType || "none";
        return `<li class="tk-hist-item" data-live="${ln.live ? "true" : "false"}">`
          + `<span class="tk-hist-match"><span class="tk-hist-teams">${teams}</span>`
          + `<span class="tk-hist-detail">Tu ${predScore} · real ${realScore}${extras}</span></span>`
          + `<span class="tk-hist-badge" data-hit="${hit}">${HIT_LABEL[hit] ?? "—"}</span>`
          + `<span class="tk-hist-pts">${ln.points > 0 ? "+" : ""}${ln.points}</span></li>`;
      })
      .join("");
    const podiumBits = row.podiumPoints > 0 ? ` · Podio +${row.podiumPoints}` : "";
    return `<ul class="tk-hist-list">${items}</ul>`
      + buildPodiumHtml(row, actualPodium)
      + `<div class="tk-hist-foot"><span>Cruces ${row.matchPoints}${podiumBits}</span><b>${row.total} pts</b></div>`;
  };

  // ===== Podio top-3 =====
  const podiumBox = section.querySelector("[data-tabla-podium]");
  const podSlot = { 1: section.querySelector('[data-podium="1"]'), 2: section.querySelector('[data-podium="2"]'), 3: section.querySelector('[data-podium="3"]') };

  // ===== Podio MUNDIAL (campeón/subcampeón/3º/4º) — se llena en vivo desde P103/P104 =====
  const wpodTag = section.querySelector("[data-wpodium-tag]");
  const wpodSlotEl = new Map(
    ["champion", "runnerUp", "third", "fourth"].map((k) => [k, section.querySelector(`[data-wpod="${k}"]`)]),
  );
  // El podio apostado por cada jugador vive en la MISMA fila de predicciones (celdas 🥇🥈🥉4º),
  // junto a su marcador y su total parcial. Una fila = todo lo del jugador.

  // ===== Panel derecho: cruce activo/proximo (live card) + predicciones de jugadores =====
  const cruceBox = section.querySelector("[data-tabla-cruce]");
  const cruceWhen = section.querySelector("[data-tabla-cruce-when]");
  const cruceHome = section.querySelector("[data-tabla-cruce-home]");
  const cruceAway = section.querySelector("[data-tabla-cruce-away]");
  const cruceHomeFlag = section.querySelector("[data-tabla-cruce-home-flag]");
  const cruceAwayFlag = section.querySelector("[data-tabla-cruce-away-flag]");
  const cruceScore = section.querySelector("[data-tabla-cruce-score]");
  const cruceState = section.querySelector("[data-tabla-cruce-state]");
  const predsBox = section.querySelector("[data-tabla-preds]");
  const predRowById = new Map(players.map((p) => [p.id, section.querySelector(`[data-tabla-pred="${p.id}"]`)]));

  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const fmtWhen = (m) => {
    if (!m || !m.dateCL) return "Por definir";
    const p = String(m.dateCL).split("-").map(Number);
    return `${p[2]} ${MES[(p[1] || 1) - 1] || ""} · ${m.timeCL || ""}`;
  };
  const setText = (el, t) => { if (el) el.textContent = t; };
  const setFlag = (el, url) => {
    if (!el) return;
    if (url) { el.style.backgroundImage = `url("${url}")`; el.dataset.empty = "false"; }
    else { el.style.backgroundImage = ""; el.dataset.empty = "true"; }
  };

  // Pinta el podio MUNDIAL. Un slot en data-live="true" es PROVISIONAL: la final sigue en curso
  // y puede cambiar con el próximo gol (por eso late en rojo, igual que la tarjeta del partido).
  const renderWorldPodium = (actualPodium) => {
    let anyLive = false;
    for (const [key, el] of wpodSlotEl) {
      if (!el) continue;
      const code = actualPodium?.[key] ?? null;
      const isLive = Boolean(actualPodium?.live?.[key]) && Boolean(code);
      if (isLive) anyLive = true;
      const team = code ? teamsByCode.get?.(code) : null;
      el.dataset.set = code ? "true" : "false";
      el.dataset.live = isLive ? "true" : "false";
      setText(el.querySelector("[data-wpod-team]"), code ? (team?.shortCode ?? code) : "—");
      setFlag(el.querySelector("[data-wpod-flag]"), team?.flag ?? null);
    }
    if (wpodTag) wpodTag.hidden = !anyLive;
  };

  // Rellena, en la fila de cada jugador, su PODIO apostado (pick por puesto) + puntos de podio +
  // TOTAL parcial. Se alimenta de row.podiumLines/total (mismo scorer del ranking: nunca divergen).
  // No reordena: el orden lo maneja renderPreds (por cercanía al marcador en vivo).
  const renderPodiumPicks = (rows, podiumByPlayer) => {
    const rowByPlayer = new Map(rows.map((r) => [r.playerId, r]));
    for (const [pid, el] of predRowById) {
      if (!el) continue;
      const row = rowByPlayer.get(pid);
      const picks = podiumByPlayer[pid] ?? {};
      const bySlot = new Map((row?.podiumLines ?? []).map((l) => [l.slot, l]));
      for (const { key } of POD_SLOT) {
        const cell = el.querySelector(`[data-wpick="${key}"]`);
        if (!cell) continue;
        const ln = bySlot.get(key);
        const pick = ln?.pick ?? picks[key] ?? null;
        cell.textContent = pick || "—";
        // pending = ese puesto aún no se define (sin resultado todavía).
        cell.dataset.state = !pick || !ln?.actual ? "pending" : ln.hit ? "hit" : "miss";
      }
      const pts = row?.podiumPoints ?? 0;
      setText(el.querySelector("[data-wpick-pts]"), pts > 0 ? `+${pts}` : "0");
      el.dataset.podPos = pts > 0 ? "true" : "false";
    }
  };

  /** Puntos de podio por jugador — alimenta la columna SUMA de la tabla de predicciones. */
  const podiumPtsMap = (rows) => {
    const out = {};
    for (const r of rows) out[r.playerId] = r.podiumPoints ?? 0;
    return out;
  };
  // Puntos por cruce (panel informativo): usa el MISMO scorer del ranking (scoreKnockoutMatch),
  // así el panel y la escalera NUNCA divergen. Incluye LONE WOLF (+5 exacto único) — que exige
  // conocer TODAS las predicciones del cruce: por eso recibe `allForMatch`. (Antes había una copia
  // simplificada acá que daba +3 a cualquier exacto y nunca el +5 del exacto único.)
  const matchPts = (pred, res, allForMatch) => {
    if (!pred || pred.homeScore == null || pred.awayScore == null) return null;
    if (!res || res.homeScore == null || res.awayScore == null) return null;
    return scoreKnockoutMatch(pred, res, allForMatch).points;
  };

  // Tabla de predicciones: cada jugador con su marcador, la bandera del equipo que hace avanzar
  // (a quién le va) y los puntos que suma según el resultado DINÁMICO (cambia con cada gol).
  // Sin cruce en juego, lo que suma cada jugador es solo su podio.
  const renderPredsReset = (podPts = {}) => {
    predRowById.forEach((row, pid) => {
      if (!row) return;
      setText(row.querySelector("[data-pred-score]"), "– : –");
      setText(row.querySelector("[data-pred-adv]"), "–");
      setText(row.querySelector("[data-pred-pts]"), "–");
      const f = row.querySelector("[data-pred-flag]");
      if (f) f.dataset.empty = "true";
      row.dataset.ptsPos = "false";
      row.dataset.ptsLive = "false";
      const suma = podPts[pid] ?? 0;
      setText(row.querySelector("[data-pred-suma]"), suma > 0 ? `+${suma}` : "0");
      row.dataset.sumaPos = suma > 0 ? "true" : "false";
    });
  };

  const renderPreds = (next, res, predictionsByPlayer, podPts = {}) => {
    const m = next.match;
    const hasScore = res && res.homeScore != null && res.awayScore != null;
    const isLive = hasScore && res.status !== "final";
    // Todas las predicciones (completas) del cruce: necesarias para el LONE WOLF (exacto ÚNICO → +5).
    const allForMatch = players
      .map((p) => (predictionsByPlayer[p.id] || {})[m.id])
      .filter((p) => p && p.homeScore != null && p.awayScore != null);
    predRowById.forEach((row, pid) => {
      if (!row) return;
      const pred = (predictionsByPlayer[pid] || {})[m.id];
      const scoreEl = row.querySelector("[data-pred-score]");
      const advEl = row.querySelector("[data-pred-adv]");
      const ptsEl = row.querySelector("[data-pred-pts]");
      const flagEl = row.querySelector("[data-pred-flag]");
      if (pred && pred.homeScore != null && pred.awayScore != null) {
        setText(scoreEl, `${pred.homeScore} : ${pred.awayScore}`);
        const adv = pred.advances === "home" ? next.slotA.shortCode : pred.advances === "away" ? next.slotB.shortCode : "–";
        setText(advEl, adv || "–");
        // Bandera del equipo que el jugador hace avanzar (a quién le va).
        const flag = pred.advances === "home" ? next.slotA.flag : pred.advances === "away" ? next.slotB.flag : null;
        if (flagEl) {
          if (flag) { flagEl.style.backgroundImage = `url("${flag}")`; flagEl.dataset.empty = "false"; }
          else { flagEl.style.backgroundImage = ""; flagEl.dataset.empty = "true"; }
        }
      } else {
        setText(scoreEl, "– : –");
        setText(advEl, "–");
        if (flagEl) { flagEl.style.backgroundImage = ""; flagEl.dataset.empty = "true"; }
      }
      // EN VIVO también suma (provisional): la gracia es que el puntaje cambie con cada gol.
      const pts = matchPts(pred, hasScore ? res : null, allForMatch);
      setText(ptsEl, pts == null ? "–" : String(pts));
      row.dataset.ptsPos = pts > 0 ? "true" : "false";
      row.dataset.ptsLive = isLive && pts > 0 ? "true" : "false";
      // SUMA = lo que se lleva el jugador con esta definición: cruce + podio.
      // (El acumulado va en el ranking de la izquierda, no acá.)
      const suma = (pts ?? 0) + (podPts[pid] ?? 0);
      setText(row.querySelector("[data-pred-suma]"), suma > 0 ? `+${suma}` : "0");
      row.dataset.sumaPos = suma > 0 ? "true" : "false";
    });

    // Reordenar por cercanía al marcador ACTUAL: el más parecido primero (más probable de acertar).
    const ah = hasScore ? Number(res.homeScore) : null;
    const aa = hasScore ? Number(res.awayScore) : null;
    const order = players.map((p) => {
      const pred = (predictionsByPlayer[p.id] || {})[m.id];
      const has = pred && pred.homeScore != null && pred.awayScore != null;
      const ph = has ? Number(pred.homeScore) : 99;
      const pa = has ? Number(pred.awayScore) : 99;
      const dist = has && hasScore ? Math.abs(ph - ah) + Math.abs(pa - aa) : 0;
      return { row: predRowById.get(p.id), has: has ? 1 : 0, dist, ph, pa, name: p.name };
    });
    order.sort((x, y) => y.has - x.has || x.dist - y.dist || x.ph - y.ph || x.pa - y.pa || String(x.name).localeCompare(String(y.name)));
    if (predsBox) order.forEach((o) => { if (o.row) predsBox.appendChild(o.row); });
  };

  const renderCruce = (live, predictionsByPlayer, podPts = {}) => {
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    const next = findNextMatch(resolved);
    if (!next) {
      setText(cruceWhen, "Por definir"); setText(cruceHome, "—"); setText(cruceAway, "—");
      setText(cruceScore, "– : –"); setText(cruceState, "Por definir");
      setFlag(cruceHomeFlag, null); setFlag(cruceAwayFlag, null);
      if (cruceBox) cruceBox.dataset.state = "pending";
      renderPredsReset(podPts);
      return;
    }
    const m = next.match;
    const res = live.results[m.id];
    const hasScore = res && res.homeScore != null && res.awayScore != null;
    const isFinal = hasScore && res.status === "final";
    const isLive = hasScore && !isFinal;
    setText(cruceWhen, fmtWhen(m));
    setText(cruceHome, next.slotA.name || "—");
    setText(cruceAway, next.slotB.name || "—");
    setFlag(cruceHomeFlag, next.slotA.flag);
    setFlag(cruceAwayFlag, next.slotB.flag);
    setText(cruceScore, hasScore ? `${res.homeScore} : ${res.awayScore}` : "– : –");
    setText(cruceState, isFinal ? "Finalizado" : isLive ? "● En vivo" : "Por jugar");
    if (cruceBox) cruceBox.dataset.state = isFinal ? "done" : isLive ? "live" : "upcoming";

    renderPreds(next, res, predictionsByPlayer, podPts);
  };

  const prevPos = new Map();
  let firstRun = true;

  const fire = (el, cls) => { if (!el || reduce) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const countUp = (el, to) => {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (reduce || from === to) { el.textContent = String(to); return; }
    const t0 = performance.now(), dur = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const setPodium = (slotEl, row) => {
    if (!slotEl) return;
    const p = row ? playerById.get(row.playerId) : null;
    const img = slotEl.querySelector("[data-podium-avatar]");
    const nameEl = slotEl.querySelector("[data-podium-name]");
    const ptsEl = slotEl.querySelector("[data-podium-pts]");
    if (img) {
      const src = p?.avatar || p?.avatarThumb || "";
      if (src) { img.src = src; img.alt = p.name; } else { img.removeAttribute("src"); img.alt = ""; }
    }
    if (nameEl) nameEl.textContent = p?.name ?? "—";
    if (ptsEl) ptsEl.textContent = String(row?.total ?? 0);
  };

  const buildBuckets = () => {
    const predictionsByPlayer = {};
    const podiumByPlayer = {};
    for (const sub of (remoteSubmissions ?? submissions)) {
      if (!sub || !sub.playerId) continue;
      predictionsByPlayer[sub.playerId] = sub.predictions ?? {};
      podiumByPlayer[sub.playerId] = sub.podium ?? {};
    }
    // localStorage del dispositivo se MERGEA por cruce sobre lo remoto (no reemplaza el bucket
    // completo): así un draft local de un jugador no borra el resto de su cartón ya cargado.
    const lsPreds = readJson("polla:knockoutPredictions", {});
    for (const [pid, bucket] of Object.entries(lsPreds)) predictionsByPlayer[pid] = { ...(predictionsByPlayer[pid] ?? {}), ...bucket };
    const lsPod = readJson("polla:podiumPredictions", {});
    for (const [pid, pod] of Object.entries(lsPod)) podiumByPlayer[pid] = { ...(podiumByPlayer[pid] ?? {}), ...pod };
    return { predictionsByPlayer, podiumByPlayer };
  };

  const render = () => {
    const effectiveSeed = remoteResults
      ? { slotAssignments: seed.slotAssignments, results: remoteResults }
      : seed;
    const live = readLiveKnockout(effectiveSeed);
    const hasResults = Object.keys(live.results).length > 0;
    // Podio EN VIVO: el marcador en curso de la final ya mueve campeon/subcampeon (provisional),
    // igual que el puntaje por cruce. `actualPodium.live[slot]` marca lo que aun no esta cerrado.
    const actualPodium = hasResults
      ? deriveLivePodium(matches, { assignments: live.assignments, results: live.results, teamsByCode })
      : null;
    const { predictionsByPlayer, podiumByPlayer } = buildBuckets();

    // Resolución de la llave para nombrar los cruces en el historial desplegable.
    const resolvedById = new Map(
      resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode })
        .map((r) => [r.match.id, r]),
    );

    const rows = buildKnockoutLeaderboard({
      players,
      predictionsByPlayer,
      podiumByPlayer,
      results: live.results,
      actualPodium,
    });

    const maxTotal = Math.max(1, ...rows.map((r) => r.total));

    rows.forEach((row, i) => {
      const card = rowById.get(row.playerId);
      if (!card) return;
      card.dataset.rank = String(row.position);

      const posCell = card.querySelector('[data-cell="pos"]');
      if (posCell) posCell.textContent = String(row.position);

      const totalCell = card.querySelector('[data-cell="total"]');
      const totalChanged = totalCell && (parseInt(totalCell.textContent, 10) || 0) !== row.total;
      countUp(totalCell, row.total);

      // Barra de progreso relativa al líder.
      const barCell = card.querySelector('[data-cell="bar"]');
      if (barCell) barCell.style.width = `${row.total > 0 ? Math.max(8, Math.round((row.total / maxTotal) * 100)) : 0}%`;

      card.dataset.leader = i === 0 && row.total > 0 ? "true" : "false";

      // Movimiento (solo con torneo en curso y cambio real de posicion).
      const before = prevPos.get(row.playerId);
      const moveEl = card.querySelector("[data-tabla-move]");
      if (!firstRun && hasResults && before != null && before !== row.position) {
        const up = before > row.position;
        const delta = Math.abs(before - row.position);
        card.dataset.change = up ? "up" : "down";
        if (moveEl) moveEl.textContent = up ? `▲${delta} sube` : `▼${delta} baja`;
        if (up) fire(card, "is-row-rise");
      } else {
        card.dataset.change = "same";
        if (moveEl) moveEl.textContent = hasResults ? "= igual" : "";
      }
      if (totalChanged && row.total > 0) fire(card.querySelector(".tk-pts"), "is-score-pop");
      prevPos.set(row.playerId, row.position);

      // Historial de puntos desplegable (cruce a cruce).
      const histEl = card.querySelector("[data-tabla-history]");
      if (histEl) histEl.innerHTML = buildHistoryHtml(row, predictionsByPlayer[row.playerId] ?? {}, live, resolvedById, actualPodium);

      if (body) body.appendChild(card); // reordena segun ranking
    });

    // Podio top-3.
    renderWorldPodium(actualPodium);
    renderPodiumPicks(rows, podiumByPlayer);

    setPodium(podSlot[1], rows[0]);
    setPodium(podSlot[2], rows[1]);
    setPodium(podSlot[3], rows[2]);
    if (podiumBox) podiumBox.dataset.started = hasResults ? "true" : "false";

    if (body) body.dataset.started = hasResults ? "true" : "false";
    if (noteNode) noteNode.textContent = hasResults ? "● En vivo · actualizado" : "Torneo no iniciado";
    renderCruce(live, predictionsByPlayer, podiumPtsMap(rows));
    firstRun = false;
  };

  render();
  subscribeLiveKnockout(render);

  // Supabase (opcional, gated por env): leé cartones/resultados de la base y re-renderizá en
  // vivo (Realtime). Si no está configurado o falla, queda el dataset local. No rompe el modo local.
  if (isSupabaseConfigured()) {
    (async () => {
      const pull = async () => {
        const [subs, res] = await Promise.all([fetchSubmissions(), fetchResults()]);
        if (subs) remoteSubmissions = subs;
        if (res) remoteResults = res;
        render();
      };
      try {
        await pull();
        await subscribeKnockout(() => { pull().catch(() => {}); });
      } catch {}
    })();
  }
})();
