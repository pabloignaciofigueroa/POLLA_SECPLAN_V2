(async () => {
  const section = document.querySelector('[data-section="estadisticas"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-estadisticas-payload]");
  const payload = (() => {
    try {
      return payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
    } catch {
      return {};
    }
  })();

  if (payload.resetStateUrl) {
    try {
      const resetModule = await import(payload.resetStateUrl);
      resetModule.ensurePollaStorageVersion?.();
    } catch {
      // El estado bloqueado inicial sigue siendo valido.
    }
  }
  const TOTAL = Number(payload.totalPredictions) || 72;
  const TARGET = payload.targetRoute || "/predicciones";

  const safeRead = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const parseJson = (raw, fallback) => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const computeSnapshot = () => {
    const playerId = safeRead("polla:selectedPlayerId");
    const store = parseJson(safeRead("polla:predictions"), null);
    if (!store || !playerId || !store[playerId]) {
      return { completed: 0, total: TOTAL, percent: 0, state: "locked" };
    }
    const bucket = store[playerId];
    const completed = Object.values(bucket).filter(
      (record) => record && record.status === "complete"
    ).length;
    const safeCompleted = Math.min(completed, TOTAL);
    const percent = TOTAL > 0 ? Math.round((safeCompleted / TOTAL) * 100) : 0;
    return {
      completed: safeCompleted,
      total: TOTAL,
      percent,
      state: safeCompleted >= TOTAL ? "unlocked" : "locked",
    };
  };

  const applySnapshot = (snapshot) => {
    section.dataset.state = snapshot.state;

    const completedNode = section.querySelector("[data-progress-completed]");
    if (completedNode) completedNode.textContent = String(snapshot.completed);

    const totalNode = section.querySelector("[data-progress-total]");
    if (totalNode) totalNode.textContent = String(snapshot.total);

    const percentNode = section.querySelector("[data-progress-percent]");
    if (percentNode) percentNode.textContent = `${snapshot.percent}%`;

    const bar = section.querySelector("[data-progress-bar]");
    if (bar) {
      // Sin animacion en la carga inicial: la barra aparece directo en su ancho
      // final, no crece de 0 -> X% (eso se percibia como "cargando algo").
      bar.style.transition = "none";
      bar.style.width = `${snapshot.percent}%`;
      void bar.offsetWidth;
      bar.style.transition = "";
    }

    const card = section.querySelector("[data-progress-card]");
    if (card) card.dataset.state = snapshot.state;

    const ctaLabel = section.querySelector("[data-cta-label]");
    if (ctaLabel) {
      ctaLabel.textContent = snapshot.state === "unlocked"
        ? "VER ESTADÍSTICAS COMPLETAS"
        : "IR A PREDICCIONES";
    }

    const banner = section.querySelector("[data-unlocked-banner]");
    if (banner) banner.hidden = snapshot.state !== "unlocked";

    // Burst arcade al desbloquear: el orbe de candado estalla y desaparece.
    if (snapshot.state === "unlocked") {
      const orb = section.querySelector("[data-lock-orb]");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (orb && !reduce && !orb.classList.contains("is-unlock-burst")) {
        orb.classList.add("is-unlock-burst");
      }
    }

    const helper = section.querySelector("[data-progress-helper]");
    if (helper) {
      helper.textContent = snapshot.state === "unlocked"
        ? "Ya completaste tus 72 predicciones. El data center está activo."
        : "Cada predicción confirmada te acerca a desbloquear todas las estadísticas.";
    }
  };

  const cta = section.querySelector("[data-primary-cta]");
  if (cta) {
    cta.setAttribute("href", TARGET);
    cta.addEventListener("click", () => {
      try {
        window.localStorage.setItem("polla:activePredictionGroup", "A");
        window.sessionStorage.setItem("polla:activePredictionGroupIntent", "A");
      } catch {
        // Storage no disponible — la navegación sigue.
      }
    });
  }

  // El SSR ya renderizo el estado inicial (locked, 0/72) con sus estilos.
  // Solo re-aplicamos si el progreso real del jugador difiere, para no re-tocar
  // el DOM ni animar la barra en cada carga (evita el flash "SSR -> estado final").
  const snapshot = computeSnapshot();
  if (snapshot.state !== "locked" || snapshot.completed !== 0) {
    applySnapshot(snapshot);
  }
})();
