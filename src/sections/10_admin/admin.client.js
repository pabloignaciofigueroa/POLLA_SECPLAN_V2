(async () => {
  const ADMIN_SESSION_KEY = "polla:adminAccessGranted";
  const ADMIN_SESSION_AT_KEY = "polla:adminAccessGrantedAt";
  const ADMIN_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

  const safeSessionGet = (key) => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeSessionRemove = (key) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {}
  };

  const clearAdminSession = () => {
    safeSessionRemove(ADMIN_SESSION_KEY);
    safeSessionRemove(ADMIN_SESSION_AT_KEY);
  };

  const hasValidAdminSession = () => {
    if (window.PollaAdminAccess?.hasValidAdminSession) {
      return window.PollaAdminAccess.hasValidAdminSession();
    }

    const granted = safeSessionGet(ADMIN_SESSION_KEY);
    const grantedAt = Number(safeSessionGet(ADMIN_SESSION_AT_KEY));
    if (granted !== "true" || !grantedAt) return false;

    if (Date.now() - grantedAt > ADMIN_SESSION_DURATION_MS) {
      clearAdminSession();
      return false;
    }

    return true;
  };

  const section = document.querySelector('[data-section="admin"]');
  if (!section) return;

  const gate = section.querySelector("[data-admin-gate]");
  const protectedPanel = section.querySelector("[data-admin-protected]");

  if (!hasValidAdminSession()) {
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

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setFeedback = (message) => {
    if (!feedback) return;
    feedback.textContent = message;
    if (!reduceMotion) {
      feedback.classList.remove("is-feedback-flash");
      void feedback.offsetWidth; // reflow para re-disparar
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

  initLiveScoreControl(section, payload, setFeedback);

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
        setFeedback("Limpieza local aplicada. El navegador quedo en version production-reset-2026-05-31.");
        return;
      }

      if (dangerousActions.has(action)) {
        if (button.dataset.confirming !== "true") {
          section.querySelectorAll("[data-admin-action][data-confirming='true']").forEach(resetCriticalConfirmation);
          button.dataset.originalLabel ||= button.textContent || "Confirmar";
          button.dataset.confirming = "true";
          button.textContent = "Confirmar accion";
          setFeedback("Accion critica local preparada. Presiona nuevamente para confirmar.");
          const timer = window.setTimeout(() => {
            resetCriticalConfirmation(button);
            setFeedback("Accion critica cancelada por tiempo.");
          }, 4500);
          criticalConfirmTimers.set(button, timer);
          return;
        }

        resetCriticalConfirmation(button);
        setFeedback("Accion critica local confirmada. No se modificaron datos del servidor.");
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

// Mini control de marcador en vivo (reemplaza la card de sesion del hero).
// Lee el fixture slim desde el payload, hidrata desde polla:liveMatchState si
// existe y guarda solo al presionar ACTUALIZAR MARCADOR.
// El helper se carga por import dinamico (modulo ?url autosuficiente, sin deps),
// mismo patron que resetPollaState para no depender del bundling del script.
async function initLiveScoreControl(section, payload, setFeedback) {
  const control = section.querySelector("[data-live-score-control]");
  if (!control) return;

  const matches = Array.isArray(payload.liveMatches) ? payload.liveMatches : [];
  if (matches.length === 0) return;

  if (!payload.liveMatchStateUrl) return;
  let readLiveMatchState, resolveCurrentMatch, saveLiveMatchState, saveOfficialResult, readOfficialResults;
  try {
    ({ readLiveMatchState, resolveCurrentMatch, saveLiveMatchState, saveOfficialResult, readOfficialResults } =
      await import(payload.liveMatchStateUrl));
  } catch {
    return;
  }

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

  // Estado inicial: marcador guardado (si existe) o partido en vivo/proximo en 0-0.
  const saved = readLiveMatchState();
  let match =
    (saved && matches.find((m) => m.matchNumber === saved.matchNumber)) ||
    resolveCurrentMatch(matches, Date.now()) ||
    matches[0];
  let homeScore = saved && match.matchNumber === saved.matchNumber ? toScore(saved.homeTeamScore) : 0;
  let awayScore = saved && match.matchNumber === saved.matchNumber ? toScore(saved.awayTeamScore) : 0;

  const render = () => {
    if (els.homeName) els.homeName.textContent = match.homeTeam.shortCode;
    if (els.awayName) els.awayName.textContent = match.awayTeam.shortCode;
    if (els.homeScore) els.homeScore.textContent = String(homeScore);
    if (els.awayScore) els.awayScore.textContent = String(awayScore);
    if (els.matchTag) els.matchTag.textContent = `P${match.matchNumber}`;
    control.dataset.matchNumber = String(match.matchNumber);
    if (els.homeMinus) els.homeMinus.disabled = homeScore <= 0;
    if (els.awayMinus) els.awayMinus.disabled = awayScore <= 0;
  };

  // Contrato del marcador vivo. Incluye matchId para que la tabla keyee directo.
  const buildState = () => ({
    id: "current",
    matchId: match.id,
    matchNumber: match.matchNumber,
    status: "live",
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    homeTeamScore: homeScore,
    awayTeamScore: awayScore,
    homeTeamId: match.homeTeam.id,
    awayTeamId: match.awayTeam.id,
    homeTeamShort: match.homeTeam.shortCode,
    awayTeamShort: match.awayTeam.shortCode,
    lastEvent: "Actualización manual desde Admin",
    updatedBy: "admin",
    updatedAt: new Date().toISOString(),
  });

  // Proximo partido aun no finalizado (para avanzar tras FINALIZAR).
  const nextOpenMatch = () => {
    const finalized = new Set(readOfficialResults().map((result) => result.matchId));
    const open = matches.filter((candidate) => !finalized.has(candidate.id));
    return resolveCurrentMatch(open, Date.now()) || open[0] || match;
  };

  control.querySelectorAll("[data-live-btn]").forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset.liveBtn) {
        case "home-plus": homeScore += 1; break;
        case "home-minus": homeScore = Math.max(0, homeScore - 1); break;
        case "away-plus": awayScore += 1; break;
        case "away-minus": awayScore = Math.max(0, awayScore - 1); break;
      }
      if (els.updateBtn) els.updateBtn.dataset.saved = "false";
      render();
    });
  });

  els.updateBtn?.addEventListener("click", () => {
    saveLiveMatchState(buildState()); // el seam dispara el evento para la tabla
    els.updateBtn.dataset.saved = "true";
    setFeedback(
      `Marcador actualizado: ${match.homeTeam.shortCode} ${homeScore} - ${awayScore} ${match.awayTeam.shortCode}.`
    );
  });

  els.finalizeBtn?.addEventListener("click", () => {
    saveOfficialResult({
      matchId: match.id,
      matchNumber: match.matchNumber,
      homeTeamId: match.homeTeam.id,
      awayTeamId: match.awayTeam.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      homeTeamScore: homeScore,
      awayTeamScore: awayScore,
      finishedAt: new Date().toISOString(),
    });
    const finishedLabel = `${match.homeTeam.shortCode} ${homeScore} - ${awayScore} ${match.awayTeam.shortCode}`;
    // Avanzar al proximo partido no finalizado en 0-0.
    match = nextOpenMatch();
    homeScore = 0;
    awayScore = 0;
    if (els.updateBtn) els.updateBtn.dataset.saved = "false";
    saveLiveMatchState(buildState());
    render();
    setFeedback(`Resultado oficializado: ${finishedLabel}. Ahora editando P${match.matchNumber}.`);
  });

  render();
}

function toScore(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
