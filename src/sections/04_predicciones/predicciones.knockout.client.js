// Captura de la polla de ELIMINATORIAS (bracket completo). 100% local.
// Resuelve la llave con los resultados vivos, habilita SOLO los cruces predecibles (ambos
// lados concretos y sin jugar), parchea equipos resueltos y guarda por jugador en
// localStorage (polla:knockoutPredictions). Empate => elegir avance; si no, avance automatico.
import { toScore, isTie, inferAdvance, predictionStatus, validateKnockout } from "../../lib/knockout/validation.js";
import { buildKnockoutPayload, buildFileName, downloadJson } from "./predicciones.export.js";
import { buildTeamsByCode } from "../../lib/knockout/canPredict.js";
import { resolveBracket, normalizeResults, resultWinnerSide } from "../../lib/knockout/bracket.js";
import { scoreKnockoutMatch } from "../../lib/knockout/scoring.js";
import { readLiveKnockout, subscribeLiveKnockout } from "../../lib/knockout/liveResults.js";
import { PODIUM_SLOTS } from "../../lib/knockout/podium.js";

(() => {
  const section = document.querySelector('[data-section="predicciones"]');
  if (!section) return;

  const payloadNode = section.querySelector("[data-knockout-predict-payload]");
  let payload = {};
  try { payload = JSON.parse(payloadNode?.textContent || "{}"); } catch { payload = {}; }
  const matches = payload.matches ?? [];
  const teamsByCode = buildTeamsByCode(payload.teams ?? []);
  const seed = { slotAssignments: payload.seedAssignments ?? {}, results: payload.seedResults ?? [] };
  // Cartones YA ENVIADOS (de ayer): { [playerId]: { [matchId]: { homeScore, awayScore, advances } } }.
  // Para cruces FINALIZADOS, la predicción del jugador se siembra BLOQUEADA (inmutable) y se descarga.
  const seededPredictions = payload.seededPredictions ?? {};
  const podiumSlots = payload.podiumSlots ?? [];
  const podiumSlotByCode = new Map(podiumSlots.map((s) => [s.code, s]));
  const validPodiumCodes = new Set(podiumSlots.map((s) => s.code));

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
  const mySeed = seededPredictions[playerId] ?? {}; // mi cartón ya enviado (para cruces finalizados)
  const allPodium = readJson(PODIUM_KEY, {});
  const podiumBucket = allPodium[playerId] ?? {};
  const readPodium = () => podiumBucket;
  const persistPodium = () => { allPodium[playerId] = podiumBucket; safeSet(PODIUM_KEY, JSON.stringify(allPodium)); };

  const statusNode = section.querySelector("[data-pred-status]");
  const downloadBtn = section.querySelector("[data-pred-download]");
  const identityNode = section.querySelector("[data-pred-identity]");
  const podioCountNode = section.querySelector("[data-pred-podio-count]");
  const crucesCountNode = section.querySelector("[data-pred-cruces-count]");
  const lockNote = section.querySelector("[data-pred-lock-note]");
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

    // Sembrar BLOQUEADAS las predicciones ya enviadas de los cruces FINALIZADOS (jugados): la del
    // cartón manda (inmutable), se hidrata en la card y entra en la descarga. No se puede editar.
    let seededChanged = false;
    for (const [matchId, pred] of Object.entries(mySeed)) {
      const r = resolvedById.get(matchId);
      if (!r || !r.played) continue;
      const cur = bucket[matchId];
      const next = {
        matchId,
        homeScore: pred.homeScore ?? null,
        awayScore: pred.awayScore ?? null,
        advances: pred.advances ?? null,
        status: "complete",
        locked: true,
      };
      if (!cur || cur.homeScore !== next.homeScore || cur.awayScore !== next.awayScore || cur.advances !== next.advances || cur.locked !== true) {
        bucket[matchId] = next;
        seededChanged = true;
      }
    }
    if (seededChanged) { allKo[playerId] = bucket; safeSet(KO_KEY, JSON.stringify(allKo)); }

    cards.forEach((card) => {
      const r = resolvedById.get(card.getAttribute("data-ko-match"));
      if (r) patchCard(card, r);
    });

    // Disclaimer: nombrar los cruces ya jugados (bloqueados) y dejar claro que el resto sigue abierto.
    if (lockNote) {
      const lockedNames = cards
        .map((card) => resolvedById.get(card.getAttribute("data-ko-match")))
        .filter((r) => r && r.played)
        .map((r) => `${r.slotA.name} vs ${r.slotB.name}`);
      if (lockedNames.length) {
        const list = lockedNames.map((n) => `<strong>${n}</strong>`).join(", ");
        const many = lockedNames.length > 1;
        lockNote.innerHTML = `${list} ${many ? "ya se jugaron y están bloqueados" : "ya se jugó y está bloqueado"}. El resto de los cruces siguen abiertos para que predigas.`;
        lockNote.hidden = false;
      } else {
        lockNote.hidden = true;
      }
    }

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
    if (podioCountNode) podioCountNode.textContent = `${podiumFilled}/4`;
    if (crucesCountNode) crucesCountNode.textContent = String(predictableMatches.length);
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

  // --- PODIO (fusionado): campeón / subcampeón / 3º / 4º, sin repetir equipos ---
  const podiumSelects = new Map(
    PODIUM_SLOTS.map((k) => [k, section.querySelector(`[data-podium-spot="${k}"]`)]).filter(([, el]) => el),
  );
  const updatePodiumPreview = (key) => {
    const span = section.querySelector(`[data-podium-preview="${key}"]`);
    const code = podiumBucket[key];
    const slot = code ? podiumSlotByCode.get(code) : null;
    if (span) {
      if (slot && slot.flag) span.innerHTML = `<img src="${slot.flag}" alt="" loading="lazy" decoding="async" width="48" height="48" />`;
      else if (slot) span.textContent = slot.shortCode || "?";
      else span.textContent = "";
    }
    const card = section.querySelector(`[data-podium-card="${key}"]`);
    if (card) card.dataset.filled = code ? "true" : "false";
  };
  const refreshPodiumDisabled = () => {
    const chosen = new Map(); // code -> slot que lo tiene (para no repetir equipo en el podio)
    for (const k of PODIUM_SLOTS) if (podiumBucket[k]) chosen.set(podiumBucket[k], k);
    for (const [key, select] of podiumSelects) {
      Array.from(select.options).forEach((opt) => {
        if (!opt.value) return;
        const owner = chosen.get(opt.value);
        opt.disabled = Boolean(owner) && owner !== key;
      });
    }
  };
  const syncPodiumLock = () => {
    const locked = isLocked();
    for (const [, select] of podiumSelects) select.disabled = locked;
    if (!locked) refreshPodiumDisabled();
  };
  for (const [key, select] of podiumSelects) {
    if (podiumBucket[key] && validPodiumCodes.has(podiumBucket[key])) select.value = podiumBucket[key];
    select.addEventListener("change", () => {
      if (isLocked()) return;
      const v = select.value;
      if (v) podiumBucket[key] = v; else delete podiumBucket[key];
      persistPodium();
      refreshPodiumDisabled();
      updatePodiumPreview(key);
      updateStatus();
    });
    updatePodiumPreview(key);
  }
  syncPodiumLock();

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
      // Cruces FINALIZADOS con tu predicción ya enviada -> van BLOQUEADOS en el JSON, con el
      // resultado oficial y los puntos ya sumados (la del cartón de ayer, inmutable).
      const live = readLiveKnockout(seed);
      const resultsMap = normalizeResults(live.results);
      const settledMatches = Array.from(resolvedById.values())
        .filter((r) => r.played && bucket[r.match.id])
        .map((r) => {
          const res = resultsMap[r.match.id] || null;
          const allForMatch = Object.values(seededPredictions).map((b) => b && b[r.match.id]).filter(Boolean);
          const points = res ? scoreKnockoutMatch(bucket[r.match.id], res, allForMatch).points : null;
          return {
            id: r.match.id, matchNumber: r.match.matchNumber, round: r.match.round,
            slotA: { type: "team", code: r.codeA }, slotB: { type: "team", code: r.codeB },
            result: res ? { homeScore: res.homeScore, awayScore: res.awayScore, winner: resultWinnerSide(res) } : null,
            points,
          };
        });
      const out = buildKnockoutPayload({ player: who, knockoutPredictions: bucket, podium: readPodium(), matches: exportMatches, settledMatches });
      const filename = buildFileName(who.name || "jugador");
      downloadJson(out, filename);
      const complete = out.summary.completedMatches === out.summary.totalPredictableMatches && out.summary.podiumComplete;
      if (complete) {
        markFinal(filename, out);
        applyResolution(); // bloquea inputs
        syncPodiumLock(); // bloquea también los selects del podio
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
