import {
  clearAdminSession,
  finalizeOfficialResult,
  hasValidAdminSession,
  readLiveMatchState,
  readOfficialResults,
  resolveCurrentMatch,
  saveLiveMatchState,
  validateAdminSession,
} from "../../lib/liveMatch/liveMatchState.js";

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
    if (els.matchTag) els.matchTag.textContent = `P${match.matchNumber}`;
    control.dataset.matchNumber = String(match.matchNumber);
    if (els.homeMinus) els.homeMinus.disabled = homeScore <= 0;
    if (els.awayMinus) els.awayMinus.disabled = awayScore <= 0;
  };

  const buildState = (
    targetMatch = match,
    targetHomeScore = homeScore,
    targetAwayScore = awayScore
  ) => ({
    id: "current",
    matchId: targetMatch.id,
    matchNumber: targetMatch.matchNumber,
    status: "live",
    homeTeam: targetMatch.homeTeam.name,
    awayTeam: targetMatch.awayTeam.name,
    homeTeamScore: targetHomeScore,
    awayTeamScore: targetAwayScore,
    homeTeamId: targetMatch.homeTeam.id,
    awayTeamId: targetMatch.awayTeam.id,
    homeTeamShort: targetMatch.homeTeam.shortCode,
    awayTeamShort: targetMatch.awayTeam.shortCode,
    lastEvent: "Actualizacion manual desde Admin",
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
    const finishedLabel = `${match.homeTeam.shortCode} ${homeScore} - ${awayScore} ${match.awayTeam.shortCode}`;
    const nextResults = officialResults
      .filter((item) => item?.matchId !== result.matchId)
      .concat(result);
    const nextMatch = nextOpenMatch(nextResults);
    const nextState = buildState(nextMatch, 0, 0);

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
        `Resultado oficializado globalmente: ${finishedLabel}. Ahora editando P${match.matchNumber}.`
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
