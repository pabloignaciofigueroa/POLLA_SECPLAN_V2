import {
  clearAdminSession,
  closeGroup,
  finalizeOfficialResult,
  hasValidAdminSession,
  readLiveMatchState,
  readOfficialResults,
  reopenGroup,
  resolveCurrentMatch,
  saveLiveMatchState,
  subscribeLiveData,
  validateAdminSession,
} from "../../lib/liveMatch/liveMatchState.js";
import {
  createPredictionEditCode,
  listPredictionEditAccess,
  revokePredictionEditAccess,
} from "../../lib/predictions/predictionEditAccess.js";
import {
  bonusPreviewFor,
  canOfferClose,
  canOfferReopen,
  groupsReadyToClose,
  isClosureStaleSituation,
} from "../../lib/admin/groupClosePreview.js";
import { GROUP_STATE } from "../../lib/fixture/groupState.js";
import { confirmDialog } from "./adminConfirm.js";

(async () => {
  const section = document.querySelector('[data-section="admin"]');
  if (!section) return;

  const gate = section.querySelector("[data-admin-gate]");
  const protectedPanel = section.querySelector("[data-admin-protected]");

  if (!hasValidAdminSession() || !(await validateAdminSession())) {
    clearAdminSession();
    if (gate) gate.hidden = false;
    if (protectedPanel) protectedPanel.hidden = true;
    return;
  }

  if (gate) gate.hidden = true;
  if (protectedPanel) protectedPanel.hidden = false;

  const payloadNode = section.querySelector("[data-admin-payload]");
  const payload = (() => {
    try {
      return payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
    } catch {
      return {};
    }
  })();

  const dangerousActions = new Set(payload.dangerousActions || []);
  const feedback = section.querySelector("[data-admin-feedback]");
  const criticalConfirmTimers = new WeakMap();

  let resetPollaLocalState = null;
  if (payload.resetStateUrl) {
    try {
      const resetModule = await import(payload.resetStateUrl);
      resetModule.ensurePollaStorageVersion?.();
      resetPollaLocalState = resetModule.resetPollaLocalState ?? null;
    } catch {
      resetPollaLocalState = null;
    }
  }

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const setFeedback = (message) => {
    if (!feedback) return;
    feedback.textContent = message;
    if (!reduceMotion) {
      feedback.classList.remove("is-feedback-flash");
      void feedback.offsetWidth;
      feedback.classList.add("is-feedback-flash");
    }
  };

  const resetCriticalConfirmation = (button) => {
    const timer = criticalConfirmTimers.get(button);
    if (timer) window.clearTimeout(timer);
    criticalConfirmTimers.delete(button);
    button.dataset.confirming = "false";
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
    }
  };

  await initLiveScoreControl(section, payload, setFeedback);
  // Un solo dueno del snapshot para KPI + panel de cierre (una sola suscripcion).
  const renderGroupClose = initGroupClosePanel(section, payload);
  initOfficialResultsKpi(section, payload, renderGroupClose);
  await initPredictionEditAccess(section, setFeedback);

  section.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      section.querySelectorAll("[data-admin-tab]").forEach((item) => {
        item.dataset.active = item === tab ? "true" : "false";
        item.setAttribute("aria-pressed", item === tab ? "true" : "false");
      });
      setFeedback(`Vista ${tab.dataset.adminTab} seleccionada.`);
    });
  });

  section.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.adminAction || "accion";
      if (action === "danger-reset-local") {
        resetPollaLocalState?.();
        setFeedback(
          "Limpieza local aplicada. El navegador quedo en version production-reset-2026-05-31."
        );
        return;
      }

      if (dangerousActions.has(action)) {
        if (button.dataset.confirming !== "true") {
          section
            .querySelectorAll(
              "[data-admin-action][data-confirming='true']"
            )
            .forEach(resetCriticalConfirmation);
          button.dataset.originalLabel ||= button.textContent || "Confirmar";
          button.dataset.confirming = "true";
          button.textContent = "Confirmar accion";
          setFeedback(
            "Accion critica local preparada. Presiona nuevamente para confirmar."
          );
          const timer = window.setTimeout(() => {
            resetCriticalConfirmation(button);
            setFeedback("Accion critica cancelada por tiempo.");
          }, 4500);
          criticalConfirmTimers.set(button, timer);
          return;
        }

        resetCriticalConfirmation(button);
        setFeedback(
          "Accion critica local confirmada. No se modificaron datos del servidor."
        );
        return;
      }

      button.dataset.pending = "true";
      setFeedback("Accion administrativa local registrada.");
      window.setTimeout(() => {
        button.dataset.pending = "false";
      }, 300);
    });
  });
})();

