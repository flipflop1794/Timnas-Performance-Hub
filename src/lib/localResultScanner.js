const SUPPORTED_ASPECT_MIN = 1.62;
const SUPPORTED_ASPECT_MAX = 2.42;
const FEATURE_SIZE = 14;
const PLAYER_RESULT_KEYS = ["kills", "deaths", "assists", "gold", "damage", "damageTaken"];
const RESULT_ROWS = [0.285, 0.414, 0.543, 0.672, 0.801];
const OCR_WORKER_IDLE_MS = 120000;
const IMAGE_DECODE_TIMEOUT_MS = 15000;
const HERO_ARTWORK_TIMEOUT_MS = 12000;
const OCR_MODULE_TIMEOUT_MS = 15000;
const OCR_RUNTIME_ASSET_TIMEOUT_MS = 30000;
const OCR_WORKER_INIT_TIMEOUT_MS = 60000;
const OCR_CONFIGURATION_TIMEOUT_MS = 10000;
const OCR_RECOGNITION_TIMEOUT_MS = 20000;
const SCAN_MAX_RUNTIME_MS = 120000;
const OCR_TARGET_CONFIDENCE = 99;

export function scaleLocalOcrReviewScore(confidence) {
  const raw = Math.max(0, Math.min(99, Number(confidence) || 0));
  if (raw >= OCR_TARGET_CONFIDENCE) return OCR_TARGET_CONFIDENCE;
  return Math.min(98, Math.round(raw * 1.7));
}

const DAMAGE_MIN_TRUSTED_VALUE = 500;
const BATCH_HERO_MATCH_MIN_MARGIN = 0.035;
const OCR_RUNTIME_FILES = [
  { path: "/tesseract/local-worker.js", label: "OCR bootstrap worker" },
  { path: "/tesseract/worker.min.js", label: "OCR worker" },
  { path: "/tessdata/eng.traineddata.gz", label: "English OCR data" },
];
const FIELD_LIMITS = {
  kills: 99,
  deaths: 99,
  assists: 99,
  gold: 99999,
  damage: 999999,
  damageTaken: 999999,
};
const IR_MIN = 3;
const IR_MAX = 20;

const RESULT_LAYOUT = {
  scoreboard: {
    rows: RESULT_ROWS,
    iconCenterX: { left: 0.133, right: 0.868 },
    fieldCenterX: {
      left: { kills: 0.316, deaths: 0.342, assists: 0.368, gold: 0.407 },
      right: { gold: 0.592, kills: 0.633, deaths: 0.659, assists: 0.684 },
    },
    fieldWidth: { kills: 0.024, deaths: 0.024, assists: 0.024, gold: 0.05 },
    rowGroup: {
      left: { x: 0.298, width: 0.13, fields: ["kills", "deaths", "assists", "gold"] },
      right: { x: 0.575, width: 0.126, fields: ["gold", "kills", "deaths", "assists"] },
    },
    valueYOffset: -0.04,
    valueHeight: 0.042,
    ir: {
      standard: {
        centerX: { left: 0.455, right: 0.545 },
        width: 0.048,
        yOffset: 0.032,
        height: 0.052,
      },
      wide: {
        centerX: { left: 0.45, right: 0.55 },
        width: 0.052,
        yOffset: 0.05,
        height: 0.05,
      },
    },
    mvpBadge: {
      centerX: { left: 0.45, right: 0.55 },
      width: 0.06,
      yOffset: 0,
      height: 0.08,
    },
    duration: { x: 0.816, y: 0.119, width: 0.043, height: 0.037 },
    teamKills: {
      standard: {
        left: { x: 0.286, y: 0.044, width: 0.048, height: 0.08 },
        right: { x: 0.663, y: 0.044, width: 0.048, height: 0.08 },
      },
      wide: {
        left: { x: 0.301, y: 0.02, width: 0.056, height: 0.095 },
        right: { x: 0.643, y: 0.02, width: 0.056, height: 0.095 },
      },
      ultraWide: {
        left: { x: 0.319, y: 0.024, width: 0.05, height: 0.08 },
        right: { x: 0.631, y: 0.024, width: 0.05, height: 0.08 },
      },
    },
  },
  data: {
    rows: RESULT_ROWS,
    iconCenterX: { left: 0.133, right: 0.868 },
    fieldCenterX: {
      left: { damage: 0.196, damageTaken: 0.355 },
      right: { damage: 0.541, damageTaken: 0.7 },
    },
    fieldWidth: { damage: 0.064, damageTaken: 0.064 },
    rowGroup: {
      left: { x: 0.17, width: 0.22, fields: ["damage", "turretDamage", "damageTaken"] },
      right: { x: 0.515, width: 0.22, fields: ["damage", "turretDamage", "damageTaken"] },
    },
    valueYOffset: -0.006,
    valueHeight: 0.048,
  },
};

let cachedOcrWorkerPromise;
let cachedOcrWorkerTimer;
let activeOcrProgress;
const heroFeatureCache = new Map();
const screenKindCache = new WeakMap();

function scanAbortError(signal) {
  if (signal?.reason instanceof Error && signal.reason.name !== "AbortError") return signal.reason;
  if (typeof signal?.reason === "string" && signal.reason) return new Error(signal.reason);
  return new Error("Local scan cancelled. Your selected screenshots are still available to retry.");
}

function throwIfScanAborted(signal) {
  if (signal?.aborted) throw scanAbortError(signal);
}

function waitForScanTask(task, { timeoutMs, timeoutMessage, signal, onStop } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const stop = (error) => {
      if (settled) return;
      try {
        onStop?.();
      } catch {
        // Cleanup is best-effort; the original timeout/cancellation is more useful.
      }
      finish(reject, error);
    };
    const handleAbort = () => stop(scanAbortError(signal));

    if (signal?.aborted) {
      stop(scanAbortError(signal));
      return;
    }
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        const message = typeof timeoutMessage === "function" ? timeoutMessage() : timeoutMessage;
        stop(new Error(message || "The local scan step timed out."));
      }, timeoutMs);
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    Promise.resolve(task).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

export function normalizeScannerHeroKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function validateLocalScannerDraft(picks = [], heroIcons = {}) {
  if (picks.length !== 5) return "This game needs exactly five team picks before scanning.";
  const heroes = picks.map((pick) => String(pick.hero || "").trim());
  const players = picks.map((pick) => String(pick.player || "").trim());
  if (heroes.some((hero) => !hero)) return "Complete all five team hero picks before scanning.";
  if (players.some((player) => !player)) return "Assign a roster player to every team hero before scanning.";
  if (new Set(heroes.map(normalizeScannerHeroKey)).size !== 5) return "Every team pick must use a different hero.";
  const missingIcons = heroes.filter((hero) => !heroIcons[normalizeScannerHeroKey(hero)]);
  if (missingIcons.length) return `Hero artwork is missing for ${missingIcons.join(", ")}. Sync the hero library before scanning.`;
  return "";
}

export function parseLocalOcrInteger(rawValue) {
  const source = String(rawValue || "").toUpperCase();
  const candidates = source.match(/[0-9OQDGBZIL|S][0-9OQDGBZIL|S.,]*K?/g) || [];
  const candidate = candidates
    .filter((token) => /\d/.test(token) || token.replace(/[.,K]/g, "").length >= 2)
    .sort((left, right) => right.length - left.length)[0];
  if (!candidate) return null;

  const cleaned = candidate
    .replace(/[OQD]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/G/g, "6")
    .replace(/B/g, "8")
    .replace(/[^0-9.,K]/g, "");
  const match = cleaned.match(/\d+(?:[.,]\d+)?K?/);
  if (!match) return null;
  const token = match[0];
  if (token.endsWith("K")) {
    const compact = Number(token.slice(0, -1).replace(",", "."));
    return Number.isFinite(compact) ? Math.round(compact * 1000) : null;
  }
  const digits = token.replace(/[.,]/g, "");
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseLocalOcrIntegerSequence(rawValue) {
  const tokens = String(rawValue || "").toUpperCase().match(/[0-9OQDGBZIL|S]+(?:[.,][0-9OQDGBZIL|S]+)?K?/g) || [];
  return tokens.map(parseLocalOcrInteger).filter((value) => value !== null);
}

export function parseLocalOcrRating(rawValue) {
  const cleaned = String(rawValue || "")
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/G/g, "6")
    .replace(/B/g, "8");
  const explicit = cleaned.match(/\d{1,2}\s*[.,]\s*\d/);
  const compact = explicit ? explicit[0].replace(/\s/g, "").replace(",", ".") : "";
  const digitsOnly = explicit ? "" : (cleaned.match(/\d+/g) || [])
    .filter((candidate) => candidate.length >= 2 && candidate.length <= 3)
    .sort((left, right) => right.length - left.length)[0] || "";
  const token = compact || (digitsOnly ? `${digitsOnly.slice(0, -1)}.${digitsOnly.slice(-1)}` : "");
  if (!token) return null;
  const value = Number(token);
  return Number.isFinite(value) && value >= IR_MIN && value <= IR_MAX ? Math.round(value * 10) / 10 : null;
}

export function classifyLocalScoreboardGeometry(aspectRatio) {
  const ratio = Number(aspectRatio);
  if (!Number.isFinite(ratio) || ratio < 1.9) return "standard";
  if (ratio < 2.12) return "wide";
  return "ultraWide";
}

function groupLocalOcrCandidates(candidates, parseValue) {
  const parsed = candidates
    .map((candidate, index) => ({
      ...candidate,
      candidateIndex: index,
      confidence: Number(candidate.confidence || 0),
      value: parseValue(candidate.text),
    }))
    .filter((candidate) => candidate.value !== null);
  const groups = new Map();
  parsed.forEach((candidate) => {
    const key = String(candidate.value);
    const group = groups.get(key) || { value: candidate.value, candidates: [] };
    group.candidates.push(candidate);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    count: group.candidates.length,
    maxConfidence: Math.max(...group.candidates.map((candidate) => candidate.confidence)),
    averageConfidence: group.candidates.reduce((total, candidate) => total + candidate.confidence, 0) / group.candidates.length,
    best: group.candidates.slice().sort((left, right) => right.confidence - left.confidence || left.candidateIndex - right.candidateIndex)[0],
  }));
}

function calibratedConsensusConfidence(selected, disagreement, { crossChecked = false } = {}) {
  if (!selected) return 0;
  if (disagreement && !crossChecked) return Math.min(54, selected.maxConfidence);
  if (selected.count >= 3 || (crossChecked && selected.count >= 2)) return OCR_TARGET_CONFIDENCE;
  if (selected.count >= 2 || crossChecked) return Math.min(97, Math.max(95, selected.maxConfidence));
  return Math.min(94, selected.maxConfidence);
}

function hasOnlyWeakConflicts(selected, alternatives) {
  return alternatives.length > 0 && selected.count >= 2
    && selected.maxConfidence >= 85 && selected.averageConfidence >= 70
    && alternatives.every((group) => group.maxConfidence < 50
      && selected.maxConfidence - group.maxConfidence >= 30);
}

function isPlausibleOcrFieldValue(field, value) {
  if (!Number.isSafeInteger(value) || value < 0) return false;
  if (field === "turretDamage") return value <= 999999;
  if (value > FIELD_LIMITS[field]) return false;
  if (field === "gold" && value < 1000) return false;
  if ((field === "damage" || field === "damageTaken") && value < DAMAGE_MIN_TRUSTED_VALUE) return false;
  return true;
}

export function selectLocalOcrIntegerCandidate(candidates = [], field) {
  const groups = groupLocalOcrCandidates(candidates, (text) => {
    const value = parseLocalOcrInteger(text);
    return isPlausibleOcrFieldValue(field, value) ? value : null;
  }).sort((left, right) => {
    const leftText = String(left.value);
    const rightText = String(right.value);
    const clippedGold = field === "gold" && left.count === right.count
      && Math.abs(left.maxConfidence - right.maxConfidence) <= 10
      && (leftText.includes(rightText) || rightText.includes(leftText));
    return right.count - left.count
      || (clippedGold ? rightText.length - leftText.length : 0)
      || right.maxConfidence - left.maxConfidence
      || right.averageConfidence - left.averageConfidence;
  });
  const selected = groups[0];
  if (!selected) {
    const fallback = candidates.slice().sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0];
    return {
      value: null,
      confidence: Number(fallback?.confidence || 0),
      raw: String(fallback?.text || ""),
      mode: fallback?.mode || "",
      disagreement: false,
      evidenceCount: 0,
    };
  }
  const disagreement = groups.length > 1;
  const weakOutliers = hasOnlyWeakConflicts(selected, groups.slice(1));
  return {
    value: selected.value,
    confidence: weakOutliers ? 95 : calibratedConsensusConfidence(selected, disagreement),
    raw: selected.best.text,
    mode: selected.best.mode,
    disagreement,
    evidenceCount: selected.count,
    candidates: candidates.map(({ text = "", confidence = 0, mode = "" }) => ({ text, confidence: Math.round(Number(confidence || 0)), mode })),
  };
}

export function selectLocalOcrGoldCandidate(candidates = []) {
  const groups = groupLocalOcrCandidates(candidates, (text) => {
    const value = parseLocalOcrInteger(text);
    return isPlausibleOcrFieldValue("gold", value) ? value : null;
  }).sort((left, right) => right.count - left.count
    || right.maxConfidence - left.maxConfidence
    || right.averageConfidence - left.averageConfidence);
  const selected = groups[0];
  if (!selected) return { value: null, confidence: 0, raw: "", disagreement: false, evidenceCount: 0, candidates };
  const alternatives = groups.slice(1);
  const disagreement = alternatives.length > 0;
  const weakOutliers = hasOnlyWeakConflicts(selected, alternatives);
  return {
    value: selected.value,
    confidence: weakOutliers ? 95 : calibratedConsensusConfidence(selected, disagreement),
    raw: selected.best.text,
    rectangle: selected.best.rectangle,
    disagreement,
    evidenceCount: selected.count,
    candidates,
  };
}

