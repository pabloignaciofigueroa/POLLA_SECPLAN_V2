// Avance de partidos con puntos, ADMINISTRABLE (Admin).
//
// Trae la lectura de la pestana "Partidos" de Estadisticas, pero con poder de
// administracion: editar el marcador de un partido finalizado y des-finalizarlo
// (volverlo a pendiente) ante un error humano. SIEMPRE confirma con pop-up.
//
// Fuentes:
//   - players.json / fixture.json / predictions.json : SOLO LECTURA (biblia).
//   - resultados oficiales en vivo via subscribeLiveData (Supabase Realtime).
//   - puntaje via calculatePointsForPrediction (misma fuente que tabla/estadisticas).
// Ningun punto se almacena: al editar/borrar, todo recalcula solo en tabla/grafico.

import players from "../../data/players.json";
import fixture from "../../data/fixture.json";
import predictionsData from "../../data/predictions.json";
import { calculatePointsForPrediction } from "../../lib/liveMatch/liveScoring.js";
import { resolveLiveMatchPhase } from "../../lib/liveMatch/liveMatchPhase.js";
import {
  subscribeLiveData,
  saveOfficialResult,
  deleteOfficialResult,
} from "../../lib/liveMatch/liveMatchState.js";
import { buildMatchSequence, padLabel } from "../../lib/fixture/matchSequence.js";
import { confirmDialog } from "./adminConfirm.js";

