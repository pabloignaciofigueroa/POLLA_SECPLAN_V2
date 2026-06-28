// Captura del PODIO (campeon / subcampeon / 3o / 4o). 100% local.
// Guarda por jugador en localStorage (polla:podiumPredictions). Evita repetir equipos.
import { PODIUM_SLOTS, validatePodium } from "../../lib/knockout/podium.js";

(() => {
  const section = document.querySelector('[data-section="podio"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-podium-payload]");
  const payload = payloadNode ? JSON.parse(payloadNode.textContent || "{}") : {};
  const slots = payload.slots ?? [];
  const slotByCode = new Map(slots.map((s) => [s.code, s]));
  const validCodes = new Set(slots.map((s) => s.code));

  const PODIUM_KEY = "polla:podiumPredictions";

  const safeGet = (key) => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  };
  const safeSet = (key, value) => {
    try { window.localStorage.setItem(key, value); } catch {}
  };
  const readJson = (key, fallback) => {
    try {
      const parsed = JSON.parse(safeGet(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch { return fallback; }
  };

  const getPlayerId = () => {
    try {
      const q = new URL(window.location.href).searchParams.get("player");
      if (q) return q;
    } catch {}
    return safeGet("polla:selectedPlayerId") || "invitado";
  };
  const playerId = getPlayerId();

  const allPodium = readJson(PODIUM_KEY, {});
  const bucket = allPodium[playerId] ?? {};

  const statusNode = section.querySelector("[data-podium-status]");
  const identityNode = section.querySelector("[data-podium-identity]");
  const selects = new Map(
    PODIUM_SLOTS.map((key) => [key, section.querySelector(`[data-podium-spot="${key}"]`)]).filter(
      ([, el]) => el,
    ),
  );

  // identidad
  const snap = readJson("polla:selectedPlayerSnapshot", null);
  if (identityNode) {
    const name = snap?.name ?? snap?.displayName ?? "";
    if (name) {
      identityNode.textContent = `Jugando como ${name}`;
    } else {
      identityNode.innerHTML = 'Aún no elegiste jugador · <a href="/jugador">Elige tu jugador</a>';
    }
    identityNode.hidden = false;
  }

  const persist = () => {
    allPodium[playerId] = bucket;
    safeSet(PODIUM_KEY, JSON.stringify(allPodium));
  };

  const updatePreview = (key) => {
    const span = section.querySelector(`[data-podium-preview="${key}"]`);
    if (!span) return;
    const code = bucket[key];
    const slot = code ? slotByCode.get(code) : null;
    if (slot && slot.flag) {
      span.innerHTML = `<img src="${slot.flag}" alt="" loading="lazy" decoding="async" width="64" height="48" />`;
    } else if (slot) {
      span.textContent = slot.shortCode || "?";
    } else {
      span.textContent = "";
    }
    const card = section.querySelector(`[data-podium-card="${key}"]`);
    if (card) card.dataset.filled = code ? "true" : "false";
  };

  const refreshDisabledOptions = () => {
    const chosen = new Map(); // code -> key que lo tiene
    for (const key of PODIUM_SLOTS) {
      if (bucket[key]) chosen.set(bucket[key], key);
    }
    for (const [key, select] of selects) {
      Array.from(select.options).forEach((opt) => {
        if (!opt.value) return;
        const owner = chosen.get(opt.value);
        opt.disabled = Boolean(owner) && owner !== key;
      });
    }
  };

  const updateStatus = () => {
    const result = validatePodium(bucket, validCodes);
    if (!statusNode) return;
    if (result.isComplete) {
      statusNode.textContent = "Podio completo 🎉 (4/4).";
      statusNode.dataset.error = "false";
    } else if (result.errors.length) {
      statusNode.textContent = result.errors.join(" ");
      statusNode.dataset.error = "true";
    } else {
      statusNode.textContent = `Podio ${result.filled}/4.`;
      statusNode.dataset.error = "false";
    }
  };

  // init
  for (const [key, select] of selects) {
    if (bucket[key] && validCodes.has(bucket[key])) {
      select.value = bucket[key];
    }
    select.addEventListener("change", () => {
      const value = select.value;
      if (value) bucket[key] = value;
      else delete bucket[key];
      persist();
      refreshDisabledOptions();
      updatePreview(key);
      updateStatus();
    });
    updatePreview(key);
  }
  refreshDisabledOptions();
  updateStatus();
})();