export function selectLocalOcrDamageCandidate(candidates = [], field) {
  if (field !== "damage" && field !== "damageTaken") return selectLocalOcrIntegerCandidate(candidates, field);
  const groups = groupLocalOcrCandidates(candidates, (text) => {
    const value = parseLocalOcrInteger(text);
    return isPlausibleOcrFieldValue(field, value) ? value : null;
  }).map((group) => ({
    ...group,
    geometryCount: new Set(group.candidates.map((candidate) => candidate.geometry || "unknown")).size,
    digitCount: String(group.value).length,
  }));
  const ranked = groups.slice().sort((left, right) => right.geometryCount - left.geometryCount
    || right.count - left.count
    || right.maxConfidence - left.maxConfidence
    || right.averageConfidence - left.averageConfidence
    || right.digitCount - left.digitCount);
  let selected = ranked[0];
  if (selected) {
    const tightReading = field === "damageTaken" && groups.find((group) => group.candidates.some((candidate) => candidate.geometry === "tight")
      && group.count >= 2 && group.maxConfidence >= 85);
    if (tightReading && tightReading !== selected && tightReading.digitCount === selected.digitCount
      && selected.maxConfidence < 80
      && tightReading.maxConfidence - selected.maxConfidence >= 12) selected = tightReading;
    const selectedDigits = String(selected.value);
    const recoveredEdgeDigits = groups
      .filter((group) => group !== selected
        && group.geometryCount >= 2
        && group.digitCount > selected.digitCount
        && (String(group.value).startsWith(selectedDigits) || String(group.value).endsWith(selectedDigits)))
      .sort((left, right) => right.digitCount - left.digitCount
        || right.geometryCount - left.geometryCount
        || right.count - left.count);
    if (recoveredEdgeDigits[0]) selected = recoveredEdgeDigits[0];
  }
  if (!selected) {
    const fallback = candidates.slice().sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0];
    return {
      value: null,
      confidence: Math.min(54, Number(fallback?.confidence || 0)),
      raw: String(fallback?.text || ""),
      mode: fallback?.mode || "",
      geometry: fallback?.geometry || "",
      rectangle: fallback?.rectangle,
      disagreement: false,
      evidenceCount: 0,
      geometryCount: 0,
    };
  }
  const disagreement = groups.length > 1;
  const crossGeometryConsensus = selected.geometryCount >= 2 && selected.count >= 3;
  const evidenceCandidate = selected.candidates
    .filter((candidate) => candidate.rectangle)
    .sort((left, right) => (right.rectangle.width * right.rectangle.height) - (left.rectangle.width * left.rectangle.height)
      || right.confidence - left.confidence)[0];
  const confidence = disagreement
    ? Math.min(54, selected.maxConfidence)
    : crossGeometryConsensus
      ? OCR_TARGET_CONFIDENCE
      : Math.min(97, calibratedConsensusConfidence(selected, false));
  return {
    value: selected.value,
    confidence,
    raw: selected.best.text,
    mode: selected.best.mode,
    geometry: selected.best.geometry || "",
    rectangle: evidenceCandidate?.rectangle || selected.best.rectangle,
    disagreement,
    evidenceCount: selected.count,
    geometryCount: selected.geometryCount,
    candidates: candidates.map(({ text = "", confidence: candidateConfidence = 0, mode = "", geometry = "" }) => ({
      text,
      confidence: Math.round(Number(candidateConfidence || 0)),
      mode,
      geometry,
    })),
  };
}

export function selectLocalOcrSequenceCandidate(candidates = [], fields = []) {
  const parsed = candidates.map((candidate, index) => {
    const values = parseLocalOcrIntegerSequence(candidate.text);
    const complete = values.length === fields.length && fields.every((field, fieldIndex) => isPlausibleOcrFieldValue(field, values[fieldIndex]));
    return { ...candidate, candidateIndex: index, confidence: Number(candidate.confidence || 0), values, complete };
  });
  const valid = parsed.filter((candidate) => candidate.complete);
  const groups = new Map();
  valid.forEach((candidate) => {
    const key = candidate.values.join(",");
    const group = groups.get(key) || { values: candidate.values, candidates: [] };
    group.candidates.push(candidate);
    groups.set(key, group);
  });
  const ranked = [...groups.values()].map((group) => ({
    ...group,
    count: group.candidates.length,
    maxConfidence: Math.max(...group.candidates.map((candidate) => candidate.confidence)),
    best: group.candidates.slice().sort((left, right) => right.confidence - left.confidence || left.candidateIndex - right.candidateIndex)[0],
  })).sort((left, right) => right.count - left.count || right.maxConfidence - left.maxConfidence);
  const selected = ranked[0];
  if (!selected) {
    const fallback = parsed.slice().sort((left, right) => right.values.length - left.values.length || right.confidence - left.confidence)[0];
    return { ...(fallback || { text: "", mode: "", confidence: 0, values: [] }), complete: false, disagreement: false, evidenceCount: 0 };
  }
  const disagreement = ranked.length > 1;
  return {
    ...selected.best,
    values: selected.values,
    confidence: calibratedConsensusConfidence(selected, disagreement),
    complete: !disagreement,
    disagreement,
    evidenceCount: selected.count,
    candidates: candidates.map(({ text = "", confidence = 0, mode = "" }) => ({ text, confidence: Math.round(Number(confidence || 0)), mode })),
  };
}

export function selectLocalOcrRatingCandidate(candidates = []) {
  const groups = groupLocalOcrCandidates(candidates, parseLocalOcrRating)
    .sort((left, right) => right.count - left.count || right.maxConfidence - left.maxConfidence || right.averageConfidence - left.averageConfidence);
  const selected = groups[0];
  if (!selected) {
    const fallback = candidates.slice().sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0];
    return {
      value: null,
      confidence: Number(fallback?.confidence || 0),
      raw: String(fallback?.text || ""),
      mode: fallback?.mode || "",
      disagreement: false,
      evidenceCount: 0,
    };
  }
  const disagreement = groups.length > 1;
  return {
    value: selected.value,
    confidence: calibratedConsensusConfidence(selected, disagreement),
    raw: selected.best.text,
    mode: selected.best.mode,
    disagreement,
    evidenceCount: selected.count,
    candidates: candidates.map(({ text = "", confidence = 0, mode = "" }) => ({ text, confidence: Math.round(Number(confidence || 0)), mode })),
  };
}

export function selectLocalTeamKillCandidate(candidates = [], expectedValue = null) {
  const hasExpected = expectedValue !== null && expectedValue !== "" && expectedValue !== undefined;
  const expected = hasExpected && Number.isSafeInteger(Number(expectedValue)) && Number(expectedValue) >= 0 && Number(expectedValue) <= 99
    ? Number(expectedValue)
    : null;
  const groups = groupLocalOcrCandidates(candidates, (text) => {
    const value = parseLocalOcrInteger(text);
    return Number.isSafeInteger(value) && value >= 0 && value <= 99 ? value : null;
  }).sort((left, right) => {
    const leftCrossChecked = expected !== null && left.value === expected ? 1 : 0;
    const rightCrossChecked = expected !== null && right.value === expected ? 1 : 0;
    const leftEvidence = left.count + leftCrossChecked * 2;
    const rightEvidence = right.count + rightCrossChecked * 2;
    return rightEvidence - leftEvidence
      || right.maxConfidence - left.maxConfidence
      || right.averageConfidence - left.averageConfidence;
  });
  const selected = groups[0];
  if (!selected) {
    const fallback = candidates.slice().sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0];
    return {
      value: null,
      confidence: Number(fallback?.confidence || 0),
      raw: String(fallback?.text || ""),
      mode: fallback?.mode || "",
      disagreement: false,
      crossChecked: false,
      evidenceCount: 0,
    };
  }
  const crossChecked = expected !== null && selected.value === expected;
  const disagreement = groups.length > 1 && !crossChecked;
  return {
    value: selected.value,
    confidence: calibratedConsensusConfidence(selected, disagreement, { crossChecked }),
    raw: selected.best.text,
    mode: selected.best.mode,
    disagreement,
    crossChecked,
    evidenceCount: selected.count,
    candidates: candidates.map(({ text = "", confidence = 0, mode = "" }) => ({ text, confidence: Math.round(Number(confidence || 0)), mode })),
  };
}

export function classifyLocalMvpBadgeTone(metrics = {}) {
  const warm = Number(metrics.warmRatio || 0);
  const purple = Number(metrics.purpleRatio || 0);
  const bright = Number(metrics.brightRatio || 0);
  const luminance = Number(metrics.luminance || 0);
  // The winning red-and-gold badge can also contain purple pixels. Its gold
  // crown is a stronger signal than the purple tint in the red ribbon.
  if (warm >= 0.2 && purple < warm * 0.45) {
    return { tone: "bright", confidence: Math.round(clamp(0.58 + warm * 1.5 + bright, 0, 0.95) * 100) };
  }
  if (purple >= 0.035 && purple > warm * 0.25 && bright < 0.11) {
    return { tone: "dark", confidence: Math.round(clamp(0.62 + purple * 4 - bright * 0.3, 0, 0.95) * 100) };
  }
  if (warm >= 0.12 && bright >= 0.035 && purple < 0.05) {
    return { tone: "bright", confidence: Math.round(clamp(0.48 + warm * 2 + bright + Math.max(0, luminance - 0.25) * 0.25, 0, 0.95) * 100) };
  }
  return { tone: "", confidence: Math.round(clamp(Math.max(warm, purple, bright), 0, 0.49) * 100) };
}

export function resolveLocalBadgeVisualCandidate(rows = []) {
  const badgeCandidates = rows
    .map((row) => ({
      ...row,
      badgeScore: Number(row.badgeMetrics?.visualScore || 0),
      badgeTone: classifyLocalMvpBadgeTone(row.badgeMetrics),
    }))
    .filter((row) => Number.isFinite(row.badgeScore))
    .sort((left, right) => right.badgeScore - left.badgeScore);
  const badgeWinner = badgeCandidates[0];
  const badgeRunnerUp = badgeCandidates[1];
  const badgeScore = badgeWinner?.badgeScore || 0;
  const badgeGap = badgeScore - (badgeRunnerUp?.badgeScore || 0);
  const distinctiveByScore = Boolean(badgeWinner) && badgeScore >= 0.17 && badgeGap >= 0.055;
  const strongToneCandidates = badgeCandidates
    .filter((row) => row.badgeScore >= 0.14 && row.badgeTone.tone && row.badgeTone.confidence >= 72)
    .sort((left, right) => right.badgeTone.confidence - left.badgeTone.confidence || right.badgeScore - left.badgeScore);
  const distinctiveByTone = strongToneCandidates.length === 1;
  const selectedBadge = distinctiveByScore ? badgeWinner : distinctiveByTone ? strongToneCandidates[0] : null;
  if (!selectedBadge) {
    return { candidate: null, confidence: 0, trusted: false, reason: "badge is not distinctive", badgeScore, badgeGap };
  }

  const scoreConfidence = Math.round(clamp(
    0.55 + Math.max(0, badgeScore - 0.17) * 1.2 + Math.max(0, badgeGap - 0.055) * 2.1,
    0.55,
    0.95,
  ) * 100);
  const confidence = Math.max(scoreConfidence, distinctiveByTone ? selectedBadge.badgeTone.confidence : 0);
  return {
    candidate: selectedBadge,
    confidence,
    trusted: confidence >= 70,
    reason: distinctiveByScore ? "distinct MVP badge" : "unique strong MVP badge tone",
    badgeScore: selectedBadge.badgeScore,
    badgeGap: selectedBadge === badgeWinner ? badgeGap : selectedBadge.badgeScore - badgeScore,
  };
}

export function resolveLocalMvpCandidate(rows = []) {
  const visualResolution = resolveLocalBadgeVisualCandidate(rows);
  const badgeWinner = visualResolution.candidate;
  if (!badgeWinner) {
    return { pickIndex: null, confidence: 0, visualConfidence: 0, trusted: false, reason: visualResolution.reason, source: "unknown" };
  }

  const badgeConfidence = visualResolution.confidence;
  const ratingCandidates = rows
    .filter((row) => row.ir !== null && row.ir !== "" && Number.isFinite(Number(row.ir)) && Number(row.ir) >= IR_MIN && Number(row.ir) <= IR_MAX)
    .map((row) => ({ ...row, numericIr: Number(row.ir) }))
    .sort((left, right) => right.numericIr - left.numericIr);
  const ratingWinner = ratingCandidates[0];
  const ratingRunnerUp = ratingCandidates[1];
  const ratingMargin = ratingWinner && ratingRunnerUp ? ratingWinner.numericIr - ratingRunnerUp.numericIr : 0;
  const hasUniqueRatingWinner = Boolean(ratingWinner) && (!ratingRunnerUp || ratingMargin >= 0.05);
  const ratingAgrees = hasUniqueRatingWinner && ratingWinner.pickIndex === badgeWinner.pickIndex;
  const ratingConflicts = hasUniqueRatingWinner && ratingWinner.pickIndex !== badgeWinner.pickIndex;

  let confidence = badgeConfidence;
  let trusted = badgeConfidence >= 70;
  let reason = "distinct MVP badge";
  let source = "MVP badge";
  if (ratingAgrees) {
    confidence = Math.min(95, badgeConfidence + (Number(ratingWinner.irConfidence || 0) >= 55 ? 10 : 4));
    trusted = confidence >= 65;
    reason = "badge and rating agree";
    source = "MVP badge + IR";
  } else if (ratingConflicts) {
    confidence = Math.min(60, badgeConfidence);
    trusted = false;
    reason = "MVP badge conflicts with the highest IR";
  }

  return {
    pickIndex: badgeWinner.pickIndex,
    confidence,
    trusted,
    reason,
    source,
    rating: ratingAgrees ? ratingWinner.numericIr : null,
    visualConfidence: badgeConfidence,
    badgeScore: visualResolution.badgeScore,
    badgeGap: visualResolution.badgeGap,
  };
}

export function resolveLocalMatchOutcome({
  badgeTone = "",
  badgeConfidence = 0,
  badgeCandidateConfidence = 0,
  opponentBadgeTone = "",
  opponentBadgeConfidence = 0,
  opponentBadgeCandidateConfidence = 0,
  badgeMetrics = null,
  opponentBadgeMetrics = null,
} = {}) {
  const ourWarm = Number(badgeMetrics?.warmRatio || 0);
  const opponentWarm = Number(opponentBadgeMetrics?.warmRatio || 0);
  const warmGap = ourWarm - opponentWarm;
  if (badgeCandidateConfidence >= 55 && opponentBadgeCandidateConfidence >= 55
    && Math.max(ourWarm, opponentWarm) >= 0.2 && Math.abs(warmGap) >= 0.045) {
    return {
      result: warmGap > 0 ? "Win" : "Loss",
      confidence: Math.abs(warmGap) >= 0.06 ? 99 : 90,
      trusted: Math.abs(warmGap) >= 0.06,
      source: "both teams' MVP badge gold",
    };
  }
  const evidence = [];
  const addEvidence = (tone, toneConfidence, candidateConfidence, opponent = false) => {
    if (tone !== "bright" && tone !== "dark") return;
    const visualConfidence = Number(candidateConfidence || 0);
    const colorConfidence = Number(toneConfidence || 0);
    if (visualConfidence < 55 || colorConfidence < 55) return;
    const directResult = tone === "bright" ? "Win" : "Loss";
    evidence.push({
      result: opponent ? (directResult === "Win" ? "Loss" : "Win") : directResult,
      confidence: Math.min(99, Math.round((visualConfidence + colorConfidence) / 2 + 10)),
      source: opponent ? "opponent MVP badge" : "our team MVP badge",
    });
  };

  addEvidence(badgeTone, badgeConfidence, badgeCandidateConfidence);
  addEvidence(opponentBadgeTone, opponentBadgeConfidence, opponentBadgeCandidateConfidence, true);
  if (!evidence.length) return { result: "", confidence: 0, trusted: false, source: "unknown" };
  if (new Set(evidence.map((item) => item.result)).size > 1) {
    return { result: "", confidence: 0, trusted: false, source: "conflicting MVP badges" };
  }

  const confidence = evidence.length > 1
    ? Math.max(OCR_TARGET_CONFIDENCE, ...evidence.map((item) => item.confidence))
    : evidence[0].confidence;
  return {
    result: evidence[0].result,
    confidence,
    trusted: confidence >= OCR_TARGET_CONFIDENCE,
    source: evidence.length > 1 ? "both teams' MVP badges" : evidence[0].source,
  };
}

