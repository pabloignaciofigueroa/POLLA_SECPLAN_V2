import { isStatisticsUnlockedFromStorage } from "../../lib/predictions/predictionAccess.js";

(() => {
  const section = document.querySelector('[data-section="equipos"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-equipos-payload]");
  const payload = payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamSupport = new Map((payload.teamSupport ?? []).map((row) => [row.teamId, row]));
  const confirmedCards = Number(payload.confirmedCards) || 0;

  const FAV_KEY = "polla:favoriteTeams";
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const readFavorites = () => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  };

  const writeFavorites = (list) => {
    try {
      window.localStorage.setItem(FAV_KEY, JSON.stringify(list));
    } catch {
      // Storage no disponible — operación silenciosa.
    }
  };

  let favorites = new Set(readFavorites());

  const statsUnlocked = () => {
    return isStatisticsUnlockedFromStorage({
      confirmedPlayerIds: payload.confirmedPlayerIds ?? [],
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    });
  };

  const applyFavorites = () => {
    section.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
      const id = button.getAttribute("data-favorite-toggle");
      const isFav = id ? favorites.has(id) : false;
      button.setAttribute("aria-pressed", isFav ? "true" : "false");
    });
  };

  // ─────────── Group filter ───────────

  const setActiveGroup = (groupId, animate = false) => {
    section.dataset.activeGroup = groupId;
    section.querySelectorAll("[data-group-chip]").forEach((chip) => {
      const isActive = chip.getAttribute("data-group-chip") === groupId;
      chip.dataset.active = isActive ? "true" : "false";
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    section.querySelectorAll("[data-group-section]").forEach((groupSection) => {
      const id = groupSection.getAttribute("data-group-section");
      groupSection.hidden = id !== groupId;
    });
    // Replay de entrada solo en interacción del usuario (no en la carga inicial).
    if (animate && !reducedMotion.matches) {
      const shown = section.querySelector(`[data-group-section="${groupId}"]`);
      if (shown) {
        shown.classList.remove("is-swap-in");
        void shown.offsetWidth; // reflow para re-disparar
        shown.classList.add("is-swap-in");
      }
    }
  };

  const scrollToGroup = (groupId) => {
    const target = section.querySelector(`[data-group-section="${groupId}"]`);
    if (!target || typeof target.scrollIntoView !== "function") return;
    target.scrollIntoView({
      behavior: reducedMotion.matches ? "auto" : "smooth",
      block: "start",
    });
  };

  // ─────────── Modal ───────────

  const modal = section.querySelector("[data-team-modal]");

  const fillList = (selector, items, classNameItem) => {
    const list = modal.querySelector(selector);
    if (!list) return;
    list.innerHTML = "";
    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "—";
      list.append(li);
      return;
    }
    items.forEach((value) => {
      const li = document.createElement("li");
      if (classNameItem) li.className = classNameItem;
      li.textContent = value;
      list.append(li);
    });
  };

  const fillPills = (selector, items) => {
    const target = modal.querySelector(selector);
    if (!target) return;
    target.innerHTML = "";
    if (!items || items.length === 0) {
      target.textContent = "—";
      return;
    }
    items.forEach((value) => {
      const span = document.createElement("span");
      span.textContent = value;
      target.append(span);
    });
  };

  const openModal = (teamId) => {
    if (!modal) return;
    const team = teamById.get(teamId);
    if (!team) return;
    const info = team.info;
    const emptyNote = modal.querySelector("[data-modal-empty]");
    const cover = modal.querySelector("[data-modal-cover]");
    const coverImg = modal.querySelector("[data-modal-cover-img]");
    const coverSrc = team.coverImage ?? team.coverImageThumb ?? (team.id ? `/assets/teams/covers/${team.id}.webp` : "");

    if (cover && coverImg) {
      if (coverSrc) {
        coverImg.src = coverSrc;
        coverImg.alt = team.name ? `Imagen de ${team.name}` : "";
        cover.hidden = false;
      } else {
        coverImg.removeAttribute("src");
        coverImg.alt = "";
        cover.hidden = true;
      }
    }

    modal.querySelector("[data-modal-confederation]").textContent = team.confederation;
    modal.querySelector("[data-modal-name]").textContent = team.name;
    modal.querySelector("[data-modal-title]").textContent = info?.titulo ?? "Ficha pendiente";
    modal.querySelector("[data-modal-group]").textContent = `Grupo ${team.group}`;
    modal.querySelector("[data-modal-category]").textContent = info?.categoria_fuente ?? "—";

    fillPills("[data-modal-formations]", info?.formaciones ?? []);

    modal.querySelector("[data-modal-info-secondary]").textContent =
      info?.informacion_secundaria ?? "Información secundaria pendiente.";
    modal.querySelector("[data-modal-info-tertiary]").textContent =
      info?.informacion_terciaria ?? "Información ampliada pendiente.";

    modal.querySelector("[data-modal-fortaleza]").textContent =
      info?.especial?.fortaleza ?? "—";
    modal.querySelector("[data-modal-riesgo]").textContent =
      info?.especial?.riesgo ?? "—";

    fillList("[data-modal-players]", info?.especial?.jugadores_clave_mencionados ?? []);
    fillList("[data-modal-tags]", info?.especial?.tags ?? []);

    if (emptyNote) {
      emptyNote.hidden = Boolean(info);
    }

    const pulse = modal.querySelector("[data-modal-prediction-pulse]");
    const pulseTitle = modal.querySelector("[data-modal-prediction-title]");
    const pulseCopy = modal.querySelector("[data-modal-prediction-copy]");
    const pulseLink = modal.querySelector("[data-modal-prediction-link]");
    const support = teamSupport.get(team.id);
    if (pulse) pulse.dataset.unlocked = statsUnlocked() ? "true" : "false";
    if (pulseLink) pulseLink.href = `/estadisticas?tab=clasificados&team=${encodeURIComponent(team.id)}`;
    if (statsUnlocked() && support) {
      if (pulseTitle) pulseTitle.textContent = `${support.qualified}/${confirmedCards} cartones lo clasifican`;
      if (pulseCopy) pulseCopy.textContent = `${support.firstPlace} lo ponen primero de su grupo.`;
    } else {
      if (pulseTitle) pulseTitle.textContent = "DATA CENTER BLOQUEADO";
      if (pulseCopy) pulseCopy.textContent = "Completa tus 72 predicciones para revelar el apoyo de clasificación.";
    }

    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  };

  const closeModal = () => {
    if (!modal) return;
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  };

  // ─────────── Event delegation ───────────

  section.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;

    const chip = el.closest("[data-group-chip]");
    if (chip && section.contains(chip)) {
      const id = chip.getAttribute("data-group-chip");
      if (id) setActiveGroup(id, true);
      return;
    }

    const groupJump = el.closest("[data-group-jump]");
    if (groupJump && section.contains(groupJump)) {
      const id = groupJump.getAttribute("data-group-jump");
      if (id) {
        setActiveGroup(id, true);
        scrollToGroup(id);
      }
      return;
    }

    const fav = el.closest("[data-favorite-toggle]");
    if (fav && section.contains(fav)) {
      const id = fav.getAttribute("data-favorite-toggle");
      if (!id) return;
      if (favorites.has(id)) {
        favorites.delete(id);
      } else {
        favorites.add(id);
      }
      writeFavorites([...favorites]);
      applyFavorites();
      return;
    }

    const ficha = el.closest("[data-view-ficha]");
    if (ficha && section.contains(ficha)) {
      const id = ficha.getAttribute("data-view-ficha");
      if (id) openModal(id);
      return;
    }

    const closeBtn = el.closest("[data-modal-close]");
    if (closeBtn && modal && modal.contains(closeBtn)) {
      closeModal();
      return;
    }
  });

  // Click on backdrop closes the dialog (target is the <dialog> itself).
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    modal.addEventListener("cancel", (event) => {
      // Allow default ESC behaviour but ensure cleanup.
      event.preventDefault();
      closeModal();
    });
  }

  applyFavorites();
  setActiveGroup(section.dataset.activeGroup || "A");
})();
