export const PLAYER_IDENTITY_EVENT = "polla:player-identity-confirmed";

export const PLAYER_IDENTITY_KEYS = {
  selectedPlayerId: "polla:selectedPlayerId",
  playerConfirmed: "polla:playerConfirmed",
  selectedPlayerSnapshot: "polla:selectedPlayerSnapshot",
};

const safeGet = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeSet = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Identity is best-effort; URL handoff still covers navigation.
  }
};

const safeParse = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const playerMap = (players = []) => new Map(players.map((player) => [player.id, player]));

const snapshotFromPlayer = (player) => ({
  id: player.id,
  name: player.name,
  avatar: player.avatar ?? "",
  avatarThumb: player.avatarThumb ?? player.avatar ?? "",
});

const completeSnapshot = (snapshot, playersById) => {
  if (!snapshot?.id) return null;
  const player = playersById.get(snapshot.id);
  if (!player) return null;

  return {
    ...snapshotFromPlayer(player),
    ...snapshot,
    id: player.id,
    name: snapshot.name || player.name,
    avatar: snapshot.avatar || player.avatar || "",
    avatarThumb: snapshot.avatarThumb || player.avatarThumb || player.avatar || "",
  };
};

export function publishConfirmedPlayer(snapshot) {
  if (typeof window === "undefined" || !snapshot?.id) return null;

  const normalized = {
    id: snapshot.id,
    name: snapshot.name ?? "",
    avatar: snapshot.avatar ?? "",
    avatarThumb: snapshot.avatarThumb ?? snapshot.avatar ?? "",
  };
  const serialized = JSON.stringify(normalized);

  safeSet(window.localStorage, PLAYER_IDENTITY_KEYS.selectedPlayerId, normalized.id);
  safeSet(window.localStorage, PLAYER_IDENTITY_KEYS.playerConfirmed, "true");
  safeSet(window.localStorage, PLAYER_IDENTITY_KEYS.selectedPlayerSnapshot, serialized);
  safeSet(window.sessionStorage, PLAYER_IDENTITY_KEYS.selectedPlayerId, normalized.id);
  safeSet(window.sessionStorage, PLAYER_IDENTITY_KEYS.playerConfirmed, "true");
  safeSet(window.sessionStorage, PLAYER_IDENTITY_KEYS.selectedPlayerSnapshot, serialized);

  window.dispatchEvent(new CustomEvent(PLAYER_IDENTITY_EVENT, { detail: normalized }));
  return normalized;
}

export function resolveConfirmedPlayer(players = [], options = {}) {
  if (typeof window === "undefined") return null;

  const playersById = playerMap(players);
  const url = options.url ?? window.location.href;

  try {
    const playerId = new URL(url, window.location.origin).searchParams.get("player");
    const player = playersById.get(playerId);
    if (player) return publishConfirmedPlayer(snapshotFromPlayer(player));
  } catch {
    // Ignore malformed URL and continue with storage.
  }

  const confirmed =
    safeGet(window.localStorage, PLAYER_IDENTITY_KEYS.playerConfirmed) === "true" ||
    safeGet(window.sessionStorage, PLAYER_IDENTITY_KEYS.playerConfirmed) === "true";
  const storedId =
    safeGet(window.localStorage, PLAYER_IDENTITY_KEYS.selectedPlayerId) ||
    safeGet(window.sessionStorage, PLAYER_IDENTITY_KEYS.selectedPlayerId);

  if (confirmed && playersById.has(storedId)) {
    const snapshot =
      completeSnapshot(safeParse(safeGet(window.localStorage, PLAYER_IDENTITY_KEYS.selectedPlayerSnapshot)), playersById) ||
      completeSnapshot(safeParse(safeGet(window.sessionStorage, PLAYER_IDENTITY_KEYS.selectedPlayerSnapshot)), playersById) ||
      snapshotFromPlayer(playersById.get(storedId));
    return publishConfirmedPlayer(snapshot);
  }

  const snapshot =
    completeSnapshot(safeParse(safeGet(window.localStorage, PLAYER_IDENTITY_KEYS.selectedPlayerSnapshot)), playersById) ||
    completeSnapshot(safeParse(safeGet(window.sessionStorage, PLAYER_IDENTITY_KEYS.selectedPlayerSnapshot)), playersById);

  return snapshot ? publishConfirmedPlayer(snapshot) : null;
}

export function syncPredictionLinks(root = document, snapshot) {
  if (typeof window === "undefined" || !snapshot?.id) return;

  root.querySelectorAll('a[href="/predicciones"], a[href^="/predicciones?"]').forEach((link) => {
    const url = new URL(link.getAttribute("href") || "/predicciones", window.location.origin);
    url.searchParams.set("player", snapshot.id);
    link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
  });
}