export function classifyLocalResultScreenLabel(rawValue) {
  const normalized = String(rawValue || "").toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("quipment") || normalized.includes("equiprnent") || normalized.includes("uipment")) return "data";
  if (normalized.includes("data")) return "scoreboard";
  return "";
}

export function classifyLocalResultScreenHeader(rawValue) {
  const normalized = String(rawValue || "").toLowerCase().replace(/[^a-z]/g, "");
  const damageCount = normalized.match(/[bd]amag[el]/g)?.length || 0;
  const hasSecondaryHeading = normalized.includes("turret")
    || normalized.includes("teamfight")
    || normalized.includes("participation")
    || /take[no]/.test(normalized);
  if (damageCount >= 2 || (damageCount >= 1 && hasSecondaryHeading)) return "data";
  return "";
}

export function resolveLocalResultScreenKinds(detections = []) {
  const resolved = detections.map((detection) => ({
    ...detection,
    kind: detection.detectedKind || detection.hint || "",
    detectionSource: detection.detectedKind ? "detected" : "slot fallback",
  }));
  if (resolved.length === 2) {
    const detected = resolved.filter((entry) => entry.detectedKind);
    if (detected.length === 2 && detected[0].detectedKind === detected[1].detectedKind) {
      throw new Error(`Both files look like the ${detected[0].detectedKind === "scoreboard" ? "K/D/A + Gold" : "Damage"} screen. Choose one of each result screen.`);
    }
    if (detected.length === 1) {
      const other = resolved.find((entry) => entry !== detected[0]);
      other.kind = detected[0].detectedKind === "scoreboard" ? "data" : "scoreboard";
      other.detectionSource = "paired inference";
    }
  }
  return resolved;
}

export function calculateLocalTeamfightParticipation(kills, assists, teamKills) {
  if ([kills, assists, teamKills].some((value) => value === "" || value === null || value === undefined)) return null;
  const numericKills = Number(kills);
  const numericAssists = Number(assists);
  const numericTeamKills = Number(teamKills);
  if (![numericKills, numericAssists, numericTeamKills].every(Number.isFinite) || numericTeamKills <= 0) return null;
  return Math.round((numericKills + numericAssists) / numericTeamKills * 100);
}

export function findLocalScanAnomalies({ rows = [], teamKills = null, opponentTeamKills = null } = {}) {
  const warnings = [];
  const hasTeamKills = teamKills !== null && teamKills !== "" && teamKills !== undefined;
  const hasOpponentKills = opponentTeamKills !== null && opponentTeamKills !== "" && opponentTeamKills !== undefined;
  const validTeamKills = hasTeamKills && Number.isSafeInteger(Number(teamKills)) && Number(teamKills) >= 0 && Number(teamKills) <= 99
    ? Number(teamKills)
    : null;
  const validOpponentKills = hasOpponentKills && Number.isSafeInteger(Number(opponentTeamKills)) && Number(opponentTeamKills) >= 0 && Number(opponentTeamKills) <= 99
    ? Number(opponentTeamKills)
    : null;

  rows.forEach((row) => {
    const label = row.hero || row.player || `Player ${Number(row.pickIndex || 0) + 1}`;
    const gold = row.values?.gold;
    const damage = row.values?.damage;
    const damageTaken = row.values?.damageTaken;
    const kills = row.values?.kills;
    const assists = row.values?.assists;
    if (gold !== null && gold !== "" && Number.isFinite(Number(gold)) && Number(gold) < 1000) warnings.push(`${label}: Gold ${gold} is suspiciously low and may be missing a digit.`);
    if (damage !== null && damage !== "" && Number.isFinite(Number(damage)) && Number(damage) < 500) warnings.push(`${label}: Damage ${damage} is suspiciously low and may be incomplete.`);
    if (damageTaken !== null && damageTaken !== "" && Number.isFinite(Number(damageTaken)) && Number(damageTaken) < 500) warnings.push(`${label}: Damage taken ${damageTaken} is suspiciously low and may be incomplete.`);
    if (validTeamKills !== null && Number.isSafeInteger(Number(kills)) && Number(kills) > validTeamKills) {
      warnings.push(`${label}: Kills ${kills} cannot exceed the team score ${validTeamKills}.`);
    }
    if (validTeamKills !== null && Number.isSafeInteger(Number(assists)) && Number(assists) > validTeamKills) {
      warnings.push(`${label}: Assists ${assists} cannot exceed the team score ${validTeamKills}.`);
    }
    if (validTeamKills !== null && Number.isSafeInteger(Number(kills)) && Number.isSafeInteger(Number(assists)) && Number(kills) + Number(assists) > validTeamKills) {
      warnings.push(`${label}: Kills + assists (${Number(kills) + Number(assists)}) exceed team kills ${validTeamKills}, which would make TFP greater than 100%.`);
    }
  });

  const kills = rows.map((row) => row.values?.kills);
  if (validTeamKills !== null && kills.length === 5 && kills.every(Number.isSafeInteger)) {
    const total = kills.reduce((sum, value) => sum + value, 0);
    if (total !== validTeamKills) warnings.push(`Player kills add up to ${total}, but the team score in the header reads ${validTeamKills}.`);
  }
  const deaths = rows.map((row) => row.values?.deaths);
  if (validOpponentKills !== null && deaths.length === 5 && deaths.every(Number.isSafeInteger)) {
    const total = deaths.reduce((sum, value) => sum + value, 0);
    if (total !== validOpponentKills) warnings.push(`Player deaths add up to ${total}, while the opponent score in the header reads ${validOpponentKills}. Check both values for OCR errors.`);
  }
  return warnings;
}