function initOfficialResultsKpi(section, payload, onSnapshot = null) {
  const totalMatches =
    (Array.isArray(payload.liveMatches) && payload.liveMatches.length) || 72;
  const kpiValue = section.querySelector(
    '[data-kpi="official-results"] [data-kpi-value]'
  );
  const kpiHelper = section.querySelector(
    '[data-kpi="official-results"] [data-kpi-helper]'
  );
  const panelLoaded = section.querySelector("[data-results-loaded]");
  const panelPending = section.querySelector("[data-results-pending]");

  const paint = (officialResults) => {
    const loaded = Array.isArray(officialResults) ? officialResults.length : 0;
    const percent = Math.round((loaded / totalMatches) * 100);
    if (kpiValue) kpiValue.textContent = `${loaded} / ${totalMatches}`;
    if (kpiHelper) kpiHelper.textContent = `${percent}% cargados`;
    if (panelLoaded) panelLoaded.textContent = `${loaded} / ${totalMatches}`;
    if (panelPending) panelPending.textContent = String(totalMatches - loaded);
  };

  // El snapshot inicial llega con el primer emit; FINALIZAR PARTIDO, el cierre/reapertura
  // de grupo (GROUP_CLOSURES_EVENT) y los cambios Realtime re-disparan el callback. Este
  // es el UNICO subscribeLiveData del KPI + el panel de cierre (un solo dueno del dataset).
  subscribeLiveData((snapshot) => {
    paint(snapshot?.officialResults ?? []);
    if (typeof onSnapshot === "function") onSnapshot(snapshot);
  });
}

