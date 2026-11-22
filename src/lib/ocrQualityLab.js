const PREFIX = "scrim-log-ocr-quality-v1";
const MAX_SAMPLES = 4000;

export function canStoreOcrQualitySamples(storage) {
  try {
    const target = storage || globalThis.localStorage;
    const key = `${PREFIX}:storage-check`;
    target.setItem(key, "1");
    target.removeItem(key);
    return true;
  } catch { return false; }
}

export function buildOcrQualitySamples(result, reviewed) {
  const samples = [];
  const append = (field, recognized, verified, confidence, evidence = {}) => {
    const finalValue = String(verified ?? "").trim();
    if (!finalValue) return;
    const originalValue = String(recognized ?? "").trim();
    samples.push({
      field, recognized: originalValue, verified: finalValue,
      confidence: Math.max(0, Math.min(100, Number(confidence) || 0)),
      sourceKind: evidence.sourceKind || "scoreboard",
      geometry: String(evidence.geometry || "").slice(0, 40),
      outcome: !originalValue ? "missed" : originalValue === finalValue ? "match" : "corrected",
    });
  };
  const originalRows = new Map((result.rows || []).map((row) => [String(row.pickIndex), row]));
  (reviewed.rows || []).forEach((row) => {
    const original = originalRows.get(String(row.pickIndex));
    if (!original) return;
    (result.requiredFields || []).forEach((field) => append(field, original.values?.[field], row.values?.[field], original.fieldConfidence?.[field], original.evidence?.[field]));
    if (result.detectedKinds?.includes("scoreboard")) append("ir", original.ir, row.ir, original.irConfidence, original.evidence?.ir);
  });
  if (result.detectedKinds?.includes("scoreboard")) {
    append("duration", result.duration, reviewed.duration, result.durationConfidence);
    append("teamKills", result.teamKills, reviewed.teamKills, result.teamKillsConfidence);
    if (reviewed.opponentTeamKills !== null && reviewed.opponentTeamKills !== "") append("opponentTeamKills", result.opponentTeamKills, reviewed.opponentTeamKills, result.opponentTeamKillsConfidence);
    append("result", result.result, reviewed.result, result.resultConfidence);
  }
  return samples;
}

const storageKey = (scope) => `${PREFIX}:${scope || "local"}`;

export function readOcrQualitySamples(scope, storage) {
  try {
    const value = JSON.parse((storage || globalThis.localStorage).getItem(storageKey(scope)) || "[]");
    return Array.isArray(value) ? value.filter((row) => row && typeof row.field === "string" && typeof row.outcome === "string") : [];
  } catch { return []; }
}

export function appendOcrQualitySamples(scope, samples, storage) {
  const target = storage || globalThis.localStorage;
  const next = [...readOcrQualitySamples(scope, storage), ...samples.map((sample) => ({ ...sample, reviewedAt: new Date().toISOString() }))].slice(-MAX_SAMPLES);
  target.setItem(storageKey(scope), JSON.stringify(next));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("scrim-log-ocr-quality-updated", { detail: { scope } }));
  return next;
}

export function clearOcrQualitySamples(scope, storage) {
  (storage || globalThis.localStorage).removeItem(storageKey(scope));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("scrim-log-ocr-quality-updated", { detail: { scope } }));
}

export function summarizeOcrQuality(samples = []) {
  const fields = new Map();
  samples.forEach((sample) => {
    const row = fields.get(sample.field) || { field: sample.field, total: 0, matched: 0, corrected: 0, missed: 0, highConfidenceErrors: 0 };
    row.total += 1;
    if (sample.outcome === "match") row.matched += 1;
    if (sample.outcome === "corrected") row.corrected += 1;
    if (sample.outcome === "missed") row.missed += 1;
    if (sample.outcome !== "match" && sample.confidence >= 90) row.highConfidenceErrors += 1;
    fields.set(sample.field, row);
  });
  return [...fields.values()].sort((a, b) => b.corrected + b.missed - a.corrected - a.missed || a.field.localeCompare(b.field));
}

export function summarizeOcrCropErrors(samples = []) {
  const paths = new Map();
  samples.filter((sample) => sample.outcome !== "match").forEach((sample) => {
    const path = `${sample.field} · ${sample.sourceKind || "unknown"} · ${sample.geometry || "unspecified crop"}`;
    paths.set(path, (paths.get(path) || 0) + 1);
  });
  return [...paths.entries()].map(([path, errors]) => ({ path, errors })).sort((a, b) => b.errors - a.errors || a.path.localeCompare(b.path)).slice(0, 5);
}