export function parseLocalOcrDuration(rawValue) {
  const cleaned = String(rawValue || "")
    .toUpperCase()
    .replace(/[OQ]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/S/g, "5");
  const match = cleaned.match(/(\d{1,2})\s*[:.]\s*(\d{2})/)
    || cleaned.match(/(?:^|\D)(\d{2})(\d{2})(?!\d)/);
  if (!match) return "";
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) return "";
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatLocalDurationEntry(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

export function solveHeroAssignment(scoreMatrix = []) {
  const rowCount = scoreMatrix.length;
  const heroCount = scoreMatrix[0]?.length || 0;
  if (!rowCount || rowCount !== heroCount || scoreMatrix.some((row) => row.length !== heroCount)) {
    return { assignment: [], average: 0, minimum: 0, margin: 0 };
  }

  let best = null;
  let second = null;
  const walk = (rowIndex, used, assignment, total) => {
    if (rowIndex === rowCount) {
      const candidate = { assignment: [...assignment], total };
      if (!best || candidate.total > best.total) {
        second = best;
        best = candidate;
      } else if (!second || candidate.total > second.total) {
        second = candidate;
      }
      return;
    }
    for (let heroIndex = 0; heroIndex < heroCount; heroIndex += 1) {
      if (used.has(heroIndex)) continue;
      used.add(heroIndex);
      assignment.push(heroIndex);
      walk(rowIndex + 1, used, assignment, total + Number(scoreMatrix[rowIndex][heroIndex] || 0));
      assignment.pop();
      used.delete(heroIndex);
    }
  };
  walk(0, new Set(), [], 0);

  if (!best) return { assignment: [], average: 0, minimum: 0, margin: 0 };
  const scores = best.assignment.map((heroIndex, rowIndex) => Number(scoreMatrix[rowIndex][heroIndex] || 0));
  return {
    assignment: best.assignment,
    average: best.total / rowCount,
    minimum: Math.min(...scores),
    margin: second ? (best.total - second.total) / rowCount : best.total / rowCount,
  };
}

function solveMaximumBatchAssignment(scoreMatrix = [], forbiddenEdge = null) {
  const fileCount = scoreMatrix.length;
  const gameCount = scoreMatrix[0]?.length || 0;
  if (!fileCount || !gameCount || scoreMatrix.some((row) => row.length !== gameCount)) {
    return { assignment: Array(fileCount).fill(-1), count: 0, total: 0 };
  }

  const size = fileCount + gameCount;
  const invalidCost = 1000000;
  const matchBonus = 100;
  const costs = Array.from({ length: size }, (_, rowIndex) => Array.from({ length: size }, (_, columnIndex) => {
    if (rowIndex >= fileCount || columnIndex >= gameCount) return 0;
    if (forbiddenEdge?.fileIndex === rowIndex && forbiddenEdge?.gameIndex === columnIndex) return invalidCost;
    const score = scoreMatrix[rowIndex][columnIndex];
    return Number.isFinite(score) && score >= 0 ? -(matchBonus + score) : invalidCost;
  }));

  const rowPotential = Array(size + 1).fill(0);
  const columnPotential = Array(size + 1).fill(0);
  const columnMatch = Array(size + 1).fill(0);
  const path = Array(size + 1).fill(0);
  for (let row = 1; row <= size; row += 1) {
    columnMatch[0] = row;
    let column = 0;
    const minimum = Array(size + 1).fill(Infinity);
    const used = Array(size + 1).fill(false);
    do {
      used[column] = true;
      const matchedRow = columnMatch[column];
      let delta = Infinity;
      let nextColumn = 0;
      for (let candidateColumn = 1; candidateColumn <= size; candidateColumn += 1) {
        if (used[candidateColumn]) continue;
        const reducedCost = costs[matchedRow - 1][candidateColumn - 1]
          - rowPotential[matchedRow]
          - columnPotential[candidateColumn];
        if (reducedCost < minimum[candidateColumn]) {
          minimum[candidateColumn] = reducedCost;
          path[candidateColumn] = column;
        }
        if (minimum[candidateColumn] < delta) {
          delta = minimum[candidateColumn];
          nextColumn = candidateColumn;
        }
      }
      for (let candidateColumn = 0; candidateColumn <= size; candidateColumn += 1) {
        if (used[candidateColumn]) {
          rowPotential[columnMatch[candidateColumn]] += delta;
          columnPotential[candidateColumn] -= delta;
        } else {
          minimum[candidateColumn] -= delta;
        }
      }
      column = nextColumn;
    } while (columnMatch[column] !== 0);

    do {
      const previousColumn = path[column];
      columnMatch[column] = columnMatch[previousColumn];
      column = previousColumn;
    } while (column !== 0);
  }

  const assignment = Array(fileCount).fill(-1);
  for (let column = 1; column <= size; column += 1) {
    const rowIndex = columnMatch[column] - 1;
    const gameIndex = column - 1;
    if (rowIndex < 0 || rowIndex >= fileCount || gameIndex < 0 || gameIndex >= gameCount) continue;
    const score = scoreMatrix[rowIndex][gameIndex];
    if (Number.isFinite(score) && score >= 0) assignment[rowIndex] = gameIndex;
  }
  const scores = assignment.map((gameIndex, fileIndex) => gameIndex < 0 ? null : scoreMatrix[fileIndex][gameIndex]);
  return {
    assignment,
    count: scores.filter((score) => score !== null).length,
    total: scores.reduce((sum, score) => sum + Number(score || 0), 0),
  };
}

export function resolveLocalBatchGameAssignments(scoreMatrix = [], minimumMargin = BATCH_HERO_MATCH_MIN_MARGIN) {
  const best = solveMaximumBatchAssignment(scoreMatrix);
  const matches = best.assignment.flatMap((gameIndex, fileIndex) => {
    if (gameIndex < 0) return [];
    const score = Number(scoreMatrix[fileIndex][gameIndex]);
    const alternative = solveMaximumBatchAssignment(scoreMatrix, { fileIndex, gameIndex });
    const margin = alternative.count < best.count ? score : Math.max(0, best.total - alternative.total);
    return [{ fileIndex, gameIndex, score, margin, ambiguous: margin < minimumMargin }];
  });
  return { ...best, matches };
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function imageSize(image) {
  return {
    width: image.width || image.naturalWidth,
    height: image.height || image.naturalHeight,
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function loadImageSource(source, { signal, label = "Screenshot" } = {}) {
  throwIfScanAborted(signal);
  if (typeof createImageBitmap === "function") {
    const bitmapTask = createImageBitmap(source);
    const bitmap = await waitForScanTask(bitmapTask, {
      timeoutMs: IMAGE_DECODE_TIMEOUT_MS,
      timeoutMessage: `${label} took too long to decode. Try exporting it as a fresh PNG or JPEG.`,
      signal,
      onStop: () => bitmapTask.then((lateBitmap) => lateBitmap.close?.()).catch(() => {}),
    });
    return { image: bitmap, release: () => bitmap.close?.() };
  }
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await waitForScanTask(image.decode(), {
      timeoutMs: IMAGE_DECODE_TIMEOUT_MS,
      timeoutMessage: `${label} took too long to decode. Try exporting it as a fresh PNG or JPEG.`,
      signal,
      onStop: () => { image.src = ""; },
    });
    return { image, release: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function loadRemoteImage(url, signal) {
  throwIfScanAborted(signal);
  const controller = new AbortController();
  try {
    const response = await waitForScanTask(fetch(url, {
      credentials: "omit",
      mode: "cors",
      signal: controller.signal,
    }), {
      timeoutMs: HERO_ARTWORK_TIMEOUT_MS,
      timeoutMessage: "Hero artwork took too long to load. Check the connection and retry.",
      signal,
      onStop: () => controller.abort(),
    });
    if (!response.ok) throw new Error(`Could not load hero artwork (HTTP ${response.status}).`);
    const blob = await waitForScanTask(response.blob(), {
      timeoutMs: HERO_ARTWORK_TIMEOUT_MS,
      timeoutMessage: "Hero artwork took too long to decode. Retry the scan.",
      signal,
      onStop: () => controller.abort(),
    });
    return loadImageSource(blob, { signal, label: "Hero artwork" });
  } finally {
    controller.abort();
  }
}

async function fetchOcrRuntimeFile(file, signal) {
  throwIfScanAborted(signal);
  const controller = new AbortController();
  const url = new URL(file.path, window.location.origin).href;
  try {
    const response = await waitForScanTask(fetch(url, {
      cache: "force-cache",
      credentials: "same-origin",
      signal: controller.signal,
    }), {
      timeoutMs: OCR_RUNTIME_ASSET_TIMEOUT_MS,
      timeoutMessage: `${file.label} could not be downloaded within 30 seconds. Check the connection and retry.`,
      signal,
      onStop: () => controller.abort(),
    });
    if (!response.ok) throw new Error(`${file.label} could not be loaded (HTTP ${response.status}).`);
    const bytes = await waitForScanTask(response.arrayBuffer(), {
      timeoutMs: OCR_RUNTIME_ASSET_TIMEOUT_MS,
      timeoutMessage: `${file.label} stopped while downloading. Check the connection and retry.`,
      signal,
      onStop: () => controller.abort(),
    });
    if (!bytes.byteLength) throw new Error(`${file.label} is empty. Refresh the page and retry.`);
  } finally {
    controller.abort();
  }
}

async function prepareOcrRuntime(signal) {
  let completed = 0;
  await Promise.all(OCR_RUNTIME_FILES.map(async (file) => {
    await fetchOcrRuntimeFile(file, signal);
    completed += 1;
    activeOcrProgress?.({
      stage: "engine",
      message: `Preparing local OCR files (${completed}/${OCR_RUNTIME_FILES.length})…`,
      progress: (completed / OCR_RUNTIME_FILES.length) * 0.3,
    });
  }));
}

function featureFromRect(image, rectangle, scratchCanvas) {
  const { width, height } = imageSize(image);
  const context = scratchCanvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, FEATURE_SIZE, FEATURE_SIZE);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    image,
    rectangle.x * width,
    rectangle.y * height,
    rectangle.width * width,
    rectangle.height * height,
    0,
    0,
    FEATURE_SIZE,
    FEATURE_SIZE,
  );
  const pixels = context.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE).data;
  const luminance = [];
  const chroma = [];
  for (let y = 0; y < FEATURE_SIZE; y += 1) {
    for (let x = 0; x < FEATURE_SIZE; x += 1) {
      const nx = (x + 0.5) / FEATURE_SIZE - 0.5;
      const ny = (y + 0.5) / FEATURE_SIZE - 0.5;
      if (Math.hypot(nx, ny) > 0.39) continue;
      const index = (y * FEATURE_SIZE + x) * 4;
      const r = pixels[index] / 255;
      const g = pixels[index + 1] / 255;
      const b = pixels[index + 2] / 255;
      const sum = r + g + b + 0.001;
      luminance.push(r * 0.299 + g * 0.587 + b * 0.114);
      chroma.push(r / sum, g / sum);
    }
  }
  return { luminance, chroma };
}

function pearsonSimilarity(left, right) {
  if (!left.length || left.length !== right.length) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? clamp((numerator / denominator + 1) / 2) : 0;
}

function compareFeatures(left, right) {
  const luminanceScore = pearsonSimilarity(left.luminance, right.luminance);
  let chromaDistance = 0;
  for (let index = 0; index < left.chroma.length; index += 1) {
    chromaDistance += Math.abs(left.chroma[index] - right.chroma[index]);
  }
  const chromaScore = left.chroma.length ? clamp(1 - chromaDistance / left.chroma.length * 2.2) : 0;
  return luminanceScore * 0.72 + chromaScore * 0.28;
}

function candidateIconRectangles(image, centerX, centerY) {
  const { width, height } = imageSize(image);
  const sizes = [0.095, 0.108, 0.121];
  const offsets = [-0.014, 0, 0.014];
  const rectangles = [];
  sizes.forEach((heightRatio) => {
    const widthRatio = heightRatio * height / width;
    offsets.forEach((xOffset) => {
      offsets.forEach((yOffset) => {
        rectangles.push({
          x: centerX + xOffset - widthRatio / 2,
          y: centerY + yOffset - heightRatio / 2,
          width: widthRatio,
          height: heightRatio,
        });
      });
    });
  });
  return rectangles.filter((rectangle) => rectangle.x >= 0 && rectangle.y >= 0 && rectangle.x + rectangle.width <= 1 && rectangle.y + rectangle.height <= 1);
}

function scoreHeroSide(image, layout, side, referenceFeatures) {
  const scratchCanvas = createCanvas(FEATURE_SIZE, FEATURE_SIZE);
  const scoreMatrix = layout.rows.map(() => referenceFeatures.map(() => 0));
  const bestRectangles = layout.rows.map(() => referenceFeatures.map(() => null));

  layout.rows.forEach((rowCenterY, rowIndex) => {
    const candidates = candidateIconRectangles(image, layout.iconCenterX[side], rowCenterY);
    candidates.forEach((rectangle) => {
      const candidateFeature = featureFromRect(image, rectangle, scratchCanvas);
      referenceFeatures.forEach((referenceFeature, heroIndex) => {
        const score = Math.max(...referenceFeature.map((feature) => compareFeatures(candidateFeature, feature)));
        if (score > scoreMatrix[rowIndex][heroIndex]) {
          scoreMatrix[rowIndex][heroIndex] = score;
          bestRectangles[rowIndex][heroIndex] = rectangle;
        }
      });
    });
  });

  const solved = solveHeroAssignment(scoreMatrix);
  return {
    ...solved,
    side,
    matches: solved.assignment.map((heroIndex, rowIndex) => ({
      rowIndex,
      heroIndex,
      score: scoreMatrix[rowIndex][heroIndex],
      rectangle: bestRectangles[rowIndex][heroIndex],
    })),
  };
}

function chooseTeamSide(image, layout, referenceFeatures) {
  const left = scoreHeroSide(image, layout, "left", referenceFeatures);
  const right = scoreHeroSide(image, layout, "right", referenceFeatures);
  const winner = left.average >= right.average ? left : right;
  const runnerUp = winner === left ? right : left;
  const sideGap = winner.average - runnerUp.average;
  return {
    ...winner,
    sideGap,
    trusted: winner.average >= 0.55 && winner.minimum >= 0.38 && sideGap >= 0.018,
  };
}

function normalizedFieldRectangle(layout, side, field, rowCenterY) {
  const width = layout.fieldWidth[field];
  return {
    x: layout.fieldCenterX[side][field] - width / 2,
    y: rowCenterY + layout.valueYOffset - layout.valueHeight / 2,
    width,
    height: layout.valueHeight,
  };
}

export function buildLocalGoldFieldRectangles(side, rowCenterY) {
  if (side !== "left" && side !== "right") return [];
  if (!Number.isFinite(rowCenterY)) return [];
  const centerX = RESULT_LAYOUT.scoreboard.fieldCenterX[side].gold;
  const y = rowCenterY - 0.059;
  return [
    { x: centerX - 0.022, y, width: 0.045, height: 0.027 },
    { x: centerX - 0.027, y, width: 0.055, height: 0.027 },
  ];
}

export function buildLocalDamageFieldRectangles(side, field, rowCenterY) {
  const layout = RESULT_LAYOUT.data;
  if (!new Set(["left", "right"]).has(side)) return [];
  if (!new Set(["damage", "damageTaken"]).has(field)) return [];
  if (!Number.isFinite(rowCenterY)) return [];

  const precise = normalizedFieldRectangle(layout, side, field, rowCenterY);
  const group = layout.rowGroup[side];
  const damageCenter = layout.fieldCenterX[side].damage;
  const damageTakenCenter = layout.fieldCenterX[side].damageTaken;
  const middleColumnCenter = (damageCenter + damageTakenCenter) / 2;
  const outerPadding = 0.008;
  const leftBoundary = field === "damage"
    ? Math.max(0, group.x - outerPadding)
    : (middleColumnCenter + damageTakenCenter) / 2;
  const rightBoundary = field === "damage"
    ? (damageCenter + middleColumnCenter) / 2
    : Math.min(1, group.x + group.width + outerPadding);
  const trailingPadding = 0.014;
  const trailingBoundary = field === "damage"
    ? Math.min(middleColumnCenter - 0.012, rightBoundary + trailingPadding)
    : Math.min(1, rightBoundary + trailingPadding);
  const safeWide = {
    x: leftBoundary,
    y: Math.max(0, precise.y - 0.004),
    width: Math.max(precise.width, trailingBoundary - leftBoundary),
    height: Math.min(1 - Math.max(0, precise.y - 0.004), precise.height + 0.008),
  };

  return [
    {
      geometry: "tight",
      threshold: 105,
      rectangle: {
        x: layout.fieldCenterX[side][field] - 0.025,
        y: precise.y + 0.004,
        width: 0.05,
        height: precise.height - 0.01,
      },
    },
    { geometry: "safe-wide", threshold: 130, rectangle: safeWide },
    { geometry: "precise", threshold: 145, rectangle: precise },
    {
      geometry: "wide-upper",
      threshold: 160,
      rectangle: { ...safeWide, y: Math.max(0, safeWide.y - 0.006) },
    },
    {
      geometry: "wide-lower",
      threshold: 145,
      rectangle: { ...safeWide, y: Math.min(1 - safeWide.height, safeWide.y + 0.006) },
    },
  ];
}

function expandNormalizedRectangle(rectangle, horizontal = 0.16, vertical = 0.24) {
  const xPadding = rectangle.width * horizontal;
  const yPadding = rectangle.height * vertical;
  const x = Math.max(0, rectangle.x - xPadding);
  const y = Math.max(0, rectangle.y - yPadding);
  return {
    x,
    y,
    width: Math.min(1 - x, rectangle.width + xPadding * 2),
    height: Math.min(1 - y, rectangle.height + yPadding * 2),
  };
}

function normalizedRowGroupRectangle(layout, side, rowCenterY) {
  const group = layout.rowGroup[side];
  return {
    x: group.x,
    y: rowCenterY + layout.valueYOffset - layout.valueHeight / 2,
    width: group.width,
    height: layout.valueHeight,
  };
}

function normalizedIrRectangles(layout, side, rowCenterY, image) {
  const { width, height } = imageSize(image);
  const geometry = classifyLocalScoreboardGeometry(width / height);
  const primaryKey = geometry === "standard" ? "standard" : "wide";
  return [primaryKey, primaryKey === "standard" ? "wide" : "standard"].map((key) => {
    const ir = layout.ir[key];
    return {
      geometry: key,
      rectangle: {
        x: ir.centerX[side] - ir.width / 2,
        y: rowCenterY + ir.yOffset - ir.height / 2,
        width: ir.width,
        height: ir.height,
      },
    };
  });
}

function normalizedTeamKillRectangles(layout, side, image) {
  const { width, height } = imageSize(image);
  const primaryKey = classifyLocalScoreboardGeometry(width / height);
  const fallbackKeys = ["standard", "wide", "ultraWide"].filter((key) => key !== primaryKey);
  return [primaryKey, ...fallbackKeys].map((geometry) => ({
    geometry,
    rectangle: layout.teamKills[geometry][side],
  }));
}

function normalizedMvpBadgeRectangles(layout, side, rowCenterY) {
  const centerX = layout.mvpBadge.centerX[side];
  const centerY = rowCenterY + layout.mvpBadge.yOffset;
  const centerwardShift = side === "left" ? 0.005 : -0.005;
  return [
    {
      geometry: "badge-wide",
      rectangle: {
        x: centerX - layout.mvpBadge.width / 2,
        y: centerY - layout.mvpBadge.height / 2,
        width: layout.mvpBadge.width,
        height: layout.mvpBadge.height,
      },
    },
    {
      geometry: "badge-centered",
      rectangle: {
        x: centerX + centerwardShift - 0.026,
        y: centerY - 0.034,
        width: 0.052,
        height: 0.068,
      },
    },
    {
      geometry: "badge-lower",
      rectangle: {
        x: centerX + centerwardShift - 0.028,
        y: centerY - 0.028,
        width: 0.056,
        height: 0.068,
      },
    },
  ];
}

function measureMvpBadgeAppearance(image, rectangle) {
  const { width, height } = imageSize(image);
  const canvas = createCanvas(48, 40);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(
    image,
    rectangle.x * width,
    rectangle.y * height,
    rectangle.width * width,
    rectangle.height * height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let warmPixels = 0;
  let purplePixels = 0;
  let brightPixels = 0;
  let luminanceTotal = 0;
  const pixelCount = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] / 255;
    const g = pixels[index + 1] / 255;
    const b = pixels[index + 2] / 255;
    const luminance = r * 0.299 + g * 0.587 + b * 0.114;
    luminanceTotal += luminance;
    if (r > 0.42 && r > g * 1.18 && r > b * 1.06) warmPixels += 1;
    if (r > 0.28 && b > 0.3 && b > g * 1.22 && Math.abs(r - b) < 0.28) purplePixels += 1;
    if (luminance > 0.7) brightPixels += 1;
  }
  const warmRatio = warmPixels / pixelCount;
  const purpleRatio = purplePixels / pixelCount;
  const brightRatio = brightPixels / pixelCount;
  return {
    warmRatio,
    purpleRatio,
    brightRatio,
    luminance: luminanceTotal / pixelCount,
    visualScore: warmRatio + purpleRatio * 1.15 + brightRatio * 0.45,
  };
}

function measureBestMvpBadgeAppearance(image, rectangleOptions) {
  return rectangleOptions
    .map(({ rectangle, geometry }) => ({ ...measureMvpBadgeAppearance(image, rectangle), geometry, rectangle }))
    .sort((left, right) => right.visualScore - left.visualScore)[0] || null;
}

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = 0;
  let threshold = 128;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }
  return threshold;
}

function createOcrCanvas(image, rectangle, mode = "binary") {
  const { width, height } = imageSize(image);
  const sourceWidth = Math.max(1, Math.round(rectangle.width * width));
  const sourceHeight = Math.max(1, Math.round(rectangle.height * height));
  const nativeRaw = mode === "native-raw";
  const scale = nativeRaw ? 1 : Math.max(4, Math.min(8, 120 / sourceHeight));
  const padding = nativeRaw ? 0 : 14;
  const canvas = createCanvas(sourceWidth * scale + padding * 2, sourceHeight * scale + padding * 2);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    image,
    rectangle.x * width,
    rectangle.y * height,
    rectangle.width * width,
    rectangle.height * height,
    padding,
    padding,
    sourceWidth * scale,
    sourceHeight * scale,
  );

  if (mode === "raw" || nativeRaw) return canvas;

  const imageData = context.getImageData(padding, padding, sourceWidth * scale, sourceHeight * scale);
  const histogram = new Array(256).fill(0);
  let luminanceTotal = 0;
  const redText = mode === "red-text";
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = Math.round(imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114);
    histogram[luminance] += 1;
    luminanceTotal += luminance;
  }
  const pixelCount = imageData.data.length / 4;
  const fixedLightThreshold = mode.startsWith("light-") ? Number(mode.slice("light-".length)) : null;
  const threshold = Number.isFinite(fixedLightThreshold) ? fixedLightThreshold : otsuThreshold(histogram, pixelCount);
  const darkBackground = luminanceTotal / pixelCount < 145;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = Math.round(imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114);
    const textPixel = redText
      ? imageData.data[index] > 105 && imageData.data[index] - imageData.data[index + 1] > 38
      : Number.isFinite(fixedLightThreshold)
      ? luminance >= threshold
      : darkBackground ? luminance >= threshold : luminance <= threshold;
    const output = textPixel ? 0 : 255;
    imageData.data[index] = output;
    imageData.data[index + 1] = output;
    imageData.data[index + 2] = output;
    imageData.data[index + 3] = 255;
  }
  context.putImageData(imageData, padding, padding);
  return canvas;
}