(() => {
  const section = document.querySelector("[data-match-progress]");
  if (!section) return;
  const body = section.querySelector("[data-match-progress-body]");
  const feedback = section.querySelector("[data-match-progress-feedback]");
  if (!body) return;

  const playerById = new Map(players.map((p) => [p.id, p]));
  const predictions = Array.isArray(predictionsData.predictions)
    ? predictionsData.predictions
    : [];
  const predsByMatch = new Map();
  for (const p of predictions) {
    if (!p || !p.matchId) continue;
    const list = predsByMatch.get(p.matchId) ?? [];
    list.push(p);
    predsByMatch.set(p.matchId, list);
  }

  const seqById = buildMatchSequence(fixture.matches);
  const orderedMatches = [...fixture.matches].sort(
    (a, b) =>
      new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime() ||
      a.matchNumber - b.matchNumber
  );
  const matchById = new Map(orderedMatches.map((m) => [m.id, m]));

  const state = {
    snapshot: { liveMatch: null, officialResults: [] },
    selectedMatchId: null,
    editing: null, // { matchId, home, away }
  };

  const setFeedback = (msg) => {
    if (feedback) feedback.textContent = msg;
  };
  const escapeHtml = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const STATE_LABEL = { finished: "Finalizado", live: "En vivo", pending: "Pendiente" };
  const HIT = (t) => (["lone_wolf", "exact", "tendency"].includes(t) ? t : "miss");
  const playerName = (id) => playerById.get(id)?.name ?? id;
  const seqOf = (matchId) => seqById.get(matchId) ?? matchById.get(matchId)?.matchNumber ?? 0;

  const officialFor = (matchId) => {
    const o = (state.snapshot.officialResults ?? []).find((r) => r && r.matchId === matchId);
    if (!o) return null;
    const home = Number(o.homeTeamScore ?? o.homeScore);
    const away = Number(o.awayTeamScore ?? o.awayScore);
    if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
    return { homeScore: home, awayScore: away };
  };

  const liveFor = (match) => {
    const lm = state.snapshot.liveMatch;
    if (!lm || lm.matchId !== match.id) return null;
    const phase = resolveLiveMatchPhase({
      liveMatch: lm,
      fixtureMatch: match,
      officialResults: state.snapshot.officialResults,
    });
    if (phase !== "live") return null;
    const home = Number(lm.homeTeamScore ?? lm.homeScore);
    const away = Number(lm.awayTeamScore ?? lm.awayScore);
    if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
    return { homeScore: home, awayScore: away };
  };

  const statusFor = (match) => {
    if (officialFor(match.id)) return "finished";
    if (liveFor(match)) return "live";
    return "pending";
  };

  // ── Render: lista de partidos (orden cronologico) ────────────────────────
  const renderList = () => {
    return orderedMatches
      .map((m) => {
        const st = statusFor(m);
        const official = officialFor(m.id);
        const live = st === "live" ? liveFor(m) : null;
        const score = official
          ? `${official.homeScore}-${official.awayScore}`
          : live
            ? `${live.homeScore}-${live.awayScore}`
            : "vs";
        return `
          <button type="button" class="mp-item" data-mp-select="${escapeHtml(m.id)}" aria-pressed="${m.id === state.selectedMatchId}">
            <span class="mp-num">${padLabel(seqOf(m.id))}</span>
            <span class="mp-teams">${escapeHtml(m.homeTeam.shortCode)} ${score} ${escapeHtml(m.awayTeam.shortCode)}</span>
            <span class="mp-state" data-state="${st}">${STATE_LABEL[st]}</span>
          </button>`;
      })
      .join("");
  };

  // ── Render: detalle del partido seleccionado ─────────────────────────────
  const renderDetail = (match) => {
    if (!match) return '<p class="mp-empty">Selecciona un partido.</p>';
    const st = statusFor(match);
    const official = officialFor(match.id);
    const live = st === "live" ? liveFor(match) : null;
    const result = official ?? live;
    const preds = predsByMatch.get(match.id) ?? [];

    const titleScore = result ? `${result.homeScore} - ${result.awayScore}` : "vs";
    const title = `${escapeHtml(match.homeTeam.name)} ${titleScore} ${escapeHtml(match.awayTeam.name)}`;

    let summary = "";
    if (official) {
      const counts = { lone_wolf: 0, exact: 0, tendency: 0, none: 0, no_info: 0 };
      preds.forEach((p) => {
        const s = calculatePointsForPrediction(p, official, preds);
        counts[s.hitType] = (counts[s.hitType] ?? 0) + 1;
      });
      summary = `Resultado final ${official.homeScore}-${official.awayScore} · ${counts.lone_wolf} Lone Wolf · ${counts.exact} exactos · ${counts.tendency} tendencias · ${counts.none + counts.no_info} sin puntos`;
    } else if (live) {
      summary = `En vivo ${live.homeScore}-${live.awayScore} (provisional, se administra desde el control de marcador de arriba).`;
    } else {
      summary = "Pendiente. Aun no entrega puntos. Se finaliza desde el control de marcador de arriba.";
    }

    // Filas de jugadores (ordenadas por puntos si hay oficial).
    const scored = new Map();
    if (official) {
      preds.forEach((p) =>
        scored.set(p.playerId, calculatePointsForPrediction(p, official, preds))
      );
    }
    const sortedPreds = [...preds].sort((a, b) => {
      if (official) {
        const d = (scored.get(b.playerId)?.points ?? 0) - (scored.get(a.playerId)?.points ?? 0);
        if (d !== 0) return d;
      }
      return playerName(a.playerId).localeCompare(playerName(b.playerId));
    });

    const head = official
      ? "<tr><th>Jugador</th><th>Marcador</th><th>Tendencia</th><th>Suma</th></tr>"
      : "<tr><th>Jugador</th><th>Marcador</th><th>Tendencia</th></tr>";

    const rows = sortedPreds
      .map((p) => {
        const base = `
          <td>${escapeHtml(playerName(p.playerId))}</td>
          <td><strong>${p.homeScore}-${p.awayScore}</strong></td>
          <td>${p.homeScore > p.awayScore ? "Gana local" : p.homeScore < p.awayScore ? "Gana visita" : "Empate"}</td>`;
        if (!official) return `<tr>${base}</tr>`;
        const s = scored.get(p.playerId) ?? { points: 0, hitType: "none" };
        return `<tr>${base}<td class="mp-suma"><span class="mp-dot" data-hit-type="${HIT(s.hitType)}"></span>${s.points > 0 ? `+${s.points}` : "0"}</td></tr>`;
      })
      .join("");

    const table = preds.length
      ? `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`
      : '<p class="mp-empty">Sin predicciones para este partido.</p>';

    // Zona de administracion (solo partidos finalizados).
    let admin = "";
    if (official) {
      const editing = state.editing && state.editing.matchId === match.id ? state.editing : null;
      if (editing) {
        admin = `
          <div class="mp-editor" role="group" aria-label="Editar marcador oficial">
            <div class="mp-team-edit">
              <span class="mp-name">${escapeHtml(match.homeTeam.shortCode)}</span>
              <div class="mp-stepper">
                <button type="button" class="mp-step" data-mp-step="home:-" ${editing.home <= 0 ? "disabled" : ""}>−</button>
                <span class="mp-score">${editing.home}</span>
                <button type="button" class="mp-step" data-mp-step="home:+">+</button>
              </div>
            </div>
            <div class="mp-team-edit">
              <span class="mp-name">${escapeHtml(match.awayTeam.shortCode)}</span>
              <div class="mp-stepper">
                <button type="button" class="mp-step" data-mp-step="away:-" ${editing.away <= 0 ? "disabled" : ""}>−</button>
                <span class="mp-score">${editing.away}</span>
                <button type="button" class="mp-step" data-mp-step="away:+">+</button>
              </div>
            </div>
            <div class="mp-actions" style="margin-top:0">
              <button type="button" class="mp-btn-save" data-mp-save="${escapeHtml(match.id)}">Guardar cambios</button>
              <button type="button" class="mp-btn-cancel" data-mp-edit-cancel>Cancelar</button>
            </div>
          </div>`;
      } else {
        admin = `
          <div class="mp-actions">
            <button type="button" class="mp-btn-edit" data-mp-edit="${escapeHtml(match.id)}">Editar resultado</button>
            <button type="button" class="mp-btn-undo" data-mp-undo="${escapeHtml(match.id)}">Des-finalizar</button>
          </div>`;
      }
    }

    return `
      <article class="mp-detail">
        <h3>Partido ${padLabel(seqOf(match.id))} · Grupo ${escapeHtml(match.groupId)} · <span class="mp-state" data-state="${st}">${STATE_LABEL[st]}</span></h3>
        <h3 style="font-size:1rem">${title}</h3>
        <p class="mp-summary">${escapeHtml(summary)}</p>
        ${table}
        ${admin}
      </article>`;
  };

  const render = () => {
    if (!state.selectedMatchId) {
      // Por defecto: el ultimo finalizado (mas reciente), o el primero del fixture.
      const lastFinished = [...orderedMatches].reverse().find((m) => officialFor(m.id));
      state.selectedMatchId = lastFinished?.id ?? orderedMatches[0]?.id ?? null;
    }
    const selected = matchById.get(state.selectedMatchId) ?? orderedMatches[0];
    body.innerHTML = `
      <div class="mp-grid">
        <div class="mp-list">${renderList()}</div>
        ${renderDetail(selected)}
      </div>`;
  };

  // ── Eventos (delegacion) ─────────────────────────────────────────────────
  body.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const selectBtn = target.closest("[data-mp-select]");
    if (selectBtn) {
      state.selectedMatchId = selectBtn.getAttribute("data-mp-select");
      state.editing = null;
      render();
      return;
    }

    const editBtn = target.closest("[data-mp-edit]");
    if (editBtn) {
      const matchId = editBtn.getAttribute("data-mp-edit");
      const official = officialFor(matchId);
      if (!official) return;
      state.editing = { matchId, home: official.homeScore, away: official.awayScore };
      render();
      return;
    }

    if (target.closest("[data-mp-edit-cancel]")) {
      state.editing = null;
      render();
      setFeedback("Edición cancelada.");
      return;
    }

    const stepBtn = target.closest("[data-mp-step]");
    if (stepBtn && state.editing) {
      const [side, dir] = stepBtn.getAttribute("data-mp-step").split(":");
      if (dir === "+") state.editing[side] += 1;
      else state.editing[side] = Math.max(0, state.editing[side] - 1);
      render();
      return;
    }

    const saveBtn = target.closest("[data-mp-save]");
    if (saveBtn && state.editing) {
      const matchId = saveBtn.getAttribute("data-mp-save");
      const match = matchById.get(matchId);
      if (!match) return;
      const { home, away } = state.editing;
      const label = `${match.homeTeam.shortCode} ${home} - ${away} ${match.awayTeam.shortCode}`;
      const ok = await confirmDialog({
        title: `Editar resultado P${padLabel(seqOf(matchId))}`,
        message: `Vas a cambiar el resultado oficial a ${label}. Los puntos de todos los jugadores se recalculan. ¿Confirmas?`,
        confirmLabel: "Sí, guardar",
        tone: "danger",
      });
      if (!ok) {
        setFeedback("Cambio cancelado. El resultado no se modificó.");
        return;
      }
      try {
        await saveOfficialResult({
          matchId: match.id,
          matchNumber: match.matchNumber, // FIFA, requerido por Supabase
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamScore: home,
          awayTeamScore: away,
          finishedAt: new Date().toISOString(),
        });
        state.editing = null;
        setFeedback(`Resultado actualizado: ${label}. Tabla y gráfico recalculados.`);
        // El evento OFFICIAL_RESULTS_EVENT re-dispara subscribeLiveData -> re-render.
      } catch (error) {
        setFeedback(error?.message || "No fue posible guardar el resultado.");
      }
      return;
    }

    const undoBtn = target.closest("[data-mp-undo]");
    if (undoBtn) {
      const matchId = undoBtn.getAttribute("data-mp-undo");
      const match = matchById.get(matchId);
      if (!match) return;
      const ok = await confirmDialog({
        title: `Des-finalizar P${padLabel(seqOf(matchId))}`,
        message: `Vas a quitar el resultado oficial de ${match.homeTeam.name} vs ${match.awayTeam.name}. El partido vuelve a "pendiente" y deja de entregar puntos hasta que lo finalices de nuevo. ¿Confirmas?`,
        confirmLabel: "Sí, des-finalizar",
        tone: "danger",
      });
      if (!ok) {
        setFeedback("Des-finalización cancelada.");
        return;
      }
      try {
        await deleteOfficialResult(matchId);
        state.editing = null;
        setFeedback(`Partido P${padLabel(seqOf(matchId))} des-finalizado. Volvió a pendiente.`);
      } catch (error) {
        setFeedback(error?.message || "No fue posible des-finalizar el partido.");
      }
      return;
    }
  });

  // El snapshot inicial y cada cambio Realtime re-pintan el panel.
  subscribeLiveData((snapshot) => {
    state.snapshot = snapshot ?? { liveMatch: null, officialResults: [] };
    render();
  });
})();
