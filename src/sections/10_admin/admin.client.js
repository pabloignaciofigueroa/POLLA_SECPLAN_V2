import {
  clearAdminSession,
  clearLiveScore,
  closeGroup,
  finalizeOfficialResult,
  hasValidAdminSession,
  readLiveMatchState,
  readOfficialResults,
  reopenGroup,
  resolveCurrentMatch,
  saveLiveMatchState,
  setLiveScore,
  subscribeLiveData,
  validateAdminSession,
} from "../../lib/liveMatch/liveMatchState.js";
import {
  buildLiveScorePayload,
  buildFinalizeResult,
  resolveAdminControlWindow,
} from "../../lib/liveMatch/liveMultiControl.js";
import {
  createPredictionEditCode,
  listPredictionEditAccess,
  revokePredictionEditAccess,
} from "../../lib/predictions/predictionEditAccess.js";
import {
  bonusPreviewFor,
  canOfferClose,
  canOfferReopen,
  groupsInPlay,
  isClosureStaleSituation,
  scorerRowsFor,
  situationFor,
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

  const liveSingleApi = await initLiveScoreControl(section, payload, setFeedback);
  // Un solo dueno del snapshot para KPI + panel de cierre + control multi (UNA sola
  // suscripcion). El subscribe del KPI reenvia cada snapshot a ambos consumidores;
  // ninguno abre un segundo canal (invariante: un solo dueno del dataset por pagina).
  // El control multi recibe la API del single para ocultarlo/refrescarlo cuando entra/sale
  // la definicion simultanea (evita dos controles del mismo partido escribiendo a la vez).
  const renderGroupClose = initGroupClosePanel(section, payload);
  const renderMultiLive = initMultiLiveControls(section, payload, setFeedback, liveSingleApi);
  initOfficialResultsKpi(section, payload, (snapshot) => {
    renderGroupClose(snapshot);
    renderMultiLive(snapshot);
  });
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
  const noopApi = { setHidden() {}, async refresh() {} };
  if (!control) return noopApi;

  const matches = Array.isArray(payload.liveMatches) ? payload.liveMatches : [];
  if (matches.length === 0) return noopApi;

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

  const setHidden = (hidden) => {
    control.hidden = Boolean(hidden);
    // El atributo `hidden` solo NO basta: .live-control trae `display:flex`, que le gana al
    // UA [hidden]{display:none}. Forzamos el display inline (gana a la clase) y lo limpiamos
    // al mostrar (la clase recupera su flex). Sin esto quedan DOS controles de SUI-CAN.
    control.style.display = hidden ? "none" : "";
  };
  // Re-resolver el partido actual sin recargar: p.ej. al salir de la definicion simultanea,
  // el dual ya finalizo los 2 finales del grupo y el "actual" ya no es el que se resolvio al
  // cargar. Re-lee oficiales y reposiciona el control single.
  const refresh = async () => {
    try {
      officialResults = await readOfficialResults();
    } catch {}
    match = nextOpenMatch(officialResults);
    homeScore = 0;
    awayScore = 0;
    if (els.updateBtn) els.updateBtn.dataset.saved = "false";
    render();
  };

  return { setHidden, refresh };
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
    [GROUP_STATE.PENDING]: "Por jugar",
    [GROUP_STATE.IN_DEFINITION]: "En definicion",
    [GROUP_STATE.PENDING_CLOSE]: "Listo para cerrar",
    [GROUP_STATE.FINAL]: "Definitivo",
    [GROUP_STATE.REOPENED]: "Reabierto",
  };

  const teamName = (group, teamId) => {
    const t = (group.teams || []).find((x) => x.id === teamId);
    return t ? t.name : teamId ?? "—";
  };

  const playerName = (id) => {
    const p = players.find((x) => x.id === id);
    return p ? p.name : id ?? "—";
  };

  // Desglose POR JUGADOR de quien suma el bono del grupo (en vivo): nombre, su pick de 1o/2o
  // (verde + el valor si acerto el equipo que va 1o/2o ahora) y su subtotal. Fuente unica
  // scorerRowsFor -> buildGroupBonuses (CERO formula nueva); se re-pinta en cada snapshot.
  const renderScorers = (group) => {
    const { rows, started, firstValue, secondValue } = scorerRowsFor(group, {
      players,
      qualifiedPredictions,
      groups,
      fixture,
      snapshot,
    });
    if (rows.length === 0) return "";
    // Antes de empezar: solo la prediccion (sin +valor). En vivo/final: verde + el valor si acerto.
    const pickCell = (teamId, hit, value) => {
      const name = teamId ? teamName(group, teamId) : "—";
      if (!started) return `<span class="gc-pick">${escapeHtml(name)}</span>`;
      return `<span class="gc-pick${hit ? " is-hit" : ""}">${escapeHtml(name)}${hit ? ` +${value}` : ""}</span>`;
    };
    const sumCell = (points) => (!started ? "—" : points > 0 ? "+" + points : "0");
    const rowsHtml = rows
      .map(
        (row) => `<tr>
          <td class="gc-scorer-name">${escapeHtml(playerName(row.playerId))}</td>
          <td>${pickCell(row.firstTeamId, row.firstHit, firstValue)}</td>
          <td>${pickCell(row.secondTeamId, row.secondHit, secondValue)}</td>
          <td class="gc-scorer-sum">${sumCell(row.points)}</td>
        </tr>`
      )
      .join("");
    const note = started
      ? ""
      : `<p class="gc-scorers-note">Aun no empieza la definicion: se muestran las predicciones; nadie suma todavia (guion).</p>`;
    return `<div class="gc-scorers">
        <p class="gc-scorers-title">Quien suma en el grupo${started ? " (en vivo)" : " — predicciones"}</p>
        ${note}
        <table>
          <thead><tr><th>Jugador</th><th>1o (+${firstValue})</th><th>2o (+${secondValue})</th><th>Suma</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
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
        <div class="gc-card-main">
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
        </div>
        <div class="gc-card-side">
          ${renderScorers(group)}
        </div>
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
    // "En juego" = EN DEFINICION (finales en curso, para ver el desglose en vivo) + estados de
    // cierre. Sin grupos en juego el panel queda oculto (cero regresion).
    const relevant = groupsInPlay(groups, { fixture, snapshot });
    if (relevant.length === 0) {
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
    return situationFor(group, { fixture, snapshot });
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

// ── Stage 2: control MULTI-marcador (DEFINICION SIMULTANEA) ─────────────────────
// Devuelve render(snapshot): el dueno del snapshot (initOfficialResultsKpi) lo invoca en
// cada emit. NO abre subscribeLiveData propio (un solo dueno del dataset). Cuando el partido
// actual tiene un PAR simultaneo (los 2 finales de la 3a fecha del mismo grupo, misma hora),
// muestra DOS controles lado a lado RESUELTOS DESDE EL FIXTURE (no solo lo ya vivo): permite
// ARRANCAR cada partido desde cero ("Iniciar en vivo"), actualizarlo (setLiveScore por
// matchId), limpiarlo (clearLiveScore) y finalizarlo (finalizeOfficialResult) SIN tocar el
// otro. Mientras el dual esta activo, OCULTA el control single del hero (mismo partido =
// SUI-CAN) para que no haya dos controles escribiendo a la vez. Con un solo partido en la
// ventana, el panel queda oculto y el single del hero sigue mandando (N=1 byte-igual).
//
// La escritura multi va detras de MULTI_LIVE_WRITE_ENABLED (guardrail, ya en true en prod).
function initMultiLiveControls(section, payload, setFeedback, singleApi = null) {
  const panel = section.querySelector("[data-live-controls]");
  if (!panel) return () => {};
  const body = panel.querySelector("[data-live-controls-body]");
  const feedback = panel.querySelector("[data-live-controls-feedback]");
  if (!body) return () => {};

  const fixtureMatches = Array.isArray(payload.liveMatches) ? payload.liveMatches : [];
  if (fixtureMatches.length === 0) return () => {};
  const fixture = { matches: fixtureMatches };

  const setLocalFeedback = (msg) => {
    if (feedback) feedback.textContent = msg;
    if (typeof setFeedback === "function") setFeedback(msg);
  };
  const escapeHtml = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // Estado local de edicion por matchId (lo que el admin lleva sin guardar). No viene del
  // snapshot: se preserva entre re-renders para no perder los steppers mientras edita.
  const edits = new Map(); // matchId -> { home, away }
  const pending = new Set(); // matchId con accion en curso
  let controls = [];
  let wasSimultaneous = false; // para refrescar el single al salir de la definicion simultanea

  const editFor = (control) => {
    if (!edits.has(control.matchId)) {
      edits.set(control.matchId, { home: control.homeScore, away: control.awayScore });
    }
    return edits.get(control.matchId);
  };

  const renderCard = (control) => {
    const editable = control.editable; // live o ready (preparable)
    const isLive = control.phase === "live";
    const isReady = control.phase === "ready";
    const edit = editFor(control);
    const busy = pending.has(control.matchId);
    const stateLabel = isLive ? "EN VIVO" : isReady ? "POR INICIAR" : "OFICIAL";
    const tag = `P${control.displayNumber}`;
    const home = editable ? edit.home : control.homeScore;
    const away = editable ? edit.away : control.awayScore;

    const stepper = (side, value) => `
      <div class="lc-stepper">
        <button type="button" class="lc-step minus" data-lc-step="${escapeHtml(control.matchId)}:${side}:-" ${value <= 0 || busy ? "disabled" : ""}>−</button>
        <span class="lc-score" data-lc-score="${escapeHtml(control.matchId)}:${side}">${value}</span>
        <button type="button" class="lc-step plus" data-lc-step="${escapeHtml(control.matchId)}:${side}:+" ${busy ? "disabled" : ""}>+</button>
      </div>`;

    const board = `
      <div class="lc-board">
        <div class="lc-team">
          <span class="lc-team-name">${escapeHtml(control.homeTeam.shortCode || control.homeTeam.name)}</span>
          ${editable ? stepper("home", home) : `<span class="lc-score">${home}</span>`}
        </div>
        <span class="lc-versus" aria-hidden="true">—</span>
        <div class="lc-team">
          <span class="lc-team-name">${escapeHtml(control.awayTeam.shortCode || control.awayTeam.name)}</span>
          ${editable ? stepper("away", away) : `<span class="lc-score">${away}</span>`}
        </div>
      </div>`;

    const actions = editable
      ? `<div class="lc-actions">
           <button type="button" class="lc-update" data-lc-update="${escapeHtml(control.matchId)}" ${busy ? "disabled" : ""}>${isReady ? "Iniciar en vivo" : "Actualizar"}</button>
           <button type="button" class="lc-finalize" data-lc-finalize="${escapeHtml(control.matchId)}" ${busy ? "disabled" : ""}>Finalizar</button>
           ${isLive ? `<button type="button" class="lc-clear" data-lc-clear="${escapeHtml(control.matchId)}" ${busy ? "disabled" : ""}>Quitar</button>` : ""}
         </div>`
      : `<p class="lc-official-note">Ya oficializado. Se administra desde "Avance de partidos".</p>`;

    return `
      <article class="lc-card" data-phase="${control.phase}" data-match-id="${escapeHtml(control.matchId)}">
        <header class="lc-card-head">
          <span class="lc-dot" aria-hidden="true"></span>
          <span class="lc-tag">${escapeHtml(tag)}</span>
          <span class="lc-state">${stateLabel}</span>
        </header>
        ${board}
        ${actions}
      </article>`;
  };

  const render = (snapshot) => {
    const snap = snapshot ?? { liveMatches: [], officialResults: [] };
    // Resuelve el PAR simultaneo desde el FIXTURE (no solo lo ya vivo) -> permite bootstrap.
    const model = resolveAdminControlWindow({
      fixture,
      liveMatches: snap.liveMatches ?? [],
      officialResults: snap.officialResults ?? [],
    });
    controls = model.controls;
    const controlById = new Map(controls.map((c) => [c.matchId, c]));

    // Sincronizar el estado local de edicion con la ventana entrante: drop de los que ya no
    // son editables (p.ej. recien oficializados); los nuevos se siembran al pintar (editFor),
    // sin pisar una edicion en curso del admin.
    for (const matchId of Array.from(edits.keys())) {
      const c = controlById.get(matchId);
      if (!c || !c.editable) edits.delete(matchId);
    }

    // CERO regresion / N=1 byte-igual: el panel SOLO aparece cuando el partido actual tiene un
    // PAR simultaneo (mismo grupo + misma hora). Con un solo partido en la ventana queda
    // oculto y el control single del hero sigue mandando.
    if (!model.simultaneous) {
      panel.hidden = true;
      body.innerHTML = "";
      singleApi?.setHidden(false);
      // Si venia de estar activo (los 2 finales ya se finalizaron), reposiciona el single al
      // partido actual real sin recargar.
      if (wasSimultaneous) singleApi?.refresh();
      wasSimultaneous = false;
      return;
    }

    // Definicion simultanea activa: el dual manda; oculta el single del hero para que NO haya
    // dos controles del mismo partido (SUI-CAN) escribiendo a la vez.
    singleApi?.setHidden(true);
    wasSimultaneous = true;
    panel.hidden = false;

    const groupIds = Object.keys(model.byGroup);
    body.innerHTML = groupIds
      .map((groupId) => {
        const cards = model.byGroup[groupId].map(renderCard).join("");
        const label = `<p class="lc-group-label">Grupo ${escapeHtml(groupId)} · definicion simultanea</p>`;
        return `<div class="lc-group">${label}<div class="lc-grid">${cards}</div></div>`;
      })
      .join("");
  };

  const controlById = () => new Map(controls.map((c) => [c.matchId, c]));
  const repaintScores = (matchId) => {
    const edit = edits.get(matchId);
    if (!edit) return;
    const homeEl = body.querySelector(`[data-lc-score="${matchId}:home"]`);
    const awayEl = body.querySelector(`[data-lc-score="${matchId}:away"]`);
    if (homeEl) homeEl.textContent = String(edit.home);
    if (awayEl) awayEl.textContent = String(edit.away);
    const homeMinus = body.querySelector(`[data-lc-step="${matchId}:home:-"]`);
    const awayMinus = body.querySelector(`[data-lc-step="${matchId}:away:-"]`);
    if (homeMinus) homeMinus.disabled = edit.home <= 0;
    if (awayMinus) awayMinus.disabled = edit.away <= 0;
    const update = body.querySelector(`[data-lc-update="${matchId}"]`);
    if (update) update.dataset.saved = "false";
  };

  body.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const stepBtn = target.closest("[data-lc-step]");
    if (stepBtn) {
      const [matchId, side, dir] = stepBtn.getAttribute("data-lc-step").split(":");
      const edit = edits.get(matchId);
      if (!edit) return;
      if (dir === "+") edit[side] += 1;
      else edit[side] = Math.max(0, edit[side] - 1);
      repaintScores(matchId);
      return;
    }

    const updateBtn = target.closest("[data-lc-update]");
    if (updateBtn) {
      const matchId = updateBtn.getAttribute("data-lc-update");
      const control = controlById().get(matchId);
      const edit = edits.get(matchId);
      if (!control || !edit || pending.has(matchId)) return;
      pending.add(matchId);
      try {
        await setLiveScore(
          buildLiveScorePayload(control, { homeScore: edit.home, awayScore: edit.away })
        );
        updateBtn.dataset.saved = "true";
        setLocalFeedback(
          `Marcador de P${control.displayNumber} actualizado: ${control.homeTeam.shortCode} ${edit.home} - ${edit.away} ${control.awayTeam.shortCode}.`
        );
      } catch (error) {
        setLocalFeedback(liveControlErrorMessage(error));
      } finally {
        pending.delete(matchId);
      }
      return;
    }

    const clearBtn = target.closest("[data-lc-clear]");
    if (clearBtn) {
      const matchId = clearBtn.getAttribute("data-lc-clear");
      const control = controlById().get(matchId);
      if (!control || pending.has(matchId)) return;
      const ok = await confirmDialog({
        title: `Quitar marcador P${control.displayNumber}`,
        message: `Vas a quitar el marcador en vivo de ${control.homeTeam.name} vs ${control.awayTeam.name}. El otro partido del grupo NO se toca. ¿Confirmas?`,
        confirmLabel: "Si, quitar",
        cancelLabel: "Cancelar",
        tone: "danger",
      });
      if (!ok) {
        setLocalFeedback("Limpieza cancelada. No se quito ningun marcador.");
        return;
      }
      pending.add(matchId);
      try {
        await clearLiveScore(matchId);
        edits.delete(matchId);
        setLocalFeedback(`Marcador de P${control.displayNumber} quitado. El otro sigue intacto.`);
      } catch (error) {
        setLocalFeedback(liveControlErrorMessage(error));
      } finally {
        pending.delete(matchId);
      }
      return;
    }

    const finalizeBtn = target.closest("[data-lc-finalize]");
    if (finalizeBtn) {
      const matchId = finalizeBtn.getAttribute("data-lc-finalize");
      const control = controlById().get(matchId);
      const edit = edits.get(matchId);
      if (!control || !edit || pending.has(matchId)) return;
      const label = `${control.homeTeam.shortCode} ${edit.home} - ${edit.away} ${control.awayTeam.shortCode}`;
      const ok = await confirmDialog({
        title: `Finalizar P${control.displayNumber}`,
        message: `Vas a oficializar ${label}. Esto entrega puntos y deja SOLO este partido como finalizado; el otro final del grupo sigue en vivo. ¿Confirmas?`,
        confirmLabel: "Si, finalizar",
        cancelLabel: "Cancelar",
        tone: "danger",
      });
      if (!ok) {
        setLocalFeedback("Finalizacion cancelada. No se modifico ningun resultado.");
        return;
      }
      pending.add(matchId);
      try {
        // next-live = null: en multi NO se auto-avanza al siguiente partido (eso es el
        // flujo single N=1). La RPC limpia SOLO la fila live de ESTE match; el otro queda.
        await finalizeOfficialResult(buildFinalizeResult(control, { homeScore: edit.home, awayScore: edit.away }), null);
        edits.delete(matchId);
        setLocalFeedback(`P${control.displayNumber} finalizado: ${label}. El otro final del grupo sigue en vivo.`);
      } catch (error) {
        setLocalFeedback(liveControlErrorMessage(error));
      } finally {
        pending.delete(matchId);
      }
      return;
    }
  });

  return render;
}

// Mensaje inline para las RPC del control multi (nunca alert). PGRST202 -> falta el SQL;
// guardrail deshabilitado -> falta subir el flag tras aplicar la migracion; P0001 -> sesion.
function liveControlErrorMessage(error) {
  const msg = String(error?.message ?? "");
  if (msg.includes("PGRST202")) {
    return "Falta aplicar la migracion multi-fila en Supabase (operador). No se pudo guardar.";
  }
  if (msg.includes("deshabilitado") || msg.includes("MULTI_LIVE_WRITE_ENABLED")) {
    return "Escritura multi deshabilitada: el operador debe aplicar la migracion y subir el flag.";
  }
  if (
    msg.includes("invalid_or_expired_admin_session") ||
    msg.includes("expiro") ||
    msg.includes("P0001")
  ) {
    return "Sesion de administrador vencida. Reingresa la clave admin.";
  }
  return msg || "No fue posible completar la operacion del marcador.";
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