async function createNumericWorker(signal) {
  const tesseractModule = await waitForScanTask(import("tesseract.js"), {
    timeoutMs: OCR_MODULE_TIMEOUT_MS,
    timeoutMessage: "The local OCR module did not load in time. Refresh the page and retry.",
    signal,
  });
  const createWorker = tesseractModule.createWorker || tesseractModule.default?.createWorker;
  const PSM = tesseractModule.PSM || tesseractModule.default?.PSM;
  if (!createWorker || !PSM) throw new Error("The local OCR engine could not be loaded in this browser.");
  activeOcrProgress?.({ stage: "engine", message: "Downloading the local OCR runtime…", progress: 0.02 });
  await prepareOcrRuntime(signal);
  const runtimeOrigin = window.location.origin;
  const langPath = new URL("/tessdata", runtimeOrigin).href.replace(/\/$/, "");
  const workerPath = new URL("/tesseract/local-worker.js", runtimeOrigin).href;
  const corePath = new URL("/tesseract", runtimeOrigin).href.replace(/\/$/, "");
  let workerPhase = "starting the worker";
  let rejectWorkerFailure;
  const workerFailure = new Promise((resolve, reject) => {
    void resolve;
    rejectWorkerFailure = reject;
  });
  const phaseDetails = {
    "loading tesseract core": { label: "Loading the compatible OCR core", start: 0.3, end: 0.65 },
    "initializing tesseract": { label: "Starting WebAssembly", start: 0.65, end: 0.8 },
    "loading language traineddata": { label: "Loading OCR language data", start: 0.8, end: 0.94 },
    "initializing api": { label: "Finalizing the OCR engine", start: 0.94, end: 1 },
  };
  const workerTask = createWorker("eng", 1, {
    langPath,
    workerPath,
    corePath,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none",
    logger: (message) => {
      const detail = phaseDetails[message.status];
      if (!detail) return;
      workerPhase = detail.label.toLowerCase();
      const phaseProgress = Math.max(0, Math.min(1, Number(message.progress || 0)));
      activeOcrProgress?.({
        stage: "engine",
        message: `${detail.label}…`,
        progress: detail.start + phaseProgress * (detail.end - detail.start),
      });
    },
    errorHandler: (failure) => {
      const detail = failure instanceof Error ? failure.message : String(failure || "Unknown worker error");
      rejectWorkerFailure(new Error(`The local OCR engine failed while ${workerPhase}: ${detail}`));
    },
  });
  const readyTask = Promise.race([workerTask, workerFailure]);
  let worker;
  try {
    worker = await waitForScanTask(readyTask, {
      timeoutMs: OCR_WORKER_INIT_TIMEOUT_MS,
      timeoutMessage: () => `The local OCR engine did not finish ${workerPhase} within 60 seconds. Its worker was reset; retry once or refresh the page.`,
      signal,
      onStop: () => workerTask.then((lateWorker) => lateWorker.terminate()).catch(() => {}),
    });
  } catch (error) {
    workerTask.then((lateWorker) => lateWorker.terminate()).catch(() => {});
    throw error instanceof Error ? error : new Error(String(error || "The local OCR engine failed to start."));
  }
  return { worker, PSM };
}

function discardNumericWorker() {
  activeOcrProgress = undefined;
  if (cachedOcrWorkerTimer) {
    clearTimeout(cachedOcrWorkerTimer);
    cachedOcrWorkerTimer = undefined;
  }
  const workerPromise = cachedOcrWorkerPromise;
  cachedOcrWorkerPromise = undefined;
  workerPromise?.then(({ worker }) => worker.terminate()).catch(() => {});
}

async function acquireNumericWorker(onProgress, signal) {
  throwIfScanAborted(signal);
  activeOcrProgress = onProgress;
  if (cachedOcrWorkerTimer) {
    clearTimeout(cachedOcrWorkerTimer);
    cachedOcrWorkerTimer = undefined;
  }
  if (!cachedOcrWorkerPromise) {
    const workerPromise = createNumericWorker(signal).catch((error) => {
      if (cachedOcrWorkerPromise === workerPromise) cachedOcrWorkerPromise = undefined;
      throw error;
    });
    cachedOcrWorkerPromise = workerPromise;
  } else {
    onProgress?.({ stage: "engine", message: "Using the cached local OCR engine…", progress: 1 });
  }
  try {
    return await waitForScanTask(cachedOcrWorkerPromise, {
      timeoutMs: OCR_RUNTIME_ASSET_TIMEOUT_MS + OCR_WORKER_INIT_TIMEOUT_MS + 5000,
      timeoutMessage: "The cached local OCR engine stopped responding. It was reset; please retry the scan.",
      signal,
      onStop: discardNumericWorker,
    });
  } catch (error) {
    discardNumericWorker();
    throw error;
  }
}

function releaseNumericWorkerLater() {
  activeOcrProgress = undefined;
  if (!cachedOcrWorkerPromise) return;
  cachedOcrWorkerTimer = setTimeout(async () => {
    const workerPromise = cachedOcrWorkerPromise;
    cachedOcrWorkerPromise = undefined;
    cachedOcrWorkerTimer = undefined;
    try {
      const { worker } = await workerPromise;
      await worker.terminate();
    } catch {
      // A failed worker has already been removed from the cache.
    }
  }, OCR_WORKER_IDLE_MS);
}

async function configureOcr(worker, PSM, mode, signal) {
  const textMode = mode === "text";
  throwIfScanAborted(signal);
  try {
    await waitForScanTask(worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: textMode
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        : "0123456789Kk.,:OQDGBZIlS ",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    }), {
      timeoutMs: OCR_CONFIGURATION_TIMEOUT_MS,
      timeoutMessage: "The local OCR engine stopped while configuring the scan. Its worker was reset; please retry.",
      signal,
      onStop: discardNumericWorker,
    });
  } catch (error) {
    discardNumericWorker();
    throw error;
  }
}

async function recognizeOcr(worker, canvas, signal) {
  throwIfScanAborted(signal);
  try {
    return await waitForScanTask(worker.recognize(canvas), {
      timeoutMs: OCR_RECOGNITION_TIMEOUT_MS,
      timeoutMessage: "A local OCR pass stopped responding. Its worker was reset; please retry the scan.",
      signal,
      onStop: discardNumericWorker,
    });
  } catch (error) {
    discardNumericWorker();
    throw error;
  }
}

async function recognizeWithVariants(worker, image, rectangle, signal) {
  const binary = await recognizeOcr(worker, createOcrCanvas(image, rectangle), signal);
  const binaryResult = {
    text: String(binary.data.text || "").trim(),
    confidence: Number(binary.data.confidence || 0),
    mode: "binary",
  };
  return {
    binary: binaryResult,
    retryRaw: async () => {
      const raw = await recognizeOcr(worker, createOcrCanvas(image, rectangle, "raw"), signal);
      return {
        text: String(raw.data.text || "").trim(),
        confidence: Number(raw.data.confidence || 0),
        mode: "raw",
      };
    },
  };
}

async function recognizeLightTextVariant(worker, image, rectangle, threshold, geometry, signal) {
  const mode = `light-${threshold}`;
  const recognition = await recognizeOcr(worker, createOcrCanvas(image, rectangle, mode), signal);
  return {
    text: String(recognition.data.text || "").trim(),
    confidence: Number(recognition.data.confidence || 0),
    mode: `${geometry} ${mode}`,
  };
}

async function recognizeIntegerCellCandidates(worker, image, rectangle, field, signal) {
  const recognition = await recognizeWithVariants(worker, image, rectangle, signal);
  return [
    recognition.binary,
    await recognition.retryRaw(),
    await recognizeLightTextVariant(worker, image, rectangle, 140, field, signal),
  ];
}

async function recognizeIntegerCell(worker, image, rectangle, field, signal) {
  const candidates = await recognizeIntegerCellCandidates(worker, image, rectangle, field, signal);
  let selected = selectLocalOcrIntegerCandidate(candidates, field);
  if (["kills", "deaths", "assists"].includes(field) && selected.confidence < 90) {
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 100, field, signal));
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 120, field, signal));
    selected = selectLocalOcrIntegerCandidate(candidates, field);
  }
  return selected;
}

async function recognizeGoldCell(worker, image, side, rowCenterY, signal) {
  const rectangles = buildLocalGoldFieldRectangles(side, rowCenterY);
  const candidates = [];
  for (const [index, rectangle] of rectangles.entries()) {
    const recognition = await recognizeWithVariants(worker, image, rectangle, signal);
    candidates.push(
      { ...recognition.binary, mode: `gold-${index} binary`, rectangle },
      { ...await recognition.retryRaw(), mode: `gold-${index} raw`, rectangle },
      { ...await recognizeLightTextVariant(worker, image, rectangle, 100, `gold-${index}`, signal), rectangle },
      { ...await recognizeLightTextVariant(worker, image, rectangle, 120, `gold-${index}`, signal), rectangle },
    );
    const selected = selectLocalOcrGoldCandidate(candidates);
    if (selected.value !== null && selected.confidence >= 90 && selected.evidenceCount >= 3) break;
  }
  const selected = selectLocalOcrGoldCandidate(candidates);
  return { ...selected, rectangle: selected.rectangle || rectangles[0] };
}

function damageFieldCandidatesFromSequence(candidates, fields, field) {
  const fieldIndex = fields.indexOf(field);
  if (fieldIndex < 0) return [];
  return candidates.flatMap((candidate) => {
    const values = parseLocalOcrIntegerSequence(candidate.text);
    const complete = values.length === fields.length
      && fields.every((sequenceField, index) => isPlausibleOcrFieldValue(sequenceField, values[index]));
    if (!complete) return [];
    return [{
      text: String(values[fieldIndex]),
      confidence: Number(candidate.confidence || 0),
      mode: `row-sequence ${candidate.mode || ""}`.trim(),
      geometry: "row-sequence",
    }];
  });
}

async function recognizeDamageGeometryCandidates(worker, image, option, field, signal) {
  const recognition = await recognizeWithVariants(worker, image, option.rectangle, signal);
  const binary = {
    ...recognition.binary,
    geometry: option.geometry,
    rectangle: option.rectangle,
    mode: `${option.geometry} ${recognition.binary.mode}`,
  };
  const light = {
    ...await recognizeLightTextVariant(worker, image, option.rectangle, option.threshold, option.geometry, signal),
    geometry: option.geometry,
    rectangle: option.rectangle,
  };
  const candidates = [binary, light];
  const binaryValue = parseLocalOcrInteger(binary.text);
  const lightValue = parseLocalOcrInteger(light.text);
  const mayHaveClippedTrailingDigit = binaryValue !== null
    && lightValue !== null
    && String(binaryValue).length <= 5
    && String(lightValue).length <= 5;
  if (!isPlausibleOcrFieldValue(field, binaryValue)
    || !isPlausibleOcrFieldValue(field, lightValue)
    || binaryValue !== lightValue
    || mayHaveClippedTrailingDigit) {
    const raw = await recognition.retryRaw();
    candidates.push({
      ...raw,
      geometry: option.geometry,
      rectangle: option.rectangle,
      mode: `${option.geometry} ${raw.mode}`,
    });
  }
  return candidates;
}

async function recognizeDamageField(worker, image, rectangleOptions, field, signal, seedCandidates = []) {
  const candidates = [...seedCandidates];
  const initialOptions = field === "damage"
    ? rectangleOptions.filter((option) => option.geometry !== "tight")
    : rectangleOptions;
  for (const option of initialOptions) {
    candidates.push(...await recognizeDamageGeometryCandidates(worker, image, option, field, signal));
  }
  if (field === "damage" && selectLocalOcrDamageCandidate(candidates, field).value === null) {
    const tight = rectangleOptions.find((option) => option.geometry === "tight");
    if (tight) candidates.push(...await recognizeDamageGeometryCandidates(worker, image, tight, field, signal));
  }
  return selectLocalOcrDamageCandidate(candidates, field);
}

export function selectLocalOcrDurationCandidate(candidates = []) {
  const groups = groupLocalOcrCandidates(candidates, (text) => parseLocalOcrDuration(text) || null)
    .sort((left, right) => right.count - left.count || right.maxConfidence - left.maxConfidence || right.averageConfidence - left.averageConfidence);
  const selected = groups[0];
  if (!selected) {
    const fallback = candidates.slice().sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0];
    return { value: "", confidence: Math.min(54, Number(fallback?.confidence || 0)), raw: String(fallback?.text || ""), mode: fallback?.mode || "", disagreement: false, evidenceCount: 0 };
  }
  const disagreement = groups.length > 1;
  return {
    value: selected.value,
    confidence: calibratedConsensusConfidence(selected, disagreement),
    raw: selected.best.text,
    mode: selected.best.mode,
    disagreement,
    evidenceCount: selected.count,
    candidates: candidates.map(({ text = "", confidence = 0, mode = "" }) => ({ text, confidence: Math.round(Number(confidence || 0)), mode })),
  };
}

async function recognizeDuration(worker, image, rectangle, signal) {
  const rectangles = [
    rectangle,
    { ...rectangle, x: rectangle.x - 0.001, width: rectangle.width + 0.003 },
  ];
  const candidates = [];
  for (const [index, option] of rectangles.entries()) {
    const recognition = await recognizeWithVariants(worker, image, option, signal);
    candidates.push(
      { ...recognition.binary, mode: `duration-${index} binary` },
      { ...await recognition.retryRaw(), mode: `duration-${index} raw` },
      await recognizeLightTextVariant(worker, image, option, 140, `duration-${index}`, signal),
    );
  }
  return selectLocalOcrDurationCandidate(candidates);
}

async function recognizeRating(worker, image, rectangleOptions, signal) {
  const candidates = [];
  for (const { rectangle, geometry } of rectangleOptions) {
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 120, geometry, signal));
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 135, geometry, signal));
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 150, geometry, signal));
    let selected = selectLocalOcrRatingCandidate(candidates);
    if (selected.value !== null && selected.confidence >= OCR_TARGET_CONFIDENCE && !selected.disagreement) return selected;

    const recognition = await recognizeWithVariants(worker, image, rectangle, signal);
    const raw = await recognition.retryRaw();
    candidates.push(
      { ...recognition.binary, mode: `${geometry} ${recognition.binary.mode}` },
      { ...raw, mode: `${geometry} ${raw.mode}` },
    );
    selected = selectLocalOcrRatingCandidate(candidates);
    if (selected.value !== null && selected.confidence >= OCR_TARGET_CONFIDENCE && !selected.disagreement) return selected;
  }
  return selectLocalOcrRatingCandidate(candidates);
}

async function recognizeTeamKillScore(worker, image, rectangleOptions, expectedValue, signal) {
  const candidates = [];
  const hasExpected = expectedValue !== null && expectedValue !== "" && expectedValue !== undefined
    && Number.isSafeInteger(Number(expectedValue));
  for (const { rectangle, geometry } of rectangleOptions) {
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 130, geometry, signal));
    candidates.push(await recognizeLightTextVariant(worker, image, rectangle, 160, geometry, signal));
    let selected = selectLocalTeamKillCandidate(candidates, expectedValue);
    if ((selected.crossChecked && selected.confidence >= OCR_TARGET_CONFIDENCE)
      || (!hasExpected && selected.value !== null && selected.confidence >= OCR_TARGET_CONFIDENCE && !selected.disagreement)) return selected;

    const recognition = await recognizeWithVariants(worker, image, rectangle, signal);
    const raw = await recognition.retryRaw();
    candidates.push(
      { ...recognition.binary, mode: `${geometry} ${recognition.binary.mode}` },
      { ...raw, mode: `${geometry} ${raw.mode}` },
    );
    selected = selectLocalTeamKillCandidate(candidates, expectedValue);
    if ((selected.crossChecked && selected.confidence >= OCR_TARGET_CONFIDENCE)
      || (!hasExpected && selected.value !== null && selected.confidence >= OCR_TARGET_CONFIDENCE && !selected.disagreement)) return selected;
  }
  return selectLocalTeamKillCandidate(candidates, expectedValue);
}

async function recognizeIntegerSequence(worker, image, rectangle, fields, signal) {
  const recognition = await recognizeWithVariants(worker, image, rectangle, signal);
  const candidates = [
    recognition.binary,
    await recognition.retryRaw(),
    await recognizeLightTextVariant(worker, image, rectangle, 140, "row", signal),
  ];
  return selectLocalOcrSequenceCandidate(candidates, fields);
}