async function initPredictionEditAccess(section, setFeedback) {
  const panel = section.querySelector("[data-prediction-edit-admin]");
  if (!panel) return;

  const rows = Array.from(panel.querySelectorAll("[data-edit-player]"));
  const summary = panel.querySelector("[data-edit-access-summary]");
  const revokeTimers = new WeakMap();

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "---";
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Santiago",
    }).format(date);
  };

  const paintStatuses = ({ codes = [], sessions = [] } = {}) => {
    const codeByPlayer = new Map(codes.map((entry) => [entry.playerId, entry]));
    const sessionByPlayer = new Map();
    sessions
      .slice()
      .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))
      .forEach((entry) => {
        if (!sessionByPlayer.has(entry.playerId)) {
          sessionByPlayer.set(entry.playerId, entry);
        }
      });
    let active = 0;

    rows.forEach((row) => {
      const playerId = row.dataset.playerId;
      const status = row.querySelector("[data-edit-player-status]");
      const revoke = row.querySelector("[data-edit-code-revoke]");
      const session = sessionByPlayer.get(playerId);
      const code = codeByPlayer.get(playerId);

      if (session) {
        row.dataset.accessStatus = "session";
        if (status) status.textContent = `Sesión activa hasta ${formatDate(session.expiresAt)}`;
        if (revoke) revoke.disabled = false;
        active += 1;
      } else if (code) {
        row.dataset.accessStatus = "code";
        if (status) status.textContent = `Código sin canjear hasta ${formatDate(code.expiresAt)}`;
        if (revoke) revoke.disabled = false;
        active += 1;
      } else {
        row.dataset.accessStatus = "locked";
        if (status) status.textContent = "Cartón protegido";
        if (revoke) revoke.disabled = true;
      }
    });

    if (summary) {
      summary.textContent = active === 0
        ? "Sin permisos activos"
        : `${active} ${active === 1 ? "permiso activo" : "permisos activos"}`;
    }
  };

  const refresh = async () => {
    try {
      paintStatuses(await listPredictionEditAccess());
      panel.dataset.remoteUnavailable = "false";
    } catch (error) {
      paintStatuses();
      panel.dataset.remoteUnavailable = "true";
      if (summary) summary.textContent = "Módulo no disponible";
      setFeedback(error?.message || "No fue posible leer las autorizaciones de edición.");
    }
  };

  rows.forEach((row) => {
    const playerId = row.dataset.playerId;
    const playerName = row.dataset.playerName || playerId;
    const generate = row.querySelector("[data-edit-code-generate]");
    const revoke = row.querySelector("[data-edit-code-revoke]");
    const result = row.querySelector("[data-edit-code-result]");
    const value = row.querySelector("[data-edit-code-value]");
    const expiry = row.querySelector("[data-edit-code-expiry]");
    const copy = row.querySelector("[data-edit-code-copy]");

    generate?.addEventListener("click", async () => {
      if (generate.dataset.pending === "true") return;
      generate.dataset.pending = "true";
      generate.disabled = true;
      try {
        const created = await createPredictionEditCode(playerId);
        if (value) value.textContent = created.code;
        if (expiry) {
          expiry.textContent = `Visible solo ahora. Se puede canjear hasta ${formatDate(created.expiresAt)}.`;
        }
        if (result) result.hidden = false;
        setFeedback(`Código temporal generado para ${playerName}.`);
        await refresh();
      } catch (error) {
        setFeedback(error?.message || `No fue posible generar el código de ${playerName}.`);
      } finally {
        generate.dataset.pending = "false";
        generate.disabled = false;
      }
    });

    copy?.addEventListener("click", async () => {
      const code = value?.textContent?.trim();
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        setFeedback(`Código de ${playerName} copiado.`);
      } catch {
        setFeedback(`No fue posible copiar el código. Código: ${code}`);
      }
    });

    revoke?.addEventListener("click", async () => {
      if (revoke.dataset.confirming !== "true") {
        revoke.dataset.confirming = "true";
        revoke.textContent = "Confirmar";
        setFeedback(`Confirma la revocación para ${playerName}.`);
        const timer = window.setTimeout(() => {
          revoke.dataset.confirming = "false";
          revoke.textContent = "Revocar";
        }, 5000);
        revokeTimers.set(revoke, timer);
        return;
      }

      const timer = revokeTimers.get(revoke);
      if (timer) window.clearTimeout(timer);
      revoke.dataset.confirming = "false";
      revoke.textContent = "Revocar";
      revoke.disabled = true;
      try {
        await revokePredictionEditAccess(playerId);
        if (result) result.hidden = true;
        if (value) value.textContent = "";
        setFeedback(`Acceso de edición revocado para ${playerName}.`);
        await refresh();
      } catch (error) {
        setFeedback(error?.message || `No fue posible revocar el acceso de ${playerName}.`);
        revoke.disabled = false;
      }
    });
  });

  await refresh();
}

