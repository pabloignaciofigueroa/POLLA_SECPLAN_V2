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

  section.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    window.PollaAdminAccess?.clearAdminSession?.();
    clearAdminSession();
    window.location.href = "/";
  });

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