async function recognizeScreenKind(worker, image, signal) {
  const candidates = [];
  const buttonRectangles = [
    { rectangle: { x: 0.065, y: 0.884, width: 0.099, height: 0.079 }, geometry: "button-label" },
    { rectangle: { x: 0.035, y: 0.88, width: 0.13, height: 0.085 }, geometry: "button-wide" },
  ];
  for (const option of buttonRectangles) {
    const nativeRecognition = await recognizeOcr(worker, createOcrCanvas(image, option.rectangle, "native-raw"), signal);
    const nativeRaw = {
      text: String(nativeRecognition.data.text || "").trim(),
      confidence: Number(nativeRecognition.data.confidence || 0),
      mode: "native-raw",
      geometry: option.geometry,
    };
    candidates.push(nativeRaw);
    const nativeKind = classifyLocalResultScreenLabel(nativeRaw.text);
    if (nativeKind) {
      return { detectedKind: nativeKind, raw: nativeRaw.text, confidence: Math.max(70, Math.round(nativeRaw.confidence)), source: option.geometry };
    }

    const recognition = await recognizeWithVariants(worker, image, option.rectangle, signal);
    const binary = { ...recognition.binary, geometry: option.geometry };
    candidates.push(binary);
    let detectedKind = classifyLocalResultScreenLabel(binary.text);
    if (detectedKind) {
      return { detectedKind, raw: binary.text, confidence: Math.max(70, Math.round(binary.confidence)), source: option.geometry };
    }
    const raw = { ...await recognition.retryRaw(), geometry: option.geometry };
    candidates.push(raw);
    detectedKind = classifyLocalResultScreenLabel(raw.text);
    if (detectedKind) {
      return { detectedKind, raw: raw.text, confidence: Math.max(70, Math.round(raw.confidence)), source: option.geometry };
    }
  }

  const headerRectangle = { x: 0.16, y: 0.145, width: 0.32, height: 0.07 };
  const nativeHeaderRecognition = await recognizeOcr(worker, createOcrCanvas(image, headerRectangle, "native-raw"), signal);
  const headerRecognition = await recognizeWithVariants(worker, image, headerRectangle, signal);
  const headerCandidates = [
    {
      text: String(nativeHeaderRecognition.data.text || "").trim(),
      confidence: Number(nativeHeaderRecognition.data.confidence || 0),
      mode: "native-raw",
      geometry: "data-column-header",
    },
    { ...headerRecognition.binary, geometry: "data-column-header" },
    { ...await headerRecognition.retryRaw(), geometry: "data-column-header" },
  ];
  candidates.push(...headerCandidates);
  const detectedHeader = headerCandidates.find((candidate) => classifyLocalResultScreenHeader(candidate.text));
  if (detectedHeader) {
    return {
      detectedKind: "data",
      raw: detectedHeader.text,
      confidence: Math.max(70, Math.round(detectedHeader.confidence)),
      source: detectedHeader.geometry,
    };
  }

  const selected = candidates.sort((left, right) => right.confidence - left.confidence)[0] || { text: "", confidence: 0 };
  return {
    detectedKind: "",
    raw: selected.text,
    confidence: Math.round(selected.confidence),
    source: "not recognized",
  };
}

async function detectLocalResultScreen(worker, file, image, signal) {
  const cached = file && typeof file === "object" ? screenKindCache.get(file) : null;
  if (cached) return { ...cached, cached: true };
  const detection = await recognizeScreenKind(worker, image, signal);
  if (file && typeof file === "object") screenKindCache.set(file, detection);
  return detection;
}

export function attachLocalScreenDetection(entry, detection) {
  return {
    ...entry,
    ...detection,
    // `recognizeScreenKind` also calls its OCR crop the detection source. Keep
    // the decoded image source authoritative when the two records are merged.
    source: entry.source,
  };
}

function assertSupportedImage(image, label) {
  const { width, height } = imageSize(image);
  if (!width || !height) throw new Error(`${label} could not be decoded.`);
  const aspect = width / height;
  if (aspect < SUPPORTED_ASPECT_MIN || aspect > SUPPORTED_ASPECT_MAX) {
    throw new Error(`${label} needs to be a full-width Mobile Legends result screen. Cropped, portrait, and camera photos are not supported yet.`);
  }
}