async function initLiveScoreControl(section, payload, setFeedback) {
  const control = section.querySelector("[data-live-score-control]");
  if (!control) return;

  const matches = Array.isArray(payload.liveMatches) ? payload.liveMatches : [];
  if (matches.length === 0) return;

  const els = {
    homeName: control.querySelector("[data-live-home-name]"),
    awayName: control.querySelector("[data-live-away-name]"),
    homeScore: control.querySelector("[data-live-home-score]"),
    awayScore: control.querySelector("[data-live-away-score]"),
    matchTag: control.querySelector("[data-live-match-tag]"),
    homeMinus: control.querySelector('[data-live-btn="home-minus"]'),
    awayMinus: control.querySelector('[data-live-btn="away-minus"]'),
    updateBtn: control.querySelector("[data-live-update]"),
    finalizeBtn: control.querySelector("[data-live-finalize]"),
  };

  const [saved, initialOfficialResults] = await Promise.all([
    readLiveMatchState(),
    readOfficialResults(),
  ]);
  let officialResults = initialOfficialResults;
  let match =
    (saved &&
      matches.find((item) => item.matchNumber === saved.matchNumber)) ||
    resolveCurrentMatch(matches, Date.now()) ||
    matches[0];
  let homeScore =
    saved && match.matchNumber === saved.matchNumber
      ? toScore(saved.homeTeamScore)
      : 0;
  let awayScore =
    saved && match.matchNumber === saved.matchNumber
      ? toScore(saved.awayTeamScore)
      : 0;

  const render = () => {
    if (els.homeName) els.homeName.textContent = match.homeTeam.shortCode;
    if (els.awayName) els.awayName.textContent = match.awayTeam.shortCode;
    if (els.homeScore) els.homeScore.textContent = String(homeScore);
    if (els.awayScore) els.awayScore.textContent = String(awayScore);
    if (els.matchTag) els.matchTag.textContent = `P${match.displayNumber ?? match.matchNumber}`;
    control.dataset.matchNumber = String(match.matchNumber);
    if (els.homeMinus) els.homeMinus.disabled = homeScore <= 0;
    if (els.awayMinus) els.awayMinus.disabled = awayScore <= 0;
  };

  // status explicito: "live" = marcador puntuable (ACTUALIZAR MARCADOR es la
  // promocion pending->live); "pending" = siguiente partido preparado que la
  // tabla muestra EN ESPERA sin puntuar.
  const buildState = (
    targetMatch = match,
    targetHomeScore = homeScore,
    targetAwayScore = awayScore,
    targetStatus = "live"
  ) => ({
    id: "current",
    matchId: targetMatch.id,
    matchNumber: targetMatch.matchNumber,
    status: targetStatus,
    homeTeam: targetMatch.homeTeam.name,
    awayTeam: targetMatch.awayTeam.name,
    homeTeamScore: targetHomeScore,
    awayTeamScore: targetAwayScore,
    homeTeamId: targetMatch.homeTeam.id,
    awayTeamId: targetMatch.awayTeam.id,
    homeTeamShort: targetMatch.homeTeam.shortCode,
    awayTeamShort: targetMatch.awayTeam.shortCode,
    lastEvent:
      targetStatus === "pending"
        ? "Siguiente partido preparado desde Admin"
        : "Actualizacion manual desde Admin",
    updatedBy: "admin",
    updatedAt: new Date().toISOString(),
  });

  const nextOpenMatch = (results) => {
    const finalized = new Set(results.map((result) => result.matchId));
    const open = matches.filter((candidate) => !finalized.has(candidate.id));
    return resolveCurrentMatch(open, Date.now()) || open[0] || match;
  };

  control.querySelectorAll("[data-live-btn]").forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset.liveBtn) {
        case "home-plus":
          homeScore += 1;
          break;
        case "home-minus":
          homeScore = Math.max(0, homeScore - 1);
          break;
        case "away-plus":
          awayScore += 1;
          break;
        case "away-minus":
          awayScore = Math.max(0, awayScore - 1);
          break;
      }
      if (els.updateBtn) els.updateBtn.dataset.saved = "false";
      render();
    });
  });

  els.updateBtn?.addEventListener("click", async () => {
    if (els.updateBtn.dataset.pending === "true") return;
    els.updateBtn.dataset.pending = "true";
    try {
      await saveLiveMatchState(buildState());
      els.updateBtn.dataset.saved = "true";
      setFeedback(
        `Marcador global actualizado: ${match.homeTeam.shortCode} ${homeScore} - ${awayScore} ${match.awayTeam.shortCode}.`
      );
    } catch (error) {
      setFeedback(
        error?.message || "No fue posible actualizar el marcador global."
      );
    } finally {
      els.updateBtn.dataset.pending = "false";
    }
  });

  els.finalizeBtn?.addEventListener("click", async () => {
    if (els.finalizeBtn.dataset.pending === "true") return;

    const displayLabel = match.displayNumber ?? match.matchNumber;
    const finishedLabel = `${match.homeTeam.shortCode} ${homeScore} - ${awayScore} ${match.awayTeam.shortCode}`;

    // SIEMPRE confirmar antes de oficializar: entrega puntos y mueve el partido.
    const confirmed = await confirmDialog({
      title: `Finalizar P${displayLabel}`,
      message: `Vas a oficializar ${finishedLabel}. Esto entrega puntos a todos los jugadores y deja el partido como finalizado. ¿Confirmas?`,
      confirmLabel: "Sí, finalizar",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) {
      setFeedback("Finalización cancelada. No se modificó ningún resultado.");
      return;
    }

    const result = {
      matchId: match.id,
      matchNumber: match.matchNumber,
      homeTeamId: match.homeTeam.id,
      awayTeamId: match.awayTeam.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      homeTeamScore: homeScore,
      awayTeamScore: awayScore,
      finishedAt: new Date().toISOString(),
    };
    const nextResults = officialResults
      .filter((item) => item?.matchId !== result.matchId)
      .concat(result);
    const nextMatch = nextOpenMatch(nextResults);
    const nextState = buildState(nextMatch, 0, 0, "pending");

    els.finalizeBtn.dataset.pending = "true";
    try {
      await finalizeOfficialResult(result, nextState);
      officialResults = nextResults;
      match = nextMatch;
      homeScore = 0;
      awayScore = 0;
      if (els.updateBtn) els.updateBtn.dataset.saved = "false";
      render();
      setFeedback(
        `Resultado oficializado globalmente: ${finishedLabel}. Ahora editando P${match.displayNumber ?? match.matchNumber}.`
      );
    } catch (error) {
      setFeedback(
        error?.message || "No fue posible oficializar el resultado."
      );
    } finally {
      els.finalizeBtn.dataset.pending = "false";
    }
  });

  render();
}

