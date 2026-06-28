// Captura de la polla de ELIMINATORIAS (bracket completo). 100% local.
// Resuelve la llave con los resultados vivos, habilita SOLO los cruces predecibles (ambos
// lados concretos y sin jugar), parchea equipos resueltos y guarda por jugador en
// localStorage (polla:knockoutPredictions). Empate => elegir avance; si no, avance automatico.
import { toScore, isTie, inferAdvance, predictionStatus, validateKnockout } from "../../lib/knockout/validation.js";
import { buildKnockoutPayload, buildFileName, downloadJson } from "./predicciones.export.js";
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket } from "../../lib/knockout/bracket.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";

(() => {
  const section = document.querySelector('[data-section="predicciones"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-knockout-predict-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };

  const KO_KEY = "polla:knockoutPredictions";
  const PODIUM_KEY = "polla:podiumPredictions";
  const FINAL_KEY = "polla:finalDownloaded";
  const FINAL_AT_KEY = "polla:finalDownloadedAt";
  const FINAL_NAME_KEY = "polla:finalDownloadedFilename";
  const FINAL_PAYLOAD_KEY = "polla:finalSubmissionPayload";

  const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch {} };
  const readJson = (k, fb) => { try { const p = JSON.parse(safeGet(k) || "null"); return p && typeof p === "object" ? p : fb; } catch { return fb; } };

  const getPlayerId = () => {
    try { const q = new URL(window.location.href).searchParams.get("player"); if (q) return q; } catch {}
    return safeGet("polla:selectedPlayerId") || "invitado";
  };
  const getPlayer = () => {
    const snap = readJson("polla:selectedPlayerSnapshot", null);
    return { id: getPlayerId(), name: snap?.name ?? snap?.displayName ?? "" };
  };

  const playerId = getPlayerId();
  const allKo = readJson(KO_KEY, {});
  const bucket = allKo[playerId] ?? {};
  const readPodium = () => readJson(PODIUM_KEY, {})[playerId] ?? {};

  const statusNode = section.querySelector("[data-pred-status]");
  const downloadBtn = section.querySelector("[data-pred-download]");
  const identityNode = section.querySelector("[data-pred-identity]");
  const isLocked = () => safeGet(FINAL_KEY) === "true";

  // identidad
  const player = getPlayer();
  if (identityNode) {
    identityNode.hidden = false;
    identityNode.innerHTML = player.name
      ? `Jugando como ${player.name}`
      : 'Aún no elegiste jugador · <a href="/jugador">Elige tu jugador</a>';
  }

  const cards = Array.from(section.querySelectorAll("[data-ko-match]"));
  const cardById = new Map(cards.map((c) => [c.getAttribute("data-ko-match"), c]));

  let resolvedById = new Map();
  let predictableMatches = [];

  const flagHtml = (slot) =>
    slot.flag
      ? `<img src="${slot.flag}" alt="" loading="lazy" decoding="async" width="64" height="48" style="width:1.85rem;height:1.85rem;border-radius:999px;object-fit:cover;display:block;border:1px solid rgba(7,23,53,0.12);">`
      : `<span style="display:inline-grid;place-items:center;width:1.85rem;height:1.85rem;border-radius:999px;background:rgba(18,109,255,0.08);color:#1a3a8a;border:1px dashed rgba(7,23,53,0.12);font-weight:900;font-size:0.8rem;">?</span>`;

  const reflectAdvanceButtons = (card, advances) => {
    card.querySelectorAll("[data-advance-pick]").forEach((btn) => {
      const active = advances === btn.getAttribute("data-advance-pick");
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.dataset.active = active ? "true" : "false";
    });
  };

  const setCardStatus = (card, prediction) => {
    const editable = card.dataset.koEditable === "true";
    if (!editable) return;
    const st = prediction ? prediction.status : "empty";
    card.dataset.status = st;
    const pill = card.querySelector("[data-ko-status-pill]");
    if (pill) pill.textContent = st === "complete" ? "Completo" : st === "partial" ? "Incompleto" : "Por jugar";
  };

  const patchCard = (card, r) => {
    // Equipos resueltos + labels de avance.
    const setSide = (side, slot) => {
      const flag = card.querySelector(`[data-ko-flag="${side}"]`);
      const name = card.querySelector(`[data-ko-name="${side}"]`);
      const pick = card.querySelector(`[data-ko-pick="${side}"]`);
      if (flag) flag.innerHTML = flagHtml(slot);
      if (name) { name.textContent = slot.name; name.dataset.concrete = slot.concrete ? "true" : "false"; }
      if (pick) pick.textContent = slot.shortCode || (side === "home" ? "LOC" : "VIS");
    };
    setSide("home", r.slotA);
    setSide("away", r.slotB);

    const editable = r.predictionEnabled && !isLocked();
    card.dataset.koEditable = editable ? "true" : "false";

    const inputs = card.querySelectorAll("[data-score-input]");
    const buttons = card.querySelectorAll("[data-advance-pick]");
    inputs.forEach((inp) => { inp.disabled = !editable; if (!editable) inp.dataset.state = "locked"; else delete inp.dataset.state; });
    buttons.forEach((b) => { b.disabled = !editable; });

    const pill = card.querySelector("[data-ko-status-pill]");
    if (!editable && pill) pill.textContent = r.played ? "Final" : "Bloqueado";

    // Hidratar valores guardados.
    const stored = bucket[card.getAttribute("data-ko-match")];
    const homeInput = card.querySelector('[data-score-input="home"]');
    const awayInput = card.querySelector('[data-score-input="away"]');
    if (homeInput) homeInput.value = stored && stored.homeScore != null ? String(stored.homeScore) : "";
    if (awayInput) awayInput.value = stored && stored.awayScore != null ? String(stored.awayScore) : "";
    reflectAdvanceButtons(card, stored?.advances ?? null);
    if (editable) setCardStatus(card, stored);
  };

  const applyResolution = () => {
    const live = readLiveKnockout(seed);
    const resolved = resolveBracket(matches, { assignments: live.assignments, results: live.results, teamsByCode });
    resolvedById = new Map(resolved.map((r) => [r.match.id, r]));
    predictableMatches = resolved
      .filter((r) => r.predictionEnabled)
      .map((r) => ({ id: r.match.id, bracketSlot: r.match.bracketSlot, matchNumber: r.match.matchNumber, predictionEnabled: true }));

    cards.forEach((card) => {
      const r = resolvedById.get(card.getAttribute("data-ko-match"));
      if (r) patchCard(card, r);
    });
    updateStatus();
  };

  const persist = () => {
    for (const key of Object.keys(bucket)) {
      const e = bucket[key];
      if (!e || e.status === "empty") delete bucket[key];
    }
    allKo[playerId] = bucket;
    safeSet(KO_KEY, JSON.stringify(allKo));
    updateStatus();
  };

  const ensure = (matchId) => {
    if (!bucket[matchId]) bucket[matchId] = { matchId, homeScore: null, awayScore: null, advances: null, status: "empty" };
    return bucket[matchId];
  };

  function updateStatus() {
    const result = validateKnockout(bucket, predictableMatches);
    const podium = readPodium();
    const podiumFilled = ["champion", "runnerUp", "third", "fourth"].filter((k) => podium[k]).length;
    if (statusNode) {
      statusNode.textContent = isLocked()
        ? "Polla descargada y bloqueada."
        : `${result.completedMatches}/${result.totalMatches} cruces · podio ${podiumFilled}/4`;
    }
  }

  // --- captura (listeners una vez por card; respetan el estado editable actual) ---
  cards.forEach((card) => {
    const matchId = card.getAttribute("data-ko-match");
    const homeInput = card.querySelector('[data-score-input="home"]');
    const awayInput = card.querySelector('[data-score-input="away"]');
    const advButtons = Array.from(card.querySelectorAll("[data-advance-pick]"));

    const onScoreInput = () => {
      if (card.dataset.koEditable !== "true") return;
      const p = ensure(matchId);
      p.homeScore = toScore(homeInput ? homeInput.value : null);
      p.awayScore = toScore(awayInput ? awayInput.value : null);
      if (p.homeScore !== null && p.awayScore !== null && !isTie(p.homeScore, p.awayScore)) {
        p.advances = inferAdvance(p.homeScore, p.awayScore);
      }
      p.status = predictionStatus(p);
      reflectAdvanceButtons(card, p.advances);
      setCardStatus(card, p);
      persist();
    };
    if (homeInput) homeInput.addEventListener("input", onScoreInput);
    if (awayInput) awayInput.addEventListener("input", onScoreInput);

    advButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (card.dataset.koEditable !== "true") return;
        const p = ensure(matchId);
        const clicked = btn.getAttribute("data-advance-pick");
        const complete = p.homeScore !== null && p.awayScore !== null;
        p.advances = complete && !isTie(p.homeScore, p.awayScore) ? inferAdvance(p.homeScore, p.awayScore) : clicked;
        p.status = predictionStatus(p);
        reflectAdvanceButtons(card, p.advances);
        setCardStatus(card, p);
        persist();
      });
    });
  });

  // --- descarga + bloqueo ---
  const markFinal = (filename, out) => {
    safeSet(FINAL_KEY, "true");
    safeSet(FINAL_AT_KEY, new Date().toISOString());
    safeSet(FINAL_NAME_KEY, filename);
    safeSet(FINAL_PAYLOAD_KEY, JSON.stringify(out));
  };

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const who = getPlayer();
      // Cruces predecibles resueltos -> con codigos concretos para derivar el clasificado.
      const exportMatches = predictableMatches
        .map((pm) => resolvedById.get(pm.id))
        .filter(Boolean)
        .map((r) => ({
          id: r.match.id, matchNumber: r.match.matchNumber, round: r.match.round,
          slotA: { type: "team", code: r.codeA }, slotB: { type: "team", code: r.codeB },
          predictionEnabled: true,
        }));
      const out = buildKnockoutPayload({ player: who, knockoutPredictions: bucket, podium: readPodium(), matches: exportMatches });
      const filename = buildFileName(who.name || "jugador");
      downloadJson(out, filename);
      const complete = out.summary.completedMatches === out.summary.totalPredictableMatches && out.summary.podiumComplete;
      if (complete) {
        markFinal(filename, out);
        applyResolution(); // bloquea inputs
        if (statusNode) statusNode.textContent = "¡Polla final descargada y bloqueada!";
        if (downloadBtn) downloadBtn.textContent = "Descargar de nuevo";
      } else if (statusNode) {
        statusNode.textContent = "Borrador descargado. Faltan cruces o podio para la versión final.";
      }
    });
  }

  applyResolution();
  subscribeLiveKnockout(applyResolution);
})();