function assertLocalScannerFile(file) {
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(String(file?.type || "").toLowerCase())) {
    throw new Error("Local Result Scanner accepts PNG, JPEG, or WebP screenshots only.");
  }
  if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name || "Screenshot"} is larger than the 15 MB local safety limit.`);
}

export async function rescanLocalResultField({ file, kind, side, rowIndex, field, signal, onProgress } = {}) {
  if (!file) throw new Error("Choose the source screenshot again before re-scanning this value.");
  if (!new Set(["scoreboard", "data"]).has(kind)) throw new Error("The source result screen is unknown.");
  if (!new Set(["left", "right"]).has(side)) throw new Error("Our team's side could not be verified for this field.");
  const layout = RESULT_LAYOUT[kind];
  if (!Number.isInteger(rowIndex) || !layout.rows[rowIndex]) throw new Error("The source player row could not be verified.");
  const isRating = kind === "scoreboard" && field === "ir";
  if (!isRating && !Object.prototype.hasOwnProperty.call(layout.fieldWidth, field)) throw new Error("This field cannot be re-scanned individually.");

  const source = await loadImageSource(file, { signal, label: file.name || "Screenshot" });
  let workerBundle;
  try {
    assertSupportedImage(source.image, file.name || "Screenshot");
    onProgress?.("Preparing a focused OCR pass…");
    workerBundle = await acquireNumericWorker(undefined, signal);
    await configureOcr(workerBundle.worker, workerBundle.PSM, "numeric", signal);
    if (isRating) {
      const rectangleOptions = normalizedIrRectangles(layout, side, layout.rows[rowIndex], source.image);
      const selected = await recognizeRating(workerBundle.worker, source.image, rectangleOptions, signal);
      return {
        ...selected,
        evidence: {
          sourceKind: kind,
          geometry: selected.geometry || "",
          side,
          rowIndex,
          field,
          rectangle: rectangleOptions[0].rectangle,
          candidates: selected.candidates || [],
        },
      };
    }
    if (kind === "data" && (field === "damage" || field === "damageTaken")) {
      const rectangleOptions = buildLocalDamageFieldRectangles(side, field, layout.rows[rowIndex]);
      const selected = await recognizeDamageField(workerBundle.worker, source.image, rectangleOptions, field, signal);
      return {
        ...selected,
        evidence: {
          sourceKind: kind,
          geometry: selected.geometry || "",
          side,
          rowIndex,
          field,
          rectangle: selected.rectangle || rectangleOptions[0].rectangle,
          candidates: selected.candidates || [],
        },
      };
    }
    if (kind === "scoreboard" && field === "gold") {
      const selected = await recognizeGoldCell(workerBundle.worker, source.image, side, layout.rows[rowIndex], signal);
      return {
        ...selected,
        evidence: {
          sourceKind: kind,
          geometry: selected.geometry || "",
          side,
          rowIndex,
          field,
          rectangle: selected.rectangle,
          candidates: selected.candidates || [],
        },
      };
    }
    const rectangle = normalizedFieldRectangle(layout, side, field, layout.rows[rowIndex]);
    const expandedRectangle = expandNormalizedRectangle(rectangle);
    const candidates = [
      ...await recognizeIntegerCellCandidates(workerBundle.worker, source.image, rectangle, field, signal),
      ...await recognizeIntegerCellCandidates(workerBundle.worker, source.image, expandedRectangle, field, signal),
    ];
    const selected = selectLocalOcrIntegerCandidate(candidates, field);
    return {
      ...selected,
      evidence: {
        sourceKind: kind,
        geometry: selected.geometry || "",
        side,
        rowIndex,
        field,
        rectangle,
        candidates: selected.candidates || candidates,
      },
    };
  } finally {
    source.release();
    if (signal?.aborted) discardNumericWorker();
    else if (workerBundle) releaseNumericWorkerLater();
  }
}

async function buildReferenceFeatures(picks, heroIcons, signal) {
  return Promise.all(picks.map(async (pick) => {
    throwIfScanAborted(signal);
    const url = heroIcons[normalizeScannerHeroKey(pick.hero)];
    if (heroFeatureCache.has(url)) return heroFeatureCache.get(url);
    const source = await loadRemoteImage(url, signal);
    try {
      const scratchCanvas = createCanvas(FEATURE_SIZE, FEATURE_SIZE);
      const features = [
        featureFromRect(source.image, { x: 0, y: 0, width: 1, height: 1 }, scratchCanvas),
        featureFromRect(source.image, { x: 0.07, y: 0.07, width: 0.86, height: 0.86 }, scratchCanvas),
      ];
      heroFeatureCache.set(url, features);
      return features;
    } finally {
      source.release();
    }
  }));
}

// The 16:9 replay draft screen uses two vertical pick columns and two ban strips.
export function replayDraftSlots() {
  const slots = [];
  const rect = (x, y, width, height) => ({ x: x / 1280, y: y / 720, width: width / 1280, height: height / 720 });
  for (const side of ["left", "right"]) {
    for (const kind of ["pick", "ban"]) {
      for (let index = 0; index < 5; index += 1) {
        const start = side === "left" ? 20 : 914;
        const rectangle = kind === "pick"
          ? rect(side === "left" ? 20 : 1156, 85 + index * 115, 100, 89)
          : rect(start + index * 73, 3, 52, 52);
        slots.push({ side, kind, index, rectangle });
      }
    }
  }
  return slots;
}

export async function scanReplayDraft({ file, heroes, heroIcons, signal }) {
  assertLocalScannerFile(file);
  const source = await loadImageSource(file, { signal });
  try {
    const { width, height } = imageSize(source.image);
    if (width < 640 || Math.abs(width / height - 16 / 9) > 0.035) {
      throw new Error("Use a full 16:9 replay draft screenshot, at least 640 pixels wide.");
    }
    const references = [];
    // Limit concurrent asset loads on mobile. Missing artwork leaves that hero available for manual entry.
    for (let i = 0; i < heroes.length; i += 12) {
      const batch = await Promise.allSettled(heroes.slice(i, i + 12).map(async (hero) => {
        const [features] = await buildReferenceFeatures([{ hero }], heroIcons, signal);
        return { hero, features };
      }));
      throwIfScanAborted(signal);
      for (const entry of batch) if (entry.status === "fulfilled") references.push(entry.value);
    }
    if (!references.length) throw new Error("Hero reference images could not be loaded. Retry the scan.");
    const scratch = createCanvas(FEATURE_SIZE, FEATURE_SIZE);
    const preview = createCanvas(96, 96);
    const slots = replayDraftSlots().map((slot) => {
      const r = slot.rectangle;
      // Ban badges sit at a lower corner. Compare only the center of each circle.
      const inset = slot.kind === "ban" ? 0.13 : 0;
      const crop = {
        x: r.x + r.width * inset, y: r.y + r.height * inset,
        width: r.width * (1 - inset * 2), height: r.height * (1 - inset * 2),
      };
      const feature = featureFromRect(source.image, crop, scratch);
      const ranked = references.map(({ hero, features }) => ({
        hero, score: Math.max(...features.map((ref) => compareFeatures(feature, ref))),
      })).sort((a, b) => b.score - a.score);
      preview.getContext("2d").drawImage(source.image, r.x * width, r.y * height, r.width * width, r.height * height, 0, 0, 96, 96);
      return { ...slot, candidates: ranked.slice(0, 3).map(({ hero }) => hero), crop: preview.toDataURL("image/jpeg", 0.8) };
    });
    let centerHero = "";
    let textWorker;
    try {
      const { worker, PSM } = await createNumericWorker(signal);
      textWorker = worker;
      await waitForScanTask(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }), {
        timeoutMs: OCR_CONFIGURATION_TIMEOUT_MS, signal,
      });
      const readLine = async (rectangle, mode) => {
        const canvas = createOcrCanvas(source.image, rectangle, mode);
        const result = await waitForScanTask(worker.recognize(canvas), { timeoutMs: OCR_RECOGNITION_TIMEOUT_MS, signal });
        return normalizeScannerHeroKey(result.data.text);
      };
      const rectangle = { x: 0.436, y: 0.436, width: 0.12, height: 0.067 };
      for (const mode of ["red-text", "binary"]) {
        const key = await readLine(rectangle, mode);
        centerHero = heroes.find((hero) => normalizeScannerHeroKey(hero) === key) || "";
        if (centerHero) break;
      }
      if (centerHero) {
        const nickname = await readLine({ x: 0.4, y: 0.516, width: 0.2, height: 0.05 }, "red-text");
        if (nickname.length >= 5) {
          const matches = [];
          for (const slot of slots.filter(({ kind }) => kind === "pick")) {
            const name = await readLine({
              x: slot.side === "left" ? 0.003 : 0.844,
              y: (172 + slot.index * 115) / 720, width: 0.15, height: 24 / 720,
            }, "binary");
            if (name === nickname || name.endsWith(nickname)) matches.push(slot);
          }
          if (matches.length === 1) {
            const slot = matches[0];
            slot.candidates = [centerHero, ...slot.candidates.filter((hero) => hero !== centerHero)].slice(0, 3);
          }
        }
      }
    } catch {
      throwIfScanAborted(signal);
      // The banner can disappear between replay frames. Portrait review remains available.
    } finally {
      if (textWorker) void textWorker.terminate().catch(() => {});
    }
    return { slots, centerHero, missingReferences: heroes.length - references.length };
  } finally {
    source.release();
  }
}

async function scanScreen({ entry, picks, referenceFeatures, worker, onProgress, progressState, signal }) {
  throwIfScanAborted(signal);
  const { kind, source, file } = entry;
  const label = kind === "scoreboard" ? "K/D/A + Gold screenshot" : "Damage screenshot";
  onProgress?.({ stage: "heroes", message: `Matching our heroes in ${file.name || "the screenshot"}…`, progress: progressState.completed / progressState.total });
  const layout = RESULT_LAYOUT[kind];
  const heroMatch = chooseTeamSide(source.image, layout, referenceFeatures);
  if (heroMatch.average < 0.42 || heroMatch.minimum < 0.22 || heroMatch.sideGap < 0.006) {
    throw new Error(`${label} does not match the supported full-width result layout clearly enough. Use the original frame without cropping or row-covering overlays.`);
  }
  const group = layout.rowGroup[heroMatch.side];
  const fields = Object.keys(layout.fieldWidth);
  const rows = picks.map((pick, pickIndex) => ({
    pickIndex,
    hero: pick.hero,
    player: pick.player,
    playerId: pick.playerId || "",
    iconConfidence: 0,
    values: {},
    fieldConfidence: {},
    raw: {},
    evidence: {},
    ir: null,
    irConfidence: 0,
    irRaw: "",
    irDisagreement: false,
    badgeMetrics: null,
    fastPath: false,
  }));

  for (const match of heroMatch.matches) {
    throwIfScanAborted(signal);
    const outputRow = rows[match.heroIndex];
    outputRow.iconConfidence = Math.round(match.score * 100);
    const rowCenterY = layout.rows[match.rowIndex];
    const sequence = await recognizeIntegerSequence(
      worker,
      source.image,
      normalizedRowGroupRectangle(layout, heroMatch.side, rowCenterY),
      group.fields,
      signal,
    );
    progressState.completed += 1;
    const plausibleSequence = sequence.complete;

    if (kind === "data") {
      progressState.total += fields.length;
      for (const field of fields) {
        const rectangleOptions = buildLocalDamageFieldRectangles(heroMatch.side, field, rowCenterY);
        const seedCandidates = damageFieldCandidatesFromSequence(sequence.candidates || [], group.fields, field);
        const recognized = await recognizeDamageField(worker, source.image, rectangleOptions, field, signal, seedCandidates);
        outputRow.values[field] = recognized.value;
        outputRow.fieldConfidence[field] = Math.round(recognized.confidence);
        outputRow.raw[field] = recognized.raw;
        outputRow.evidence[field] = {
          sourceKind: kind,
          geometry: recognized.geometry || "",
          side: heroMatch.side,
          rowIndex: match.rowIndex,
          field,
          rectangle: recognized.rectangle || rectangleOptions[0].rectangle,
          candidates: recognized.candidates || [],
        };
        progressState.completed += 1;
      }
      outputRow.fastPath = fields.every((field) => outputRow.fieldConfidence[field] >= OCR_TARGET_CONFIDENCE);
    } else if (plausibleSequence) {
      outputRow.fastPath = true;
      group.fields.forEach((field, index) => {
        if (!PLAYER_RESULT_KEYS.includes(field)) return;
        outputRow.values[field] = sequence.values[index];
        outputRow.fieldConfidence[field] = Math.round(sequence.confidence);
        outputRow.raw[field] = sequence.text;
        outputRow.evidence[field] = {
          sourceKind: kind,
          geometry: "row-sequence",
          side: heroMatch.side,
          rowIndex: match.rowIndex,
          field,
          rectangle: normalizedFieldRectangle(layout, heroMatch.side, field, rowCenterY),
          candidates: sequence.candidates || [],
        };
      });
    } else {
      const fallbackFields = kind === "scoreboard" ? fields.filter((field) => field !== "gold") : fields;
      progressState.total += fallbackFields.length;
      for (const field of fallbackFields) {
        const rectangle = normalizedFieldRectangle(layout, heroMatch.side, field, rowCenterY);
        const recognized = await recognizeIntegerCell(worker, source.image, rectangle, field, signal);
        outputRow.values[field] = recognized.value;
        outputRow.fieldConfidence[field] = Math.round(recognized.confidence);
        outputRow.raw[field] = recognized.raw;
        outputRow.evidence[field] = {
          sourceKind: kind,
          geometry: recognized.geometry || "",
          side: heroMatch.side,
          rowIndex: match.rowIndex,
          field,
          rectangle,
          candidates: recognized.candidates || [],
        };
        progressState.completed += 1;
      }
    }
    if (kind === "scoreboard") {
      progressState.total += 1;
      const gold = await recognizeGoldCell(worker, source.image, heroMatch.side, rowCenterY, signal);
      const sequenceGoldIndex = group.fields.indexOf("gold");
      const sequenceGold = plausibleSequence && sequenceGoldIndex >= 0 ? sequence.values[sequenceGoldIndex] : null;
      const sequenceDisagrees = sequenceGold !== null && gold.value !== sequenceGold;
      outputRow.values.gold = sequenceDisagrees && gold.confidence < 90 ? null : gold.value;
      outputRow.fieldConfidence.gold = sequenceDisagrees ? Math.min(95, gold.confidence) : Math.round(gold.confidence);
      outputRow.raw.gold = gold.raw;
      outputRow.evidence.gold = {
        sourceKind: kind,
        geometry: gold.geometry || "",
        side: heroMatch.side,
        rowIndex: match.rowIndex,
        field: "gold",
        rectangle: gold.rectangle,
        candidates: gold.candidates || [],
      };
      progressState.completed += 1;
      const ratingRectangles = normalizedIrRectangles(layout, heroMatch.side, rowCenterY, source.image);
      const rating = await recognizeRating(
        worker,
        source.image,
        ratingRectangles,
        signal,
      );
      outputRow.ir = rating.value;
      outputRow.irConfidence = Math.round(rating.confidence);
      outputRow.irRaw = rating.raw;
      outputRow.irDisagreement = rating.disagreement;
      outputRow.evidence.ir = {
        sourceKind: kind,
        geometry: rating.geometry || "",
        side: heroMatch.side,
        rowIndex: match.rowIndex,
        field: "ir",
        rectangle: ratingRectangles[0].rectangle,
        candidates: rating.candidates || [],
      };
      outputRow.badgeMetrics = measureBestMvpBadgeAppearance(
        source.image,
        normalizedMvpBadgeRectangles(layout, heroMatch.side, rowCenterY),
      );
      progressState.completed += 1;
    }
    onProgress?.({
      stage: "numbers",
      message: `Reading ${outputRow.hero} ${kind === "scoreboard" ? "K/D/A, Gold, and IR" : "damage stats"}…`,
      progress: progressState.completed / progressState.total,
    });
  }

  let duration = null;
  let teamKills = null;
  let opponentTeamKills = null;
  const opponentSide = heroMatch.side === "left" ? "right" : "left";
  if (kind === "scoreboard") {
    duration = await recognizeDuration(worker, source.image, layout.duration, signal);
    progressState.completed += 1;
    const rowKillValues = rows.map((row) => row.values.kills);
    const expectedTeamKills = rowKillValues.every(Number.isSafeInteger)
      ? rowKillValues.reduce((total, value) => total + value, 0)
      : null;
    const rowDeathValues = rows.map((row) => row.values.deaths);
    const expectedOpponentKills = rowDeathValues.every(Number.isSafeInteger)
      ? rowDeathValues.reduce((total, value) => total + value, 0)
      : null;
    teamKills = await recognizeTeamKillScore(
      worker,
      source.image,
      normalizedTeamKillRectangles(layout, heroMatch.side, source.image),
      expectedTeamKills,
      signal,
    );
    progressState.completed += 1;
    opponentTeamKills = await recognizeTeamKillScore(
      worker,
      source.image,
      normalizedTeamKillRectangles(layout, opponentSide, source.image),
      expectedOpponentKills,
      signal,
    );
    progressState.completed += 1;
    onProgress?.({ stage: "numbers", message: "Checking duration and team kills…", progress: progressState.completed / progressState.total });
  }

  const mvpResolution = kind === "scoreboard" ? resolveLocalMvpCandidate(rows) : null;
  const mvpRow = mvpResolution?.pickIndex === null || mvpResolution?.pickIndex === undefined
    ? null
    : rows.find((row) => row.pickIndex === mvpResolution.pickIndex);
  const badgeTone = mvpRow ? classifyLocalMvpBadgeTone(mvpRow.badgeMetrics) : { tone: "", confidence: 0 };
  const opponentBadgeResolution = kind === "scoreboard"
    ? resolveLocalBadgeVisualCandidate(layout.rows.map((rowCenterY, rowIndex) => ({
      rowIndex,
      badgeMetrics: measureBestMvpBadgeAppearance(
        source.image,
        normalizedMvpBadgeRectangles(layout, opponentSide, rowCenterY),
      ),
    })))
    : null;
  const opponentBadgeTone = opponentBadgeResolution?.candidate
    ? classifyLocalMvpBadgeTone(opponentBadgeResolution.candidate.badgeMetrics)
    : { tone: "", confidence: 0 };

  return {
    ...entry,
    heroMatch,
    rows,
    duration,
    teamKills,
    opponentTeamKills,
    mvpResolution,
    badgeTone,
    badgeMetrics: mvpRow?.badgeMetrics || null,
    opponentBadgeResolution,
    opponentBadgeTone,
    opponentBadgeMetrics: opponentBadgeResolution?.candidate?.badgeMetrics || null,
  };
}

function mergeScreenRows(picks, screenResults) {
  return picks.map((pick, pickIndex) => {
    const merged = {
      pickIndex,
      hero: pick.hero,
      player: pick.player,
      playerId: pick.playerId || "",
      iconConfidence: 100,
      values: {},
      fieldConfidence: {},
      raw: {},
      evidence: {},
      ir: null,
      irConfidence: 0,
      irRaw: "",
      irDisagreement: false,
    };
    screenResults.forEach((screenResult) => {
      const row = screenResult.rows[pickIndex];
      merged.iconConfidence = Math.min(merged.iconConfidence, row.iconConfidence);
      PLAYER_RESULT_KEYS.forEach((field) => {
        if (!(field in row.values)) return;
        merged.values[field] = row.values[field];
        merged.fieldConfidence[field] = row.fieldConfidence[field];
        merged.raw[field] = row.raw[field];
        merged.evidence[field] = row.evidence[field];
      });
      if (screenResult.kind === "scoreboard") {
        merged.ir = row.ir;
        merged.irConfidence = row.irConfidence;
        merged.irRaw = row.irRaw;
        merged.irDisagreement = row.irDisagreement;
        merged.evidence.ir = row.evidence.ir;
      }
    });
    return merged;
  });
}

export async function assignLocalBatchResultScreens({
  files = [],
  games = [],
  heroIcons = {},
  availableGameIndexesByKind = {},
  onProgress,
  signal: externalSignal,
} = {}) {
  const screenshots = Array.from(files || []);
  if (!screenshots.length) throw new Error("Choose at least one result screenshot to auto-match.");
  screenshots.forEach(assertLocalScannerFile);

  const eligibleGames = games.map((game, gameIndex) => ({
    game,
    gameIndex,
    draftError: validateLocalScannerDraft(game?.ourPicks || [], heroIcons),
  })).filter((entry) => !entry.draftError);
  if (!eligibleGames.length) throw new Error("Complete five team hero picks in at least one game before auto-matching screenshots.");

  const allowedGameIndexes = (kind) => {
    const configured = availableGameIndexesByKind?.[kind];
    const allowed = Array.isArray(configured) ? new Set(configured.map(Number)) : null;
    return eligibleGames.filter((entry) => !allowed || allowed.has(entry.gameIndex));
  };

  const matchController = new AbortController();
  const relayAbort = () => matchController.abort(scanAbortError(externalSignal));
  if (externalSignal?.aborted) relayAbort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });
  const matchTimer = setTimeout(() => matchController.abort(new Error(
    "Batch screenshot matching reached its two-minute safety limit. Retry with fewer files or assign the remaining screenshots manually.",
  )), SCAN_MAX_RUNTIME_MS);
  const { signal } = matchController;
  const loadedScreens = [];
  let workerBundle;

  try {
    for (let index = 0; index < screenshots.length; index += 1) {
      const file = screenshots[index];
      onProgress?.({ stage: "batch-match", message: `Preparing ${file.name || `screenshot ${index + 1}`}…`, progress: index / Math.max(1, screenshots.length * 3) });
      const source = await loadImageSource(file, { signal, label: file.name || "Screenshot" });
      loadedScreens.push({ file, fileIndex: index, source });
      assertSupportedImage(source.image, file.name || "Screenshot");
    }

    workerBundle = await acquireNumericWorker(onProgress, signal);
    await configureOcr(workerBundle.worker, workerBundle.PSM, "text", signal);
    const analyzed = [];
    for (let index = 0; index < loadedScreens.length; index += 1) {
      const entry = loadedScreens[index];
      onProgress?.({
        stage: "batch-match",
        message: `Reading the screen type in ${entry.file.name || `screenshot ${index + 1}`}…`,
        progress: (screenshots.length + index) / Math.max(1, screenshots.length * 3),
      });
      const detection = await detectLocalResultScreen(workerBundle.worker, entry.file, entry.source.image, signal);
      analyzed.push({ ...entry, kind: detection.detectedKind, detection });
    }

    const neededGameIndexes = new Set(
      ["scoreboard", "data"].flatMap((kind) => allowedGameIndexes(kind).map((entry) => entry.gameIndex)),
    );
    const referenceFeaturesByGame = new Map();
    const referenceGames = eligibleGames.filter((entry) => neededGameIndexes.has(entry.gameIndex));
    for (let index = 0; index < referenceGames.length; index += 1) {
      const entry = referenceGames[index];
      onProgress?.({
        stage: "batch-match",
        message: `Preparing the Game ${entry.gameIndex + 1} hero draft…`,
        progress: Math.min(0.8, (screenshots.length * 2 + index) / Math.max(1, screenshots.length * 3 + referenceGames.length)),
      });
      referenceFeaturesByGame.set(
        entry.gameIndex,
        await buildReferenceFeatures(entry.game.ourPicks || [], heroIcons, signal),
      );
    }

    const heroMatchCache = new Map();
    const getHeroMatch = (fileEntry, gameEntry) => {
      const cacheKey = `${fileEntry.fileIndex}:${gameEntry.gameIndex}`;
      if (!heroMatchCache.has(cacheKey)) {
        heroMatchCache.set(cacheKey, chooseTeamSide(
          fileEntry.source.image,
          RESULT_LAYOUT[fileEntry.kind] || RESULT_LAYOUT.scoreboard,
          referenceFeaturesByGame.get(gameEntry.gameIndex),
        ));
      }
      return heroMatchCache.get(cacheKey);
    };

    const assignments = [];
    const unmatchedByFile = new Map();

    for (const kind of ["scoreboard", "data"]) {
      const kindEntries = analyzed.filter((entry) => entry.kind === kind);
      if (!kindEntries.length) continue;
      const candidateGames = allowedGameIndexes(kind).filter((entry) => referenceFeaturesByGame.has(entry.gameIndex));
      if (!candidateGames.length) {
        kindEntries.forEach((entry) => unmatchedByFile.set(entry.fileIndex, {
          file: entry.file,
          kind,
          reason: `No empty ${kind === "scoreboard" ? "K/D/A + Gold" : "Damage"} slot is available.`,
        }));
        continue;
      }

      const matchDetails = kindEntries.map((entry, fileIndex) => candidateGames.map((gameEntry, gameIndex) => {
        const heroMatch = getHeroMatch(entry, gameEntry);
        onProgress?.({
          stage: "batch-match",
          message: `Comparing ${entry.file.name || `screenshot ${fileIndex + 1}`} with Game ${gameEntry.gameIndex + 1}…`,
          progress: Math.min(0.98, 0.8 + ((fileIndex * candidateGames.length + gameIndex + 1) / Math.max(1, kindEntries.length * candidateGames.length)) * 0.18),
        });
        return heroMatch;
      }));
      const scoreMatrix = matchDetails.map((row) => row.map((heroMatch) => heroMatch.trusted ? heroMatch.average : null));
      const resolution = resolveLocalBatchGameAssignments(scoreMatrix);
      const acceptedFileIndexes = new Set();
      resolution.matches.forEach((match) => {
        const fileEntry = kindEntries[match.fileIndex];
        const gameEntry = candidateGames[match.gameIndex];
        const heroMatch = matchDetails[match.fileIndex][match.gameIndex];
        if (match.ambiguous) {
          unmatchedByFile.set(fileEntry.fileIndex, {
            file: fileEntry.file,
            kind,
            reason: "Hero lineup is too similar across multiple games; assign this screenshot manually.",
          });
          return;
        }
        acceptedFileIndexes.add(match.fileIndex);
        assignments.push({
          file: fileEntry.file,
          kind,
          gameIndex: gameEntry.gameIndex,
          confidence: Math.round(heroMatch.average * 100),
          minimumConfidence: Math.round(heroMatch.minimum * 100),
          side: heroMatch.side,
          heroOrder: heroMatch.matches.slice().sort((left, right) => left.rowIndex - right.rowIndex).map((item) => item.heroIndex),
          detectionSource: fileEntry.detection.source || "screen OCR",
        });
      });
      kindEntries.forEach((entry, fileIndex) => {
        if (acceptedFileIndexes.has(fileIndex) || unmatchedByFile.has(entry.fileIndex)) return;
        const hasTrustedCandidate = scoreMatrix[fileIndex]?.some((score) => Number.isFinite(score));
        unmatchedByFile.set(entry.fileIndex, {
          file: entry.file,
          kind,
          reason: hasTrustedCandidate
            ? "Another screenshot was a stronger global match for the available game slots; check for a duplicate or assign it manually."
            : "The five hero icons did not match any available game draft strongly enough.",
        });
      });
    }

    const unknownEntries = analyzed.filter((entry) => !entry.kind);
    if (unknownEntries.length) {
      const occupiedSlots = new Set(assignments.map((assignment) => `${assignment.gameIndex}:${assignment.kind}`));
      const candidateSlots = ["scoreboard", "data"].flatMap((kind) => allowedGameIndexes(kind)
        .filter((gameEntry) => referenceFeaturesByGame.has(gameEntry.gameIndex) && !occupiedSlots.has(`${gameEntry.gameIndex}:${kind}`))
        .map((gameEntry) => ({ kind, gameEntry })));

      if (!candidateSlots.length) {
        unknownEntries.forEach((entry) => unmatchedByFile.set(entry.fileIndex, {
          file: entry.file,
          kind: "",
          reason: "Screen label was not readable and no empty result slot remains.",
        }));
      } else {
        const matchDetails = unknownEntries.map((entry, fileIndex) => candidateSlots.map((slot, slotIndex) => {
          const heroMatch = getHeroMatch(entry, slot.gameEntry);
          onProgress?.({
            stage: "batch-match",
            message: `Pairing ${entry.file.name || `screenshot ${fileIndex + 1}`} from its hero lineup…`,
            progress: Math.min(0.99, 0.94 + ((fileIndex * candidateSlots.length + slotIndex + 1) / Math.max(1, unknownEntries.length * candidateSlots.length)) * 0.05),
          });
          return heroMatch;
        }));
        const scoreMatrix = matchDetails.map((row) => row.map((heroMatch) => heroMatch.trusted ? heroMatch.average : null));
        const resolution = resolveLocalBatchGameAssignments(scoreMatrix);
        const acceptedFileIndexes = new Set();
        resolution.matches.forEach((match) => {
          const fileEntry = unknownEntries[match.fileIndex];
          const slot = candidateSlots[match.gameIndex];
          const heroMatch = matchDetails[match.fileIndex][match.gameIndex];
          if (match.ambiguous) {
            unmatchedByFile.set(fileEntry.fileIndex, {
              file: fileEntry.file,
              kind: "",
              reason: "Screen label was not readable and the remaining hero-draft destination is ambiguous; assign it manually.",
            });
            return;
          }
          acceptedFileIndexes.add(match.fileIndex);
          assignments.push({
            file: fileEntry.file,
            kind: slot.kind,
            gameIndex: slot.gameEntry.gameIndex,
            confidence: Math.round(heroMatch.average * 100),
            minimumConfidence: Math.round(heroMatch.minimum * 100),
            side: heroMatch.side,
            heroOrder: heroMatch.matches.slice().sort((left, right) => left.rowIndex - right.rowIndex).map((item) => item.heroIndex),
            detectionSource: "paired hero inference",
          });
        });
        unknownEntries.forEach((entry, fileIndex) => {
          if (acceptedFileIndexes.has(fileIndex) || unmatchedByFile.has(entry.fileIndex)) return;
          const hasTrustedCandidate = scoreMatrix[fileIndex]?.some((score) => Number.isFinite(score));
          unmatchedByFile.set(entry.fileIndex, {
            file: entry.file,
            kind: "",
            reason: hasTrustedCandidate
              ? "Screen label was not readable and another screenshot was a stronger match for the remaining slot; assign it manually."
              : `Screen label was not readable (OCR raw: ${entry.detection.raw || "not read"}) and its five heroes did not match an available game strongly enough.`,
          });
        });
      }
    }

    onProgress?.({ stage: "batch-match", message: `Matched ${assignments.length}/${screenshots.length} screenshots by hero draft.`, progress: 1 });
    return {
      assignments,
      unmatched: [...unmatchedByFile.values()],
    };
  } finally {
    clearTimeout(matchTimer);
    externalSignal?.removeEventListener("abort", relayAbort);
    loadedScreens.forEach((entry) => entry.source.release());
    if (signal.aborted) discardNumericWorker();
    else if (workerBundle) releaseNumericWorkerLater();
  }
}

export async function scanLocalResultScreens({ scoreboardFile, dataFile, picks, heroIcons, onProgress, signal: externalSignal }) {
  const draftError = validateLocalScannerDraft(picks, heroIcons);
  if (draftError) throw new Error(draftError);
  if (!scoreboardFile && !dataFile) throw new Error("Choose the K/D/A + Gold screen, the Damage screen, or both.");

  const requestedScreens = [
    scoreboardFile ? { file: scoreboardFile, hint: "scoreboard" } : null,
    dataFile ? { file: dataFile, hint: "data" } : null,
  ].filter(Boolean);
  requestedScreens.forEach(({ file }) => assertLocalScannerFile(file));

  const scanController = new AbortController();
  const relayAbort = () => scanController.abort(scanAbortError(externalSignal));
  if (externalSignal?.aborted) relayAbort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });
  const scanTimer = setTimeout(() => scanController.abort(new Error(
    "The local scan reached its two-minute safety limit and was stopped. Retry once; if it stops again, refresh the page before scanning.",
  )), SCAN_MAX_RUNTIME_MS);
  const { signal } = scanController;

  const loadedScreens = [];
  let workerBundle;
  try {
    throwIfScanAborted(signal);
    for (const requested of requestedScreens) {
      const source = await loadImageSource(requested.file, { signal, label: requested.file.name || "Screenshot" });
      loadedScreens.push({ ...requested, source });
      assertSupportedImage(source.image, requested.file.name || "Screenshot");
    }

    workerBundle = await acquireNumericWorker(onProgress, signal);
    const { worker, PSM } = workerBundle;
    const progressState = { completed: 0, total: requestedScreens.length };
    await configureOcr(worker, PSM, "text", signal);
    const detections = [];
    for (const entry of loadedScreens) {
      onProgress?.({ stage: "detect", message: `Identifying ${entry.file.name || "screenshot"}…`, progress: progressState.completed / progressState.total });
      const detection = await detectLocalResultScreen(worker, entry.file, entry.source.image, signal);
      progressState.completed += 1;
      detections.push(attachLocalScreenDetection(entry, detection));
    }
    const resolvedScreens = resolveLocalResultScreenKinds(detections);
    progressState.total += resolvedScreens.reduce((total, entry) => total + (entry.kind === "scoreboard" ? 13 : 5), 0);

    await configureOcr(worker, PSM, "numeric", signal);
    onProgress?.({ stage: "heroes", message: "Preparing our hero references…", progress: progressState.completed / progressState.total });
    const referenceFeatures = await buildReferenceFeatures(picks, heroIcons, signal);
    const screenResults = [];
    for (const entry of resolvedScreens) {
      screenResults.push(await scanScreen({ entry, picks, referenceFeatures, worker, onProgress, progressState, signal }));
    }

    const warnings = [];
    if (screenResults.length === 2) {
      const heroOrders = screenResults.map((screenResult) => screenResult.heroMatch.matches
        .slice()
        .sort((left, right) => left.rowIndex - right.rowIndex)
        .map((match) => match.heroIndex)
        .join(","));
      const sideMismatch = screenResults[0].heroMatch.side !== screenResults[1].heroMatch.side;
      const heroOrderMismatch = heroOrders[0] !== heroOrders[1];
      if ((sideMismatch || heroOrderMismatch) && screenResults.every((screenResult) => screenResult.heroMatch.trusted)) {
        throw new Error("The two screenshots do not appear to show the same team lineup. Choose both result tabs from the same game.");
      }
      if (sideMismatch || heroOrderMismatch) warnings.push("The two result tabs produced different lineup mappings. Check that both screenshots are from the same game.");
    }
    screenResults.forEach((screenResult) => {
      const screenLabel = screenResult.kind === "scoreboard" ? "K/D/A + Gold" : "Damage";
      if (screenResult.detectionSource !== "detected") {
        warnings.push(`${screenResult.file.name || screenLabel}: screen type used ${screenResult.detectionSource}; check that the correct result screen was selected.`);
      }
      if (!screenResult.heroMatch.trusted) warnings.push(`${screenLabel}: hero matching needs a manual visual check.`);
      screenResult.rows.forEach((row) => {
        Object.entries(row.values).forEach(([field, value]) => {
          if (value === null) warnings.push(`${screenLabel}: ${row.hero} ${field === "damageTaken" ? "damage taken" : field} was not read.`);
          else if (value > FIELD_LIMITS[field]) warnings.push(`${screenLabel}: ${row.hero} ${field === "damageTaken" ? "damage taken" : field} is outside the expected range.`);
          else if ((row.fieldConfidence[field] || 0) < OCR_TARGET_CONFIDENCE) warnings.push(`${screenLabel}: ${row.hero} ${field === "damageTaken" ? "damage taken" : field} is below the 99% trusted-confidence gate.`);
        });
        if (screenResult.kind === "scoreboard") {
          if (row.ir === null) warnings.push(`K/D/A + Gold: ${row.hero} IR grade was not read.`);
          else if (row.irDisagreement) warnings.push(`K/D/A + Gold: ${row.hero} IR passes disagree; verify the highlighted grade.`);
          else if ((row.irConfidence || 0) < OCR_TARGET_CONFIDENCE) warnings.push(`K/D/A + Gold: ${row.hero} IR grade is below the 99% trusted-confidence gate.`);
        }
      });
    });

    const scoreboardResult = screenResults.find((result) => result.kind === "scoreboard");
    const outcomeResolution = scoreboardResult
      ? resolveLocalMatchOutcome({
        badgeTone: scoreboardResult.badgeTone?.tone || "",
        badgeConfidence: scoreboardResult.badgeTone?.confidence || 0,
        badgeCandidateConfidence: scoreboardResult.mvpResolution?.visualConfidence || 0,
        opponentBadgeTone: scoreboardResult.opponentBadgeTone?.tone || "",
        opponentBadgeConfidence: scoreboardResult.opponentBadgeTone?.confidence || 0,
        opponentBadgeCandidateConfidence: scoreboardResult.opponentBadgeResolution?.confidence || 0,
        badgeMetrics: scoreboardResult.badgeMetrics,
        opponentBadgeMetrics: scoreboardResult.opponentBadgeMetrics,
      })
      : { result: "", confidence: 0, trusted: false, source: "not scanned" };
    const mvpResolution = scoreboardResult?.mvpResolution || { pickIndex: null, confidence: 0, trusted: false, reason: "not scanned" };
    const mvpRow = mvpResolution.pickIndex === null
      ? null
      : scoreboardResult?.rows.find((row) => row.pickIndex === mvpResolution.pickIndex);
    if (mvpRow && !mvpResolution.trusted) warnings.push(`K/D/A + Gold: ${mvpRow.player} is the MVP candidate (${mvpResolution.reason}), but confidence is not high enough. Verify the badge manually or leave MVP blank.`);
    if (scoreboardResult && !outcomeResolution.result) warnings.push("K/D/A + Gold: Win/Loss could not be confirmed from the two teams' MVP badges.");
    else if (scoreboardResult && !outcomeResolution.trusted) warnings.push(`K/D/A + Gold: ${outcomeResolution.result} was inferred from the ${outcomeResolution.source}; verify it manually.`);
    const scannedKillValues = scoreboardResult?.rows.map((row) => row.values.kills);
    const playerKillTotal = scannedKillValues?.every(Number.isSafeInteger)
      ? scannedKillValues.reduce((total, value) => total + value, 0)
      : null;
    const headerTeamKills = scoreboardResult?.teamKills?.value ?? null;
    const opponentTeamKills = scoreboardResult?.opponentTeamKills?.value ?? null;
    if (scoreboardResult?.teamKills?.disagreement) warnings.push("K/D/A + Gold: the OCR passes disagree on the team score beside Victory. Verify the highlighted value.");
    else if (scoreboardResult && headerTeamKills === null) warnings.push("K/D/A + Gold: the team score on our side was not read.");
    else if ((scoreboardResult?.teamKills?.confidence || 0) < OCR_TARGET_CONFIDENCE) warnings.push("K/D/A + Gold: the team score on our side is below the 99% trusted-confidence gate.");
    const mergedRows = mergeScreenRows(picks, screenResults);
    findLocalScanAnomalies({ rows: mergedRows, teamKills: headerTeamKills, opponentTeamKills })
      .forEach((warning) => warnings.push(`Result anomaly: ${warning}`));
    const requiredFields = [
      ...(scoreboardResult ? ["kills", "deaths", "assists", "gold"] : []),
      ...(screenResults.some((result) => result.kind === "data") ? ["damage", "damageTaken"] : []),
    ];
    return {
      rows: mergedRows,
      duration: scoreboardResult?.duration?.value || "",
      durationConfidence: scoreboardResult?.duration?.confidence || 0,
      durationRaw: scoreboardResult?.duration?.raw || "",
      result: outcomeResolution.result,
      resultConfidence: outcomeResolution.confidence,
      resultSource: outcomeResolution.source,
      mvp: mvpRow?.player || "",
      mvpPlayerId: mvpRow?.playerId || "",
      mvpPickIndex: mvpRow?.pickIndex ?? null,
      mvpConfidence: mvpResolution.confidence,
      mvpTrusted: mvpResolution.trusted,
      mvpSource: mvpResolution.source,
      teamKills: headerTeamKills,
      teamKillsConfidence: scoreboardResult?.teamKills?.confidence || 0,
      teamKillsRaw: scoreboardResult?.teamKills?.raw || "",
      opponentTeamKills,
      opponentTeamKillsConfidence: scoreboardResult?.opponentTeamKills?.confidence || 0,
      opponentTeamKillsRaw: scoreboardResult?.opponentTeamKills?.raw || "",
      playerKillTotal,
      detectedKinds: screenResults.map((result) => result.kind),
      requiredFields,
      sourceFiles: Object.fromEntries(screenResults.map((screenResult) => [screenResult.kind, screenResult.file])),
      warnings: [...new Set(warnings)],
      diagnostics: screenResults.map((result) => ({
        kind: result.kind,
        fileName: result.file.name || "Screenshot",
        detectionSource: result.detectionSource,
        side: result.heroMatch.side,
        heroConfidence: Math.round(result.heroMatch.average * 100),
        trusted: result.heroMatch.trusted,
        fastRows: result.rows.filter((row) => row.fastPath).length,
      })),
    };
  } finally {
    clearTimeout(scanTimer);
    externalSignal?.removeEventListener("abort", relayAbort);
    loadedScreens.forEach((entry) => entry.source.release());
    if (signal.aborted) discardNumericWorker();
    else if (workerBundle) releaseNumericWorkerLater();
  }
}