function toScore(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── F11: panel de cierre de grupo ──────────────────────────────────────────────
// Devuelve render(snapshot): el dueno del snapshot (initOfficialResultsKpi) lo invoca
// en cada emit. Lee la situacion del grupo con las libs de la fundacion (CERO formula
// nueva); el cierre/reapertura van por RPC (closeGroup/reopenGroup). Confirmaciones
// inline de doble paso con confirmDialog (nunca alert/confirm/prompt).
function initGroupClosePanel(section, payload) {
  const panel = section.querySelector("[data-group-close]");
  if (!panel) return () => {};
  const body = panel.querySelector("[data-group-close-body]");
  const feedback = panel.querySelector("[data-group-close-feedback]");
  if (!body) return () => {};

  const cfg = payload.groupClose || {};
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
  const fixture = Array.isArray(cfg.fixtureMatches) ? cfg.fixtureMatches : [];
  const players = Array.isArray(cfg.players) ? cfg.players : [];
  const qualifiedPredictions = Array.isArray(cfg.qualifiedPredictions)
    ? cfg.qualifiedPredictions
    : [];

  if (groups.length === 0) return () => {};

  const setFeedback = (msg) => {
    if (feedback) feedback.textContent = msg;
  };
  const escapeHtml = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // Estado de la UI que NO viene del snapshot: que grupo tiene el editor de motivo abierto.
  const ui = { reasonOpenFor: null, pending: new Set() };
  let snapshot = { officialResults: [], liveMatches: [], groupClosures: [] };

  const STATE_LABEL = {
    [GROUP_STATE.PENDING_CLOSE]: "Listo para cerrar",
    [GROUP_STATE.FINAL]: "Definitivo",
    [GROUP_STATE.REOPENED]: "Reabierto",
  };

  const teamName = (group, teamId) => {
    const t = (group.teams || []).find((x) => x.id === teamId);
    return t ? t.name : teamId ?? "—";
  };

  const renderStandings = (group, situation) => {
    const rows = Array.isArray(situation.standings) ? situation.standings : [];
    if (rows.length === 0) return "";
    const tr = rows
      .map((row) => {
        const id = row.teamId ?? row.id;
        const pos = id === situation.first ? 1 : id === situation.second ? 2 : 0;
        const tag = pos
          ? `<span class="gc-pos" data-pos="${pos}">${pos === 1 ? "1o" : "2o"}</span>`
          : "";
        const name = row.name ?? teamName(group, id);
        const gd = Number(row.goalDifference ?? 0);
        return `<tr>
          <td class="gc-team">${escapeHtml(name)}${tag}</td>
          <td>${escapeHtml(row.shortCode ?? "")}</td>
          <td>${Number(row.played ?? 0)}</td>
          <td>${gd > 0 ? "+" : ""}${gd}</td>
          <td><strong>${Number(row.points ?? 0)}</strong></td>
        </tr>`;
      })
      .join("");
    return `<table>
      <thead><tr><th>Equipo</th><th>Cod</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead>
      <tbody>${tr}</tbody>
    </table>`;
  };

  const renderBonusPreview = (group, situation) => {
    const preview = bonusPreviewFor(group, {
      players,
      qualifiedPredictions,
      groups,
      fixture,
      snapshot,
    });
    const provisionalNote =
      situation.state === GROUP_STATE.FINAL && !situation.closureStale
        ? "Bonos consolidados (oficiales)."
        : "Preview (aun provisional): se consolidan al cerrar.";
    return `
      <div class="gc-bonus">
        <div class="gc-chip">
          <span>Aciertos 1o (+${preview.firstValue})</span>
          <strong>${preview.firstHits}</strong>
        </div>
        <div class="gc-chip">
          <span>Aciertos 2o (+${preview.secondValue})</span>
          <strong>${preview.secondHits}</strong>
        </div>
      </div>
      <p class="gc-bonus-total">Puntos de clasificacion a consolidar: <strong>${preview.totalPoints}</strong> (${preview.firstPoints} por 1o + ${preview.secondPoints} por 2o).</p>
      <p class="gc-provisional">${escapeHtml(provisionalNote)}</p>`;
  };

  const renderCard = (group, situation) => {
    const stale = isClosureStaleSituation(situation);
    const offerClose = canOfferClose(situation);
    const offerReopen = canOfferReopen(situation);
    const reasonOpen = ui.reasonOpenFor === group.id;
    const busy = ui.pending.has(group.id);

    const staleBanner = stale
      ? `<div class="gc-stale" role="alert">
           <span aria-hidden="true">!</span>
           <span>Grupo cerrado desactualizado: un resultado se corrigio y ya no coincide con el cierre. Hay que reabrir y recalcular.</span>
         </div>`
      : "";

    const firstName = teamName(group, situation.first);
    const secondName = teamName(group, situation.second);
    const finalLine =
      situation.state === GROUP_STATE.FINAL && !stale
        ? `<p class="gc-final-line">Oficial: 1o ${escapeHtml(firstName)} · 2o ${escapeHtml(secondName)}.</p>`
        : "";

    let closeBtn = "";
    if (offerClose) {
      const label = situation.state === GROUP_STATE.FINAL ? "Recerrar (corregido)" : "Validar y cerrar";
      closeBtn = `<button type="button" class="gc-btn-close" data-gc-close="${escapeHtml(group.id)}" ${busy ? "disabled" : ""}>${label}</button>`;
    }
    let reopenBtn = "";
    if (offerReopen) {
      reopenBtn = `<button type="button" class="gc-btn-reopen" data-gc-reopen="${escapeHtml(group.id)}" data-highlight="${stale ? "true" : "false"}" ${busy ? "disabled" : ""}>Reabrir</button>`;
    }

    const reasonEditor = reasonOpen
      ? `<div class="gc-reason">
           <label for="gc-reason-${escapeHtml(group.id)}">Motivo de la reapertura</label>
           <input id="gc-reason-${escapeHtml(group.id)}" type="text" data-gc-reason-input="${escapeHtml(group.id)}" maxlength="160" placeholder="Ej. se corrigio el marcador del segundo final" />
           <div class="gc-actions">
             <button type="button" class="gc-btn-reopen" data-highlight="true" data-gc-reopen-confirm="${escapeHtml(group.id)}" ${busy ? "disabled" : ""}>Confirmar reapertura</button>
             <button type="button" class="gc-btn-reopen" data-gc-reopen-cancel="${escapeHtml(group.id)}">Cancelar</button>
           </div>
         </div>`
      : "";

    return `
      <article class="gc-card" data-state="${situation.state}" data-stale="${stale ? "true" : "false"}">
        <div class="gc-card-head">
          <h3>Grupo ${escapeHtml(group.id)}</h3>
          <span class="gc-badge" data-state="${situation.state}">${STATE_LABEL[situation.state] ?? situation.state}</span>
        </div>
        ${staleBanner}
        ${renderStandings(group, situation)}
        ${renderBonusPreview(group, situation)}
        ${finalLine}
        <div class="gc-actions">
          ${closeBtn}
          ${reopenBtn}
        </div>
        ${reasonEditor}
      </article>`;
  };

  const render = (nextSnapshot) => {
    if (nextSnapshot) {
      snapshot = {
        officialResults: nextSnapshot.officialResults ?? [],
        liveMatches: nextSnapshot.liveMatches ?? [],
        groupClosures: nextSnapshot.groupClosures ?? [],
      };
    }
    const relevant = groupsReadyToClose(groups, { fixture, snapshot });
    if (relevant.length === 0) {
      // CERO regresion: sin grupos por cerrar, el panel no se muestra.
      panel.hidden = true;
      body.innerHTML = "";
      return;
    }
    panel.hidden = false;
    body.innerHTML = `<div class="gc-grid">${relevant
      .map(({ group, situation }) => renderCard(group, situation))
      .join("")}</div>`;
  };

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const situationOf = (groupId) => {
    const group = groupById.get(groupId);
    if (!group) return null;
    return groupsReadyToClose([group], { fixture, snapshot })[0]?.situation ?? null;
  };

  // ── Acciones (delegacion de eventos) ──────────────────────────────────────
  body.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const closeBtn = target.closest("[data-gc-close]");
    if (closeBtn) {
      const groupId = closeBtn.getAttribute("data-gc-close");
      const group = groupById.get(groupId);
      const situation = situationOf(groupId);
      if (!group || !situation) return;
      const firstName = teamName(group, situation.first);
      const secondName = teamName(group, situation.second);
      const ok = await confirmDialog({
        title: `Cerrar Grupo ${groupId}`,
        message: `Vas a oficializar la clasificacion del Grupo ${groupId}: 1o ${firstName} y 2o ${secondName}. Esto consolida los bonos de clasificacion. Es reversible. ¿Confirmas?`,
        confirmLabel: "Si, validar y cerrar",
        cancelLabel: "Cancelar",
        tone: "info",
      });
      if (!ok) {
        setFeedback("Cierre cancelado. No se consolido nada.");
        return;
      }
      ui.pending.add(groupId);
      render();
      try {
        await closeGroup(groupId, situation.first, situation.second, situation.standings);
        setFeedback(`Grupo ${groupId} cerrado: 1o ${firstName}, 2o ${secondName}. Bonos consolidados.`);
        // GROUP_CLOSURES_EVENT re-dispara el subscribe -> re-render con la nueva closure.
      } catch (error) {
        setFeedback(closeErrorMessage(error));
      } finally {
        ui.pending.delete(groupId);
        render();
      }
      return;
    }

    const reopenBtn = target.closest("[data-gc-reopen]");
    if (reopenBtn) {
      ui.reasonOpenFor = reopenBtn.getAttribute("data-gc-reopen");
      render();
      const input = body.querySelector(`[data-gc-reason-input="${ui.reasonOpenFor}"]`);
      input?.focus();
      return;
    }

    const reopenCancel = target.closest("[data-gc-reopen-cancel]");
    if (reopenCancel) {
      ui.reasonOpenFor = null;
      render();
      setFeedback("Reapertura cancelada.");
      return;
    }

    const reopenConfirm = target.closest("[data-gc-reopen-confirm]");
    if (reopenConfirm) {
      const groupId = reopenConfirm.getAttribute("data-gc-reopen-confirm");
      const group = groupById.get(groupId);
      if (!group) return;
      const input = body.querySelector(`[data-gc-reason-input="${groupId}"]`);
      const reason = (input?.value || "").trim();
      const ok = await confirmDialog({
        title: `Reabrir Grupo ${groupId}`,
        message: `Vas a reabrir el Grupo ${groupId}. El 1o/2o oficial deja de ser definitivo y los bonos vuelven a provisional hasta que lo cierres de nuevo. ¿Confirmas?`,
        confirmLabel: "Si, reabrir",
        cancelLabel: "Cancelar",
        tone: "danger",
      });
      if (!ok) {
        setFeedback("Reapertura cancelada.");
        return;
      }
      ui.pending.add(groupId);
      ui.reasonOpenFor = null;
      render();
      try {
        await reopenGroup(groupId, reason || null);
        setFeedback(`Grupo ${groupId} reabierto${reason ? ` (motivo: ${reason})` : ""}. Recalcula en vivo sin duplicar.`);
      } catch (error) {
        setFeedback(closeErrorMessage(error));
      } finally {
        ui.pending.delete(groupId);
        render();
      }
      return;
    }
  });

  return render;
}

// Traduce los errores de las RPC de cierre a un mensaje claro inline (no alert).
function closeErrorMessage(error) {
  const msg = String(error?.message ?? "");
  if (msg.includes("PGRST202")) {
    return "Falta aplicar el SQL de cierre en Supabase (operador). No se pudo cerrar.";
  }
  if (
    msg.includes("invalid_or_expired_admin_session") ||
    msg.includes("expiro") ||
    msg.includes("P0001")
  ) {
    return "Sesion de administrador vencida. Reingresa la clave admin.";
  }
  return msg || "No fue posible completar la operacion de cierre.";
}
